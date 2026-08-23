alter table public.events
  add constraint events_patient_id_id_unique unique (patient_id, id);

create table public.event_links (
  id uuid primary key default gen_random_uuid(),
  patient_id text not null,
  parent_event_id uuid not null,
  related_event_id uuid not null,
  relation_type text not null check (
    relation_type in ('meal_insulin', 'correction', 'post_meal_exercise', 'pre_meal_exercise', 'related')
  ),
  status text not null default 'accepted' check (status in ('accepted', 'dismissed')),
  created_at timestamptz not null default now(),
  constraint event_links_different_events check (parent_event_id <> related_event_id),
  constraint event_links_parent_patient_fk
    foreign key (patient_id, parent_event_id)
    references public.events (patient_id, id)
    on delete cascade,
  constraint event_links_related_patient_fk
    foreign key (patient_id, related_event_id)
    references public.events (patient_id, id)
    on delete cascade,
  constraint event_links_unique_relation
    unique (patient_id, parent_event_id, related_event_id, relation_type)
);

create index event_links_parent_idx
  on public.event_links (patient_id, parent_event_id, status);

create index event_links_related_idx
  on public.event_links (patient_id, related_event_id, status);

alter table public.event_links enable row level security;

revoke all on table public.event_links from anon, authenticated;
grant select, insert, update, delete on table public.event_links to service_role;

comment on table public.event_links is
  'Accepted or dismissed relationships between contextual events belonging to the same LibreLink patient.';

select pg_notify('pgrst', 'reload schema');
