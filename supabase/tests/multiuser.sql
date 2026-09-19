-- Run with psql -v ON_ERROR_STOP=1 against an isolated database after migrations.
begin;
insert into auth.users(id) values('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002');
insert into app_users(id,librelink_user_id) values('00000000-0000-4000-8000-000000000001','test-a'),('00000000-0000-4000-8000-000000000002','test-b');
insert into user_patients values('00000000-0000-4000-8000-000000000001','shared-patient'),('00000000-0000-4000-8000-000000000002','shared-patient');
insert into glucose_measurements(patient_id,timestamp,value) values('shared-patient','2026-01-01',111);
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
insert into glucose_measurements(patient_id,timestamp,value) values('shared-patient','2026-01-01',123);
insert into events(id,patient_id,type,title,occurred_at) values('10000000-0000-4000-8000-000000000001','shared-patient','meal','A','2026-01-01');
insert into foods(id,patient_id,name,serving_size,serving_unit) values('20000000-0000-4000-8000-000000000001','shared-patient','A',1,'g');
select * from replace_meal_items('shared-patient','10000000-0000-4000-8000-000000000001','[{"food_id":"20000000-0000-4000-8000-000000000001","quantity":2}]');
drop table pg_temp.meal_items_replacement;
select * from replace_patient_insulins('shared-patient','[{"name":"A","insulin_type":"rapid","sort_order":0}]');
insert into glucose_target_config(id,low,high,hypo,hyper) values('default',70,180,60,250);
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
insert into glucose_measurements(patient_id,timestamp,value) values('shared-patient','2026-01-01',234);
insert into events(id,patient_id,type,title,occurred_at) values('10000000-0000-4000-8000-000000000002','shared-patient','meal','B','2026-01-01');
insert into glucose_target_config(id,low,high,hypo,hyper) values('default',80,190,60,260);
select * from replace_patient_insulins('shared-patient','[{"name":"B","insulin_type":"rapid","sort_order":0}]');
do $$ begin
 if (select count(*) from glucose_measurements) <> 1 or (select min(value) from glucose_measurements) <> 234 then raise exception 'Read isolation failed'; end if;
 if (select count(*) from foods) <> 0 or (select count(*) from meal_items) <> 0 then raise exception 'Food isolation failed'; end if;
 if (select count(*) from glucose_target_config) <> 1 then raise exception 'Target isolation failed'; end if;
 update events set title='stolen' where id='10000000-0000-4000-8000-000000000001';
 if found then raise exception 'Cross-account update allowed'; end if;
 delete from glucose_measurements where value=123;
 if found then raise exception 'Cross-account delete allowed'; end if;
 begin
  insert into glucose_measurements(user_id,patient_id,timestamp,value) values('00000000-0000-4000-8000-000000000001','shared-patient',now(),999);
  raise exception 'Spoofed owner accepted';
 exception when insufficient_privilege then null; end;
 begin
  update glucose_measurements set user_id='00000000-0000-4000-8000-000000000001';
  raise exception 'Owner reassignment accepted';
 exception when insufficient_privilege then null; end;
 begin
  insert into glucose_measurements(user_id,patient_id,timestamp,value) values(null,'shared-patient',now(),999);
  raise exception 'Unowned new row accepted';
 exception when insufficient_privilege then null; end;
 begin
  insert into glucose_measurements(patient_id,timestamp,value) values('unlinked',now(),999);
  raise exception 'Unlinked patient accepted';
 exception when insufficient_privilege then null; end;
 begin
  perform * from replace_meal_items('shared-patient','10000000-0000-4000-8000-000000000001','[]');
  raise exception 'Cross-account RPC accepted';
 exception when no_data_found then null; end;
 begin
  perform * from replace_meal_items('shared-patient','10000000-0000-4000-8000-000000000002','[{"food_id":"20000000-0000-4000-8000-000000000001","quantity":1}]');
  raise exception 'Cross-account food RPC accepted';
 exception when no_data_found then null; end;
 begin
  insert into meal_items(patient_id,event_id,food_id,quantity,food_name,serving_size,serving_unit)
   values('shared-patient','10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001',1,'stolen',1,'g');
  raise exception 'Cross-account FK accepted';
 exception when foreign_key_violation then null; end;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
do $$ begin
 if (select name from patient_insulins) <> 'A' then raise exception 'Insulin RPC modified account A'; end if;
 if (select count(*) from meal_items) <> 1 then raise exception 'Meal replacement lost account A'; end if;
end $$;
-- An owner can update and delete their own rows normally.
update glucose_measurements set value=124 where value=123;
do $$ begin if not found then null; end if;
 if (select min(value) from glucose_measurements)<>124 then raise exception 'Own update blocked'; end if;
end $$;
insert into events(id,patient_id,type,title,occurred_at) values('10000000-0000-4000-8000-000000000003','shared-patient','note','A note','2026-01-01');
insert into event_links(patient_id,parent_event_id,related_event_id,relation_type)
 values('shared-patient','10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000003','related');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
do $$ begin
 if exists(select 1 from event_links) then raise exception 'Event link read leaked'; end if;
 begin
  insert into event_links(patient_id,parent_event_id,related_event_id,relation_type)
   values('shared-patient','10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000003','related');
  raise exception 'Cross-account event relationship accepted';
 exception when foreign_key_violation then null; end;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
delete from events where id='10000000-0000-4000-8000-000000000003';
do $$ begin
 if exists(select 1 from event_links) then raise exception 'Own delete cascade failed'; end if;
 if has_table_privilege('authenticated','user_provider_sessions','SELECT') or has_table_privilege('authenticated','integration_tokens','SELECT') or has_table_privilege('authenticated','provider_sessions','SELECT') then raise exception 'Provider secrets are exposed'; end if;
 if has_function_privilege('anon','replace_meal_items(text,uuid,jsonb)','EXECUTE') or has_function_privilege('anon','replace_patient_insulins(text,jsonb)','EXECUTE') then raise exception 'Anonymous RPC privilege'; end if;
end $$;
set local role anon;
do $$ declare t text; begin
 foreach t in array array['app_users','user_patients','provider_sessions','user_provider_sessions','integration_tokens','glucose_measurements','glucose_target_config','events','foods','meal_items','event_links','patient_insulins'] loop
  if has_table_privilege('anon','public.'||t,'SELECT') or has_table_privilege('anon','public.'||t,'INSERT') or has_table_privilege('anon','public.'||t,'UPDATE') or has_table_privilege('anon','public.'||t,'DELETE') then raise exception 'Anon grant on %',t; end if;
 end loop;
end $$;
reset role;
do $$ begin
 if (select count(*) from glucose_measurements where user_id is null and patient_id='shared-patient') <> 1 then raise exception 'Legacy data lost'; end if;
 if (select count(*) from glucose_measurements where patient_id='shared-patient') <> 3 then raise exception 'Account data lost'; end if;
end $$;
rollback;
select 'Multiuser isolation tests passed' as result;
