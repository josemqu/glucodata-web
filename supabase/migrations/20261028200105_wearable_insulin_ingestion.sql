-- Permisos exclusivos del reloj: nunca amplían los tokens de lectura existentes.
create table public.wear_tokens (
 user_id uuid not null,
 patient_id text not null,
 token_hash text not null unique,
 expires_at timestamptz not null,
 primary key (user_id,patient_id),
 foreign key(user_id,patient_id) references public.user_patients(user_id,patient_id) on delete cascade
);
create table public.wear_receipts (
 user_id uuid not null references public.app_users(id) on delete cascade,
 patient_id text not null,
 request_id uuid not null,
 payload jsonb not null,
 event_id uuid not null,
 primary key(user_id,patient_id,request_id)
);
alter table public.wear_tokens enable row level security;
alter table public.wear_receipts enable row level security;
revoke all on public.wear_tokens, public.wear_receipts from anon, authenticated;
grant all on public.wear_tokens, public.wear_receipts to service_role;

-- Un recibo sobrevive a edición/eliminación del evento y evita recrearlo.
-- SECURITY INVOKER: la ruta del servidor ya autenticó el permiso del reloj.
create function public.record_wear_dose(p_user_id uuid, p_patient_id text, p_id uuid,
 p_occurred_at timestamptz, p_name text, p_insulin_type text, p_units integer)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
 v_payload jsonb := jsonb_build_object('occurred_at',p_occurred_at,'name',p_name,'insulin_type',p_insulin_type,'units',p_units);
 v_previous public.wear_receipts;
 v_event_id uuid := gen_random_uuid();
begin
 if p_units is null or p_units < 1 or p_units > 250 or p_occurred_at is null
   or p_occurred_at > now() + interval '5 minutes' or p_name is null
   or char_length(trim(p_name)) not between 1 and 80
   or p_insulin_type is null or p_insulin_type not in ('rapid','long','ultra_long','intermediate') then
   raise exception 'Invalid dose' using errcode = '22023';
 end if;
 if not exists(select 1 from public.user_patients where user_id=p_user_id and patient_id=p_patient_id) then
   raise exception 'Invalid owner' using errcode = '22023';
 end if;
 -- Serializa envíos concurrentes de la misma solicitud dentro de la transacción.
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_patient_id || ':' || p_id::text,0));
 select * into v_previous from public.wear_receipts
 where user_id=p_user_id and patient_id=p_patient_id and request_id=p_id;
 if found then
   if v_previous.payload <> v_payload then raise exception 'Request identity reused' using errcode = '23505'; end if;
   return v_previous.event_id;
 end if;
 if not exists(select 1 from public.patient_insulins where user_id=p_user_id and patient_id=p_patient_id
   and name=p_name and insulin_type=p_insulin_type) then
   raise exception 'Unknown insulin' using errcode = '22023';
 end if;
 insert into public.events(id,user_id,patient_id,type,occurred_at,title,metadata)
 values(v_event_id,p_user_id,p_patient_id,'insulin',p_occurred_at,'Insulina · ' || p_name,
 jsonb_build_object('source','wear_os','insulin_doses',jsonb_build_array(jsonb_build_object('name',p_name,'insulin_type',p_insulin_type,'units',p_units)),
 'units',p_units,'insulin_name',p_name,'insulin_type',p_insulin_type));
 insert into public.wear_receipts values(p_user_id,p_patient_id,p_id,v_payload,v_event_id);
 return v_event_id;
end $$;
revoke all on function public.record_wear_dose(uuid,text,uuid,timestamptz,text,text,integer) from public, anon, authenticated;
grant execute on function public.record_wear_dose(uuid,text,uuid,timestamptz,text,text,integer) to service_role;
select pg_notify('pgrst','reload schema');
