\set ON_ERROR_STOP on
-- Required psql variables: app_user_id, patient_id, evidence.
-- Run during cutover BEFORE that account starts importing new measurements.
-- No automatic ownership inference and no overwrites on conflict.
begin;
set local lock_timeout='5s';
lock table public.glucose_measurements,public.events,public.foods,public.meal_items,
 public.event_links,public.patient_insulins in share row exclusive mode;
create temporary table ownership_input as select :'app_user_id'::uuid as user_id, :'patient_id'::text as patient_id, :'evidence'::text as evidence;
do $$ begin
 if not exists(select 1 from ownership_input i join public.user_patients p using(user_id,patient_id) where length(trim(i.evidence))>=20) then
  raise exception 'A verified account/patient association and documented ownership evidence are required';
 end if;
end $$;
create temporary table legacy_fingerprints(table_name text primary key,ids uuid[],fingerprint text,row_count bigint);
do $$ declare t text; begin
 foreach t in array array['glucose_measurements','events','foods','meal_items','event_links','patient_insulins'] loop
 execute format('insert into legacy_fingerprints select %L,array_agg(id order by id),md5(string_agg((to_jsonb(r)-''user_id'')::text,'''' order by id)),count(*) from public.%I r where user_id is null and patient_id=(select patient_id from ownership_input)',t,t);
 end loop;
end $$;
-- FK parent rows first. Any uniqueness conflict rolls back the entire backfill.
do $$ declare t text; expected text; actual text; begin
 foreach t in array array['glucose_measurements','events','foods','meal_items','event_links','patient_insulins'] loop
 execute format('update public.%I set user_id=(select user_id from ownership_input) where user_id is null and patient_id=(select patient_id from ownership_input)',t);
 select fingerprint into expected from legacy_fingerprints where table_name=t;
 execute format('select md5(string_agg((to_jsonb(r)-''user_id'')::text,'''' order by id)) from public.%I r where id=any((select ids from legacy_fingerprints where table_name=%L)::uuid[])',t,t) into actual;
 if actual is distinct from expected then raise exception 'Payload changed during backfill: %',t; end if;
 end loop;
end $$;
insert into public.legacy_ownership_assignments(user_id,patient_id,evidence,counts)
select i.user_id,i.patient_id,i.evidence,(select jsonb_object_agg(table_name,row_count) from legacy_fingerprints) from ownership_input i;
select table_name,row_count as assigned_rows from legacy_fingerprints order by table_name;
commit;
