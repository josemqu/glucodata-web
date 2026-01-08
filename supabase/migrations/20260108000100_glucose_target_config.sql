create table if not exists public.glucose_target_config (
  id text primary key,
  low integer not null,
  high integer not null,
  hypo integer not null,
  hyper integer not null,
  updated_at timestamptz not null default now()
);

insert into public.glucose_target_config (id, low, high, hypo, hyper)
values ('default', 70, 180, 60, 250)
on conflict (id) do nothing;

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on table public.glucose_target_config to anon, authenticated;

alter table public.glucose_target_config enable row level security;

drop policy if exists "read_default_config" on public.glucose_target_config;
drop policy if exists "insert_default_config" on public.glucose_target_config;
drop policy if exists "update_default_config" on public.glucose_target_config;

create policy "read_default_config"
on public.glucose_target_config
for select
to anon, authenticated
using (id = 'default');

create policy "insert_default_config"
on public.glucose_target_config
for insert
to anon, authenticated
with check (id = 'default');

create policy "update_default_config"
on public.glucose_target_config
for update
to anon, authenticated
using (id = 'default')
with check (id = 'default');

select pg_notify('pgrst', 'reload schema');
