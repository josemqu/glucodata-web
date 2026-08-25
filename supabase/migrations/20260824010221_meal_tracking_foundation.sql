create table public.foods (
  id uuid primary key default gen_random_uuid(),
  patient_id text not null,
  name text not null check (char_length(trim(name)) between 1 and 120),
  serving_size numeric(10, 3) not null check (serving_size > 0 and serving_size <= 100000),
  serving_unit text not null check (char_length(trim(serving_unit)) between 1 and 24),
  carbs_g numeric(10, 3) not null default 0 check (carbs_g >= 0 and carbs_g <= 10000),
  protein_g numeric(10, 3) not null default 0 check (protein_g >= 0 and protein_g <= 10000),
  fat_g numeric(10, 3) not null default 0 check (fat_g >= 0 and fat_g <= 10000),
  calories numeric(10, 2) check (calories is null or (calories >= 0 and calories <= 100000)),
  favorite boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint foods_patient_id_id_unique unique (patient_id, id)
);

create index foods_patient_name_idx
  on public.foods (patient_id, lower(name), id);

create index foods_patient_favorite_name_idx
  on public.foods (patient_id, favorite desc, lower(name), id);

create table public.meal_items (
  id uuid primary key default gen_random_uuid(),
  patient_id text not null,
  event_id uuid not null,
  food_id uuid,
  quantity numeric(10, 3) not null check (quantity > 0 and quantity <= 10000),
  food_name text not null check (char_length(trim(food_name)) between 1 and 120),
  serving_size numeric(10, 3) not null check (serving_size > 0 and serving_size <= 100000),
  serving_unit text not null check (char_length(trim(serving_unit)) between 1 and 24),
  carbs_g numeric(10, 3) not null default 0 check (carbs_g >= 0 and carbs_g <= 10000),
  protein_g numeric(10, 3) not null default 0 check (protein_g >= 0 and protein_g <= 10000),
  fat_g numeric(10, 3) not null default 0 check (fat_g >= 0 and fat_g <= 10000),
  calories numeric(10, 2) check (calories is null or (calories >= 0 and calories <= 100000)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint meal_items_event_patient_fk
    foreign key (patient_id, event_id)
    references public.events (patient_id, id)
    on delete cascade,
  constraint meal_items_food_patient_fk
    foreign key (patient_id, food_id)
    references public.foods (patient_id, id)
    on delete set null (food_id)
);

create index meal_items_patient_event_idx
  on public.meal_items (patient_id, event_id, created_at, id);

create index meal_items_patient_food_idx
  on public.meal_items (patient_id, food_id)
  where food_id is not null;

alter table public.foods enable row level security;
alter table public.meal_items enable row level security;

revoke all on table public.foods, public.meal_items from anon, authenticated;
grant select, insert, update, delete on table public.foods, public.meal_items to service_role;

comment on table public.foods is
  'Reusable foods scoped to a LibreLink patient. Access is server-only after LibreLink session validation.';

comment on table public.meal_items is
  'Food lines attached to meal events. Nutritional values are immutable historical snapshots independent of later food edits.';

select pg_notify('pgrst', 'reload schema');
