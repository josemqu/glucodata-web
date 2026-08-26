import { isInsulinType } from "@/lib/insulins";

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

export interface InsulinDose {
  name: string;
  insulin_type: string;
  units: number;
}

export function eventInsulinDoses(event: Pick<GlucoEvent, "type" | "title" | "metadata">): InsulinDose[] {
  if (event.type !== "insulin") return [];
  const stored = Array.isArray(event.metadata.insulin_doses) ? event.metadata.insulin_doses : [];
  const doses = stored.flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const dose = value as Record<string, unknown>;
    const name = typeof dose.name === "string" ? dose.name.trim() : "";
    const units = Number(dose.units);
    if (!name || !isInsulinType(dose.insulin_type) || !Number.isFinite(units) || units <= 0) return [];
    return [{ name, insulin_type: dose.insulin_type, units }];
  });
  if (doses.length) return doses;

  const units = Number(event.metadata.units);
  if (!Number.isFinite(units) || units <= 0 || !isInsulinType(event.metadata.insulin_type)) return [];
  return [{
    name: typeof event.metadata.insulin_name === "string" ? event.metadata.insulin_name : event.title,
    insulin_type: event.metadata.insulin_type,
    units,
  }];
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
    const rawDoses = Array.isArray(metadata.insulin_doses) ? metadata.insulin_doses : null;
    const doses: InsulinDose[] = [];
    if (rawDoses) {
      if (rawDoses.length < 1 || rawDoses.length > 6) {
        return { success: false, error: "Seleccioná entre 1 y 6 insulinas." };
      }
      const names = new Set<string>();
      for (const value of rawDoses) {
        if (!value || typeof value !== "object") return { success: false, error: "La dosis de insulina no es válida." };
        const dose = value as Record<string, unknown>;
        const name = typeof dose.name === "string" ? dose.name.trim() : "";
        const units = Number(dose.units);
        if (!name || name.length > 80 || names.has(name.toLocaleLowerCase())) {
          return { success: false, error: "Seleccioná insulinas válidas y sin repetir." };
        }
        if (!isInsulinType(dose.insulin_type)) return { success: false, error: `Seleccioná un tipo válido para ${name}.` };
        if (!Number.isFinite(units) || units <= 0 || units > 250) return { success: false, error: `Ingresá una dosis válida para ${name}.` };
        names.add(name.toLocaleLowerCase());
        doses.push({ name, insulin_type: dose.insulin_type, units });
      }
      metadata.insulin_doses = doses;
      metadata.units = doses.reduce((sum, dose) => sum + dose.units, 0);
      metadata.insulin_name = doses[0].name;
      metadata.insulin_type = doses[0].insulin_type;
    } else {
      const units = Number(metadata.units);
      if (!Number.isFinite(units) || units <= 0 || units > 250) {
        return { success: false, error: "Ingresá una dosis válida mayor que 0 y de hasta 250 U." };
      }
      if (!isInsulinType(metadata.insulin_type)) {
        return { success: false, error: "Seleccioná un tipo de insulina válido." };
      }
      metadata.units = units;
    }
    if (metadata.dose_purpose != null && !["meal", "correction"].includes(String(metadata.dose_purpose))) {
      return { success: false, error: "Seleccioná si la dosis fue de comida o de corrección." };
    }
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
