\set ON_ERROR_STOP on
-- Separate explicit ownership confirmation for the formerly global targets.
begin;
set local lock_timeout='5s';
lock table public.glucose_target_config in share row exclusive mode;
create temporary table target_input as select :'app_user_id'::uuid as user_id, :'patient_id'::text as patient_id, :'evidence'::text as evidence;
do $$ begin
 if not exists(select 1 from target_input i join public.user_patients p using(user_id,patient_id) where length(trim(i.evidence))>=20) then raise exception 'Confirmed ownership evidence required'; end if;
end $$;
with assigned as (
 update public.glucose_target_config set user_id=(select user_id from target_input)
 where user_id is null and id='default' returning 1
)
insert into public.legacy_ownership_assignments(user_id,patient_id,evidence,counts)
select user_id,patient_id,evidence,jsonb_build_object('glucose_target_config',(select count(*) from assigned)) from target_input;
commit;
