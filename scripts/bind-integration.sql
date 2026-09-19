\set ON_ERROR_STOP on
-- Required variables: app_user_id, patient_id, token_hash (SHA-256, never plaintext).
begin;
create temporary table integration_input as select :'app_user_id'::uuid as user_id, :'patient_id'::text as patient_id, :'token_hash'::text as token_hash;
do $$ begin
 if not exists(select 1 from integration_input where token_hash ~ '^[a-f0-9]{64}$') then raise exception 'Expected a SHA-256 digest'; end if;
end $$;
insert into public.integration_tokens(user_id,patient_id,token_hash)
select user_id,patient_id,token_hash from integration_input on conflict(token_hash) do nothing;
do $$ begin
 if not exists(select 1 from public.integration_tokens t join integration_input i using(user_id,patient_id,token_hash)) then
  raise exception 'Token already belongs to a different account or patient';
 end if;
end $$;
commit;
