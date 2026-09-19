create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant usage on schema auth to anon,authenticated,service_role;
grant execute on function auth.uid() to anon,authenticated,service_role;
create table public.glucose_measurements (
 id uuid primary key default gen_random_uuid(), timestamp timestamptz not null,
 value numeric not null, trend integer, is_high boolean, is_low boolean, unit text,
 patient_id text,created_at timestamptz default now(),
 constraint glucose_measurements_patient_timestamp_key unique(patient_id,timestamp)
);
create table public.provider_sessions(id text primary key,token text not null,user_id text,region text,updated_at timestamptz);
