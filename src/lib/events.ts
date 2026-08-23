export const EVENT_TYPES = [
  "meal",
  "insulin",
  "exercise",
  "medication",
  "sleep",
  "health",
  "note",
  "other",
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

export interface GlucoEvent {
  id: string;
  patient_id: string;
  type: EventType;
  occurred_at: string;
  ended_at: string | null;
  title: string;
  notes: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface EventInput {
  type: EventType;
  occurred_at: string;
  ended_at?: string | null;
  title: string;
  notes?: string | null;
  metadata?: Record<string, unknown>;
}

export const EVENT_RELATION_TYPES = [
  "meal_insulin",
  "correction",
  "post_meal_exercise",
  "pre_meal_exercise",
  "related",
] as const;

export type EventRelationType = (typeof EVENT_RELATION_TYPES)[number];

export interface EventLink {
  id: string;
  patient_id: string;
  parent_event_id: string;
  related_event_id: string;
  relation_type: EventRelationType;
  status: "accepted" | "dismissed";
  created_at: string;
}

export interface LinkedEvent {
  link: EventLink;
  event: GlucoEvent;
}

export interface EventLinkSuggestion {
  event: GlucoEvent;
  relation_type: EventRelationType;
  distance_minutes: number;
}

export function isEventRelationType(value: unknown): value is EventRelationType {
  return typeof value === "string"
    && EVENT_RELATION_TYPES.includes(value as EventRelationType);
}

export function isEventType(value: unknown): value is EventType {
  return typeof value === "string" && EVENT_TYPES.includes(value as EventType);
}

export function validateEventInput(value: unknown):
  | { success: true; data: EventInput }
  | { success: false; error: string } {
  if (!value || typeof value !== "object") {
    return { success: false, error: "El evento no tiene un formato válido." };
  }

  const input = value as Record<string, unknown>;
  if (!isEventType(input.type)) {
    return { success: false, error: "Seleccioná un tipo de evento válido." };
  }

  const title = typeof input.title === "string" ? input.title.trim() : "";
  if (!title || title.length > 120) {
    return { success: false, error: "El título debe tener entre 1 y 120 caracteres." };
  }

  const occurredAt = typeof input.occurred_at === "string" ? input.occurred_at : "";
  if (!occurredAt || !Number.isFinite(new Date(occurredAt).getTime())) {
    return { success: false, error: "Ingresá una fecha y hora válidas." };
  }

  const endedAt = typeof input.ended_at === "string" && input.ended_at
    ? input.ended_at
    : null;
  if (endedAt && !Number.isFinite(new Date(endedAt).getTime())) {
    return { success: false, error: "La fecha de finalización no es válida." };
  }
  if (endedAt && new Date(endedAt) < new Date(occurredAt)) {
    return { success: false, error: "El fin no puede ser anterior al inicio." };
  }

  const notes = typeof input.notes === "string" ? input.notes.trim() || null : null;
  if (notes && notes.length > 2000) {
    return { success: false, error: "La nota no puede superar 2000 caracteres." };
  }

  const metadata = input.metadata && typeof input.metadata === "object" && !Array.isArray(input.metadata)
    ? input.metadata as Record<string, unknown>
    : {};

  if (input.type === "meal") {
    const carbs = Number(metadata.carbs_g);
    if (!Number.isFinite(carbs) || carbs < 0 || carbs > 1000) {
      return { success: false, error: "Ingresá carbohidratos válidos entre 0 y 1000 g." };
    }
    metadata.carbs_g = carbs;
  }

  if (input.type === "insulin") {
    const units = Number(metadata.units);
    const allowedInsulinTypes = ["rapid", "short", "intermediate", "long", "ultra_long", "other"];
    if (!Number.isFinite(units) || units <= 0 || units > 250) {
      return { success: false, error: "Ingresá una dosis válida mayor que 0 y de hasta 250 U." };
    }
    if (!allowedInsulinTypes.includes(String(metadata.insulin_type))) {
      return { success: false, error: "Seleccioná un tipo de insulina válido." };
    }
    if (metadata.dose_purpose != null && !["meal", "correction"].includes(String(metadata.dose_purpose))) {
      return { success: false, error: "Seleccioná si la dosis fue de comida o de corrección." };
    }
    metadata.units = units;
  }

  if (input.type === "exercise") {
    if (!endedAt) {
      return { success: false, error: "Ingresá cuándo terminó el ejercicio." };
    }
    if (!["low", "medium", "high"].includes(String(metadata.intensity))) {
      return { success: false, error: "Seleccioná una intensidad válida." };
    }
  }

  return {
    success: true,
    data: {
      type: input.type,
      occurred_at: new Date(occurredAt).toISOString(),
      ended_at: endedAt ? new Date(endedAt).toISOString() : null,
      title,
      notes,
      metadata,
    },
  };
}
