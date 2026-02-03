grant usage on schema public to anon, authenticated;

grant select on table public.glucose_measurements to anon, authenticated;

alter table public.glucose_measurements enable row level security;

drop policy if exists "read_glucose_measurements" on public.glucose_measurements;

create policy "read_glucose_measurements"
on public.glucose_measurements
for select
to anon, authenticated
using (true);

select pg_notify('pgrst', 'reload schema');
