-- Solo una base de pruebas vacía. Nunca ejecutar contra producción.
\set ON_ERROR_STOP on
begin;
create role anon;
create role authenticated;
create role service_role;
create table public.app_users(id uuid primary key);
create table public.user_patients(user_id uuid,patient_id text,primary key(user_id,patient_id));
create table public.patient_insulins(user_id uuid,patient_id text,name text,insulin_type text);
\ir ../supabase/migrations/20260822201903_event_foundation.sql
alter table public.events add column user_id uuid;
\ir ../supabase/migrations/20261028200105_wearable_insulin_ingestion.sql
insert into app_users values('11111111-1111-4111-8111-111111111111');
insert into user_patients values('11111111-1111-4111-8111-111111111111','patient-test');
insert into patient_insulins values('11111111-1111-4111-8111-111111111111','patient-test','Mi rápida','rapid');
do $$
declare first_id uuid; replay_id uuid; request_id uuid := '22222222-2222-4222-8222-222222222222';
begin
 first_id := record_wear_dose('11111111-1111-4111-8111-111111111111','patient-test',request_id,'2026-10-28T12:00:00Z','Mi rápida','rapid',3);
 replay_id := record_wear_dose('11111111-1111-4111-8111-111111111111','patient-test',request_id,'2026-10-28T12:00:00Z','Mi rápida','rapid',3);
 assert first_id=replay_id,'Respuesta perdida debe devolver el mismo evento';
 assert (select count(*) from events)=1,'No debe duplicar';
 assert (select occurred_at from events where id=first_id)='2026-10-28T12:00:00Z'::timestamptz,'Preservar hora original';
 assert (select user_id from events where id=first_id)='11111111-1111-4111-8111-111111111111'::uuid,'Preservar cuenta';
 update events set title='Editado en web' where id=first_id;
 perform record_wear_dose('11111111-1111-4111-8111-111111111111','patient-test',request_id,'2026-10-28T12:00:00Z','Mi rápida','rapid',3);
 assert (select title from events where id=first_id)='Editado en web','Reintento no revierte edición';
 delete from events where id=first_id;
 perform record_wear_dose('11111111-1111-4111-8111-111111111111','patient-test',request_id,'2026-10-28T12:00:00Z','Mi rápida','rapid',3);
 assert (select count(*) from events)=0,'Reintento no resucita evento borrado';
 begin
  perform record_wear_dose('11111111-1111-4111-8111-111111111111','patient-test',request_id,'2026-10-28T12:00:00Z','Mi rápida','rapid',4);
  raise exception 'Debe rechazar UUID con cantidad distinta';
 exception when unique_violation then null; end;
 begin
  perform record_wear_dose('11111111-1111-4111-8111-111111111111','otro-paciente',gen_random_uuid(),'2026-10-28T12:00:00Z','Mi rápida','rapid',3);
  raise exception 'Debe rechazar paciente ajeno';
 exception when invalid_parameter_value then null; end;
 assert not has_function_privilege('authenticated','public.record_wear_dose(uuid,text,uuid,timestamptz,text,text,integer)','execute'),'Cliente no puede invocar RPC';
 assert not has_table_privilege('anon','public.wear_tokens','select'),'Tokens privados';
end $$;
rollback;
