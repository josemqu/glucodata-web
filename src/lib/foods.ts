export interface Food {
  id: string;
  patient_id: string;
  name: string;
  serving_size: number;
  serving_unit: string;
  carbs_g: number;
  protein_g: number;
  fat_g: number;
  calories: number | null;
  favorite: boolean;
  created_at: string;
  updated_at: string;
}

export interface FoodInput {
  name: string;
  serving_size: number;
  serving_unit: string;
  carbs_g: number;
  protein_g: number;
  fat_g: number;
  calories: number | null;
  favorite: boolean;
}

export interface MealItem {
  id: string;
  patient_id: string;
  event_id: string;
  food_id: string | null;
  quantity: number;
  food_name: string;
  serving_size: number;
  serving_unit: string;
  carbs_g: number;
  protein_g: number;
  fat_g: number;
  calories: number | null;
  created_at: string;
  updated_at: string;
}

export interface MealItemInput {
  food_id?: string;
  source_meal_item_id?: string;
  quantity: number;
}

export function validateMealItemsInput(value: unknown):
  | { success: true; data: MealItemInput[] }
  | { success: false; error: string } {
  if (!Array.isArray(value) || value.length > 50) {
    return { success: false, error: "La composición debe ser una lista de hasta 50 alimentos." };
  }

  const seenItems = new Set<string>();
  const data: MealItemInput[] = [];
  for (const valueItem of value) {
    if (!valueItem || typeof valueItem !== "object" || Array.isArray(valueItem)) {
      return { success: false, error: "Uno de los alimentos no tiene un formato válido." };
    }
    const item = valueItem as Record<string, unknown>;
    const foodId = typeof item.food_id === "string" ? item.food_id.trim() : "";
    const sourceMealItemId = typeof item.source_meal_item_id === "string" ? item.source_meal_item_id.trim() : "";
    const quantity = Number(item.quantity);
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (Boolean(foodId) === Boolean(sourceMealItemId) || !uuid.test(foodId || sourceMealItemId)) {
      return { success: false, error: "Seleccioná un alimento o una porción histórica válida." };
    }
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 10000) {
      return { success: false, error: "La cantidad debe ser mayor que 0 y no superar 10000." };
    }
    const itemKey = foodId ? `food:${foodId}` : `snapshot:${sourceMealItemId}`;
    if (seenItems.has(itemKey)) {
      return { success: false, error: "Cada alimento puede aparecer una sola vez por comida." };
    }
    seenItems.add(itemKey);
    data.push(foodId ? { food_id: foodId, quantity } : { source_meal_item_id: sourceMealItemId, quantity });
  }

  return { success: true, data };
}

function numericField(
  input: Record<string, unknown>,
  key: string,
  label: string,
  maximum: number,
  options?: { positive?: boolean; optional?: false },
): { success: true; value: number } | { success: false; error: string };
function numericField(
  input: Record<string, unknown>,
  key: string,
  label: string,
  maximum: number,
  options: { positive?: boolean; optional: true },
): { success: true; value: number | null } | { success: false; error: string };
function numericField(
  input: Record<string, unknown>,
  key: string,
  label: string,
  maximum: number,
  { positive = false, optional = false }: { positive?: boolean; optional?: boolean } = {},
) {
  if (optional && (input[key] === null || input[key] === undefined || input[key] === "")) {
    return { success: true as const, value: null };
  }
  const value = Number(input[key]);
  const minimumValid = positive ? value > 0 : value >= 0;
  if (!Number.isFinite(value) || !minimumValid || value > maximum) {
    return { success: false as const, error: `${label} debe ser ${positive ? "mayor que 0" : "0 o más"} y no superar ${maximum}.` };
  }
  return { success: true as const, value };
}

export function validateFoodInput(value: unknown):
  | { success: true; data: FoodInput }
  | { success: false; error: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { success: false, error: "El alimento no tiene un formato válido." };
  }

  const input = value as Record<string, unknown>;
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const servingUnit = typeof input.serving_unit === "string" ? input.serving_unit.trim() : "";
  if (!name || name.length > 120) {
    return { success: false, error: "El nombre debe tener entre 1 y 120 caracteres." };
  }
  if (!servingUnit || servingUnit.length > 24) {
    return { success: false, error: "La unidad de porción debe tener entre 1 y 24 caracteres." };
  }

  const servingSize = numericField(input, "serving_size", "La porción", 100000, { positive: true });
  if (!servingSize.success) return servingSize;
  const carbs = numericField(input, "carbs_g", "Los carbohidratos", 10000);
  if (!carbs.success) return carbs;
  const protein = numericField(input, "protein_g", "Las proteínas", 10000);
  if (!protein.success) return protein;
  const fat = numericField(input, "fat_g", "Las grasas", 10000);
  if (!fat.success) return fat;
  const calories = numericField(input, "calories", "Las calorías", 100000, { optional: true });
  if (!calories.success) return calories;

  return {
    success: true,
    data: {
      name,
      serving_size: servingSize.value,
      serving_unit: servingUnit,
      carbs_g: carbs.value,
      protein_g: protein.value,
      fat_g: fat.value,
      calories: calories.value,
      favorite: input.favorite === true,
    },
  };
}
