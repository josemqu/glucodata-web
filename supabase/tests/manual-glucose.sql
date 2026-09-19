-- Isolated test only. Capillary readings share events RLS without touching CGM data.
begin;
insert into auth.users(id) values('00000000-0000-4000-8000-000000000011'),('00000000-0000-4000-8000-000000000012');
insert into app_users(id,librelink_user_id) values('00000000-0000-4000-8000-000000000011','manual-test-a'),('00000000-0000-4000-8000-000000000012','manual-test-b');
insert into user_patients values('00000000-0000-4000-8000-000000000011','manual-patient'),('00000000-0000-4000-8000-000000000012','manual-patient');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000011',true);
insert into events(id,patient_id,type,title,occurred_at,metadata) values('10000000-0000-4000-8000-000000000011','manual-patient','health','Glucómetro de sangre','2026-01-01T12:34:00-03:00','{"measurement_type":"capillary_glucose","glucose_mg_dl":123,"unit":"mg/dL","source":"blood_glucose_meter"}');
do $$ begin
 if (select metadata->>'glucose_mg_dl' from events where id='10000000-0000-4000-8000-000000000011') is distinct from '123' then raise exception 'Manual reading not persisted'; end if;
 if exists(select 1 from glucose_measurements) then raise exception 'Manual reading contaminated CGM'; end if;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000012',true);
do $$ begin
 if exists(select 1 from events) then raise exception 'Other account can read manual value'; end if;
 update events set metadata='{}' where id='10000000-0000-4000-8000-000000000011';
 if found then raise exception 'Other account can edit'; end if;
 delete from events where id='10000000-0000-4000-8000-000000000011';
 if found then raise exception 'Other account can delete'; end if;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000011',true);
update events set metadata=jsonb_set(metadata,'{glucose_mg_dl}','124') where id='10000000-0000-4000-8000-000000000011';
do $$ begin
 if (select metadata->>'glucose_mg_dl' from events where id='10000000-0000-4000-8000-000000000011') is distinct from '124' then raise exception 'Manual edit failed'; end if;
 delete from events where id='10000000-0000-4000-8000-000000000011';
 if not found then raise exception 'Manual deletion failed'; end if;
end $$;
rollback;
