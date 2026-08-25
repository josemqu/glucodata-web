import { NextResponse } from "next/server";

import { validateMealItemsInput } from "@/lib/foods";
import {
  createEventsDatabase,
  EventAuthError,
  requireActivePatient,
} from "@/lib/server/event-auth";

type RouteContext = { params: Promise<{ id: string }> };

function failure(error: unknown) {
  const status = error instanceof EventAuthError ? error.status : 500;
  const message = error instanceof Error ? error.message : "No se pudo procesar la composición de la comida.";
  return NextResponse.json({ success: false, error: message }, { status });
}

async function requireMeal(patientId: string, eventId: string) {
  const { data, error } = await createEventsDatabase()
    .from("events")
    .select("id")
    .eq("patient_id", patientId)
    .eq("id", eventId)
    .eq("type", "meal")
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const patientId = await requireActivePatient(request);
    const { id } = await context.params;
    if (!await requireMeal(patientId, id)) {
      return NextResponse.json({ success: false, error: "Comida no encontrada." }, { status: 404 });
    }

    const { data, error } = await createEventsDatabase()
      .from("meal_items")
      .select("*")
      .eq("patient_id", patientId)
      .eq("event_id", id)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (error) {
    return failure(error);
  }
}

export async function PUT(request: Request, context: RouteContext) {
  try {
    const patientId = await requireActivePatient(request);
    const { id } = await context.params;
    const body = await request.json();
    const parsed = validateMealItemsInput(
      body && typeof body === "object" && !Array.isArray(body)
        ? (body as Record<string, unknown>).items
        : undefined,
    );
    if (!parsed.success) return NextResponse.json(parsed, { status: 400 });

    const { data, error } = await createEventsDatabase().rpc("replace_meal_items", {
      p_patient_id: patientId,
      p_event_id: id,
      p_items: parsed.data,
    });
    if (error) {
      if (error.code === "P0002") {
        return NextResponse.json({ success: false, error: "Comida o alimento no encontrado." }, { status: 404 });
      }
      throw error;
    }
    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (error) {
    return failure(error);
  }
}
