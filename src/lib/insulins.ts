export const INSULIN_TYPES = [
  "rapid",
  "short",
  "intermediate",
  "long",
  "ultra_long",
  "other",
] as const;

export type InsulinType = (typeof INSULIN_TYPES)[number];

export interface PatientInsulin {
  id?: string;
  patient_id?: string;
  name: string;
  insulin_type: InsulinType;
  sort_order: number;
}

export const INSULIN_TYPE_LABELS: Record<InsulinType, string> = {
  rapid: "Rápida",
  short: "Corta",
  intermediate: "Intermedia",
  long: "Lenta",
  ultra_long: "Lenta (ultralarga)",
  other: "Otra",
};

export const DEFAULT_PATIENT_INSULINS: PatientInsulin[] = [
  { name: "Novorapid", insulin_type: "rapid", sort_order: 0 },
  { name: "Tresiba", insulin_type: "ultra_long", sort_order: 1 },
];

export function isInsulinType(value: unknown): value is InsulinType {
  return typeof value === "string" && INSULIN_TYPES.includes(value as InsulinType);
}

export function validatePatientInsulins(value: unknown):
  | { success: true; data: PatientInsulin[] }
  | { success: false; error: string } {
  if (!Array.isArray(value) || value.length < 1 || value.length > 6) {
    return { success: false, error: "Configurá entre 1 y 6 insulinas." };
  }

  const data: PatientInsulin[] = [];
  const names = new Set<string>();
  for (const [index, item] of value.entries()) {
    if (!item || typeof item !== "object") return { success: false, error: "La configuración de insulina no es válida." };
    const candidate = item as Record<string, unknown>;
    const name = typeof candidate.name === "string" ? candidate.name.trim() : "";
    if (!name || name.length > 80) return { success: false, error: "Cada insulina debe tener un nombre de hasta 80 caracteres." };
    if (!isInsulinType(candidate.insulin_type)) return { success: false, error: `Seleccioná un tipo válido para ${name}.` };
    const key = name.toLocaleLowerCase("es");
    if (names.has(key)) return { success: false, error: "No repitas el mismo nombre de insulina." };
    names.add(key);
    data.push({ name, insulin_type: candidate.insulin_type, sort_order: index });
  }
  return { success: true, data };
}
