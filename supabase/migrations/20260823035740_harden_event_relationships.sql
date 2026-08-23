-- A relationship is undirected at the storage level. Keep one canonical row
-- per event pair so reverse duplicates and contradictory meanings cannot exist.
delete from public.event_links a
using public.event_links b
where a.patient_id = b.patient_id
  and least(a.parent_event_id, a.related_event_id) = least(b.parent_event_id, b.related_event_id)
  and greatest(a.parent_event_id, a.related_event_id) = greatest(b.parent_event_id, b.related_event_id)
  and (a.status, a.created_at, a.id) < (b.status, b.created_at, b.id);

update public.event_links
set parent_event_id = related_event_id,
    related_event_id = parent_event_id
where parent_event_id > related_event_id;

alter table public.event_links
  drop constraint event_links_unique_relation,
  add constraint event_links_canonical_order check (parent_event_id < related_event_id),
  add constraint event_links_unique_pair unique (patient_id, parent_event_id, related_event_id);

select pg_notify('pgrst', 'reload schema');
