create or replace function public.replace_meal_items(
  p_patient_id text,
  p_event_id uuid,
  p_items jsonb
)
returns setof public.meal_items
language plpgsql
security invoker
set search_path = ''
as $$
declare
  item jsonb;
  selected_food public.foods%rowtype;
  source_item public.meal_items%rowtype;
  item_quantity numeric(10, 3);
  source_quantity numeric(10, 3);
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 50 then
    raise exception 'La composición debe ser una lista de hasta 50 alimentos.' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.events
    where patient_id = p_patient_id and id = p_event_id and type = 'meal'
  ) then
    raise exception 'La comida no existe para el paciente activo.' using errcode = 'P0002';
  end if;

  create temporary table meal_items_replacement (
    food_id uuid,
    quantity numeric(10, 3),
    food_name text,
    serving_size numeric(12, 3),
    serving_unit text,
    carbs_g numeric(12, 3),
    protein_g numeric(12, 3),
    fat_g numeric(12, 3),
    calories numeric(12, 3)
  ) on commit drop;

  for item in select value from jsonb_array_elements(p_items)
  loop
    item_quantity := (item ->> 'quantity')::numeric;
    if item_quantity <= 0 or item_quantity > 10000 then
      raise exception 'La cantidad debe ser mayor que 0 y no superar 10000.' using errcode = '22023';
    end if;

    if item ? 'source_meal_item_id' then
      select * into source_item from public.meal_items
      where patient_id = p_patient_id
        and id = (item ->> 'source_meal_item_id')::uuid
        and event_id <> p_event_id;
      if not found then
        raise exception 'La porción histórica no existe para el paciente activo.' using errcode = 'P0002';
      end if;
      source_quantity := source_item.quantity;
      insert into meal_items_replacement values (
        source_item.food_id,
        item_quantity,
        source_item.food_name,
        source_item.serving_size,
        source_item.serving_unit,
        source_item.carbs_g / source_quantity * item_quantity,
        source_item.protein_g / source_quantity * item_quantity,
        source_item.fat_g / source_quantity * item_quantity,
        case when source_item.calories is null then null else source_item.calories / source_quantity * item_quantity end
      );
    else
      select * into selected_food from public.foods
      where patient_id = p_patient_id and id = (item ->> 'food_id')::uuid;
      if not found then
        raise exception 'Uno de los alimentos no existe para el paciente activo.' using errcode = 'P0002';
      end if;
      insert into meal_items_replacement values (
        selected_food.id,
        item_quantity,
        selected_food.name,
        selected_food.serving_size,
        selected_food.serving_unit,
        selected_food.carbs_g * item_quantity,
        selected_food.protein_g * item_quantity,
        selected_food.fat_g * item_quantity,
        selected_food.calories * item_quantity
      );
    end if;
  end loop;

  delete from public.meal_items where patient_id = p_patient_id and event_id = p_event_id;
  insert into public.meal_items (
    patient_id, event_id, food_id, quantity, food_name, serving_size,
    serving_unit, carbs_g, protein_g, fat_g, calories
  )
  select p_patient_id, p_event_id, food_id, quantity, food_name, serving_size,
    serving_unit, carbs_g, protein_g, fat_g, calories
  from meal_items_replacement;

  return query select * from public.meal_items
  where patient_id = p_patient_id and event_id = p_event_id
  order by created_at, id;
end;
$$;

revoke all on function public.replace_meal_items(text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.replace_meal_items(text, uuid, jsonb) to service_role;

comment on function public.replace_meal_items(text, uuid, jsonb) is
  'Atomically replaces a meal composition from current foods or patient-owned historical nutritional snapshots.';

select pg_notify('pgrst', 'reload schema');
