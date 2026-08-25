create table public.patient_insulins (
  id uuid primary key default gen_random_uuid(),
  patient_id text not null,
  name text not null check (char_length(trim(name)) between 1 and 80),
  insulin_type text not null check (insulin_type in ('rapid', 'short', 'intermediate', 'long', 'ultra_long', 'other')),
  sort_order smallint not null default 0 check (sort_order between 0 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint patient_insulins_patient_name_unique unique (patient_id, name),
  constraint patient_insulins_patient_order_unique unique (patient_id, sort_order)
);

create index patient_insulins_patient_order_idx on public.patient_insulins (patient_id, sort_order);

alter table public.patient_insulins enable row level security;
revoke all on table public.patient_insulins from anon, authenticated;
grant select, insert, update, delete on table public.patient_insulins to service_role;

comment on table public.patient_insulins is
  'Patient-scoped insulin catalog. Server-only access after LibreLink active-patient validation.';

create or replace function public.replace_patient_insulins(
  p_patient_id text,
  p_insulins jsonb
)
returns setof public.patient_insulins
language plpgsql
security invoker
set search_path = public
as $$
begin
  if jsonb_typeof(p_insulins) <> 'array' or jsonb_array_length(p_insulins) not between 1 and 6 then
    raise exception 'Invalid insulin configuration';
  end if;

  delete from public.patient_insulins where patient_id = p_patient_id;

  insert into public.patient_insulins (patient_id, name, insulin_type, sort_order)
  select
    p_patient_id,
    trim(item->>'name'),
    item->>'insulin_type',
    (item->>'sort_order')::smallint
  from jsonb_array_elements(p_insulins) as item;

  return query
  select * from public.patient_insulins
  where patient_id = p_patient_id
  order by sort_order;
end;
$$;

revoke all on function public.replace_patient_insulins(text, jsonb) from public, anon, authenticated;
grant execute on function public.replace_patient_insulins(text, jsonb) to service_role;

select pg_notify('pgrst', 'reload schema');
