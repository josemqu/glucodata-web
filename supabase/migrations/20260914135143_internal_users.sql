begin;
-- Legacy rows remain NULL until an operator supplies documented ownership evidence.
create table public.app_users (
 id uuid primary key references auth.users(id) on delete restrict,
 librelink_user_id text not null unique,
 created_at timestamptz not null default now()
);
create table public.user_patients (
 user_id uuid not null references public.app_users(id) on delete restrict,
 patient_id text not null,
 primary key(user_id, patient_id)
);
create table public.user_provider_sessions (
 user_id uuid primary key references public.app_users(id) on delete restrict,
 librelink_user_id text not null,
 patient_id text not null,
 token text not null,
 region text not null default '',
 updated_at timestamptz not null default now(),
 foreign key(user_id,patient_id) references public.user_patients(user_id,patient_id)
);
create table public.integration_tokens (
 token_hash text primary key,
 user_id uuid not null,
 patient_id text not null,
 created_at timestamptz not null default now(),
 foreign key(user_id,patient_id) references public.user_patients(user_id,patient_id)
);
alter table public.app_users enable row level security;
alter table public.user_patients enable row level security;
alter table public.user_provider_sessions enable row level security;
alter table public.integration_tokens enable row level security;
revoke all on public.app_users,public.user_patients,public.user_provider_sessions,public.integration_tokens from public,anon,authenticated;
grant select on public.app_users,public.user_patients to authenticated;
grant all on public.app_users,public.user_patients,public.user_provider_sessions,public.integration_tokens to service_role;
create policy own_identity on public.app_users for select to authenticated using(id=(select auth.uid()));
create policy own_patients on public.user_patients for select to authenticated using(user_id=(select auth.uid()));

alter table public.glucose_measurements add column user_id uuid references public.app_users(id) on delete restrict;
alter table public.glucose_measurements alter column user_id set default auth.uid();
create index glucose_measurements_user_idx on public.glucose_measurements(user_id);
alter table public.glucose_measurements enable row level security;
revoke all on public.glucose_measurements from public,anon,authenticated;
grant select,insert,update,delete on public.glucose_measurements to authenticated,service_role;

alter table public.events add column user_id uuid references public.app_users(id) on delete restrict;
alter table public.events alter column user_id set default auth.uid();
create index events_user_idx on public.events(user_id);
alter table public.events enable row level security;
revoke all on public.events from public,anon,authenticated;
grant select,insert,update,delete on public.events to authenticated,service_role;

alter table public.foods add column user_id uuid references public.app_users(id) on delete restrict;
alter table public.foods alter column user_id set default auth.uid();
create index foods_user_idx on public.foods(user_id);
alter table public.foods enable row level security;
revoke all on public.foods from public,anon,authenticated;
grant select,insert,update,delete on public.foods to authenticated,service_role;

alter table public.meal_items add column user_id uuid references public.app_users(id) on delete restrict;
alter table public.meal_items alter column user_id set default auth.uid();
create index meal_items_user_idx on public.meal_items(user_id);
alter table public.meal_items enable row level security;
revoke all on public.meal_items from public,anon,authenticated;
grant select,insert,update,delete on public.meal_items to authenticated,service_role;

alter table public.event_links add column user_id uuid references public.app_users(id) on delete restrict;
alter table public.event_links alter column user_id set default auth.uid();
create index event_links_user_idx on public.event_links(user_id);
alter table public.event_links enable row level security;
revoke all on public.event_links from public,anon,authenticated;
grant select,insert,update,delete on public.event_links to authenticated,service_role;

alter table public.patient_insulins add column user_id uuid references public.app_users(id) on delete restrict;
alter table public.patient_insulins alter column user_id set default auth.uid();
create index patient_insulins_user_idx on public.patient_insulins(user_id);
alter table public.patient_insulins enable row level security;
revoke all on public.patient_insulins from public,anon,authenticated;
grant select,insert,update,delete on public.patient_insulins to authenticated,service_role;

alter table public.glucose_target_config add column user_id uuid references public.app_users(id) on delete restrict;
alter table public.glucose_target_config alter column user_id set default auth.uid();
create index glucose_target_config_user_idx on public.glucose_target_config(user_id);
alter table public.glucose_target_config enable row level security;
revoke all on public.glucose_target_config from public,anon,authenticated;
grant select,insert,update,delete on public.glucose_target_config to authenticated,service_role;

-- Remove every previous policy, including installations with nonstandard names.
do $$ declare p record; begin
 for p in select tablename,policyname from pg_policies where schemaname='public'
 and tablename in ('glucose_measurements','events','foods','meal_items','event_links','patient_insulins','glucose_target_config','provider_sessions') loop
 execute format('drop policy %I on public.%I',p.policyname,p.tablename);
 end loop;
end $$;
alter table public.provider_sessions enable row level security;
revoke all on public.provider_sessions from public,anon,authenticated;
alter table public.glucose_measurements add constraint glucose_measurements_owner_patient_fk foreign key(user_id,patient_id) references public.user_patients(user_id,patient_id);
create policy owner_access on public.glucose_measurements for all to authenticated using(user_id=(select auth.uid()) and exists(select 1 from public.user_patients p where p.user_id=(select auth.uid()) and p.patient_id=glucose_measurements.patient_id)) with check(user_id=(select auth.uid()) and exists(select 1 from public.user_patients p where p.user_id=(select auth.uid()) and p.patient_id=glucose_measurements.patient_id));
alter table public.events add constraint events_owner_patient_fk foreign key(user_id,patient_id) references public.user_patients(user_id,patient_id);
create policy owner_access on public.events for all to authenticated using(user_id=(select auth.uid()) and exists(select 1 from public.user_patients p where p.user_id=(select auth.uid()) and p.patient_id=events.patient_id)) with check(user_id=(select auth.uid()) and exists(select 1 from public.user_patients p where p.user_id=(select auth.uid()) and p.patient_id=events.patient_id));
alter table public.foods add constraint foods_owner_patient_fk foreign key(user_id,patient_id) references public.user_patients(user_id,patient_id);
create policy owner_access on public.foods for all to authenticated using(user_id=(select auth.uid()) and exists(select 1 from public.user_patients p where p.user_id=(select auth.uid()) and p.patient_id=foods.patient_id)) with check(user_id=(select auth.uid()) and exists(select 1 from public.user_patients p where p.user_id=(select auth.uid()) and p.patient_id=foods.patient_id));
alter table public.meal_items add constraint meal_items_owner_patient_fk foreign key(user_id,patient_id) references public.user_patients(user_id,patient_id);
create policy owner_access on public.meal_items for all to authenticated using(user_id=(select auth.uid()) and exists(select 1 from public.user_patients p where p.user_id=(select auth.uid()) and p.patient_id=meal_items.patient_id)) with check(user_id=(select auth.uid()) and exists(select 1 from public.user_patients p where p.user_id=(select auth.uid()) and p.patient_id=meal_items.patient_id));
alter table public.event_links add constraint event_links_owner_patient_fk foreign key(user_id,patient_id) references public.user_patients(user_id,patient_id);
create policy owner_access on public.event_links for all to authenticated using(user_id=(select auth.uid()) and exists(select 1 from public.user_patients p where p.user_id=(select auth.uid()) and p.patient_id=event_links.patient_id)) with check(user_id=(select auth.uid()) and exists(select 1 from public.user_patients p where p.user_id=(select auth.uid()) and p.patient_id=event_links.patient_id));
alter table public.patient_insulins add constraint patient_insulins_owner_patient_fk foreign key(user_id,patient_id) references public.user_patients(user_id,patient_id);
create policy owner_access on public.patient_insulins for all to authenticated using(user_id=(select auth.uid()) and exists(select 1 from public.user_patients p where p.user_id=(select auth.uid()) and p.patient_id=patient_insulins.patient_id)) with check(user_id=(select auth.uid()) and exists(select 1 from public.user_patients p where p.user_id=(select auth.uid()) and p.patient_id=patient_insulins.patient_id));
create policy owner_access on public.glucose_target_config for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));

alter table public.glucose_measurements drop constraint glucose_measurements_patient_timestamp_key;
alter table public.glucose_measurements add constraint glucose_measurements_owner_timestamp_key unique(user_id,patient_id,timestamp);
alter table public.glucose_target_config drop constraint glucose_target_config_pkey;
-- Keep the global legacy row, while allowing one default configuration per account.
create unique index glucose_target_config_owner_key on public.glucose_target_config(user_id,id);
create unique index glucose_target_config_legacy_key on public.glucose_target_config(id) where user_id is null;
alter table public.patient_insulins drop constraint patient_insulins_patient_name_unique;
alter table public.patient_insulins drop constraint patient_insulins_patient_order_unique;
alter table public.patient_insulins add unique(user_id,patient_id,name), add unique(user_id,patient_id,sort_order);
alter table public.events add unique(user_id,patient_id,id);
alter table public.foods add unique(user_id,patient_id,id);
alter table public.event_links add constraint event_links_owner_parent_fk foreign key(user_id,patient_id,parent_event_id) references public.events(user_id,patient_id,id) on delete cascade;
alter table public.event_links add constraint event_links_owner_related_fk foreign key(user_id,patient_id,related_event_id) references public.events(user_id,patient_id,id) on delete cascade;
alter table public.meal_items add constraint meal_items_owner_event_fk foreign key(user_id,patient_id,event_id) references public.events(user_id,patient_id,id) on delete cascade;
alter table public.meal_items add constraint meal_items_owner_food_fk foreign key(user_id,patient_id,food_id) references public.foods(user_id,patient_id,id) on delete set null(food_id);
-- Existing RPCs are SECURITY INVOKER: caller JWT and table defaults enforce ownership.
grant execute on function public.replace_meal_items(text,uuid,jsonb) to authenticated;
grant execute on function public.replace_patient_insulins(text,jsonb) to authenticated;
select pg_notify('pgrst','reload schema');

create table public.legacy_ownership_assignments (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.app_users(id) on delete restrict,
 patient_id text not null,
 evidence text not null,
 counts jsonb not null,
 assigned_at timestamptz not null default now()
);
alter table public.legacy_ownership_assignments enable row level security;
revoke all on public.legacy_ownership_assignments from public,anon,authenticated;
grant select,insert on public.legacy_ownership_assignments to service_role;
alter table public.app_users add unique(id,librelink_user_id);
alter table public.user_provider_sessions add foreign key(user_id,librelink_user_id) references public.app_users(id,librelink_user_id);

commit;
