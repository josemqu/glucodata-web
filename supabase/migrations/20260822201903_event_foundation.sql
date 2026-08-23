create extension if not exists pgcrypto;

create table public.events (
  id uuid primary key default gen_random_uuid(),
  patient_id text not null,
  type text not null check (
    type in ('meal', 'insulin', 'exercise', 'medication', 'sleep', 'health', 'note', 'other')
  ),
  occurred_at timestamptz not null,
  ended_at timestamptz,
  title text not null check (char_length(trim(title)) between 1 and 120),
  notes text check (notes is null or char_length(notes) <= 2000),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint events_valid_interval check (ended_at is null or ended_at >= occurred_at)
);

create index events_patient_occurred_at_idx
  on public.events (patient_id, occurred_at desc);

create index events_patient_type_occurred_at_idx
  on public.events (patient_id, type, occurred_at desc);

alter table public.events enable row level security;

revoke all on table public.events from anon, authenticated;
grant select, insert, update, delete on table public.events to service_role;

comment on table public.events is
  'Contextual events scoped to a LibreLink patient. Access is server-only; API routes validate the LibreLink session.';

select pg_notify('pgrst', 'reload schema');
