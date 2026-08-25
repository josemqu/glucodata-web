import { NextResponse } from "next/server";

import { validateFoodInput } from "@/lib/foods";
import {
  createEventsDatabase,
  EventAuthError,
  requireActivePatient,
} from "@/lib/server/event-auth";

type RouteContext = { params: Promise<{ id: string }> };

function failure(error: unknown) {
  const status = error instanceof EventAuthError ? error.status : 500;
  const message = error instanceof Error ? error.message : "No se pudo procesar el alimento.";
  return NextResponse.json({ success: false, error: message }, { status });
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const patientId = await requireActivePatient(request);
    const { id } = await context.params;
    const { data, error } = await createEventsDatabase()
      .from("foods")
      .select("*")
      .eq("id", id)
      .eq("patient_id", patientId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ success: false, error: "Alimento no encontrado." }, { status: 404 });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return failure(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const patientId = await requireActivePatient(request);
    const { id } = await context.params;
    const parsed = validateFoodInput(await request.json());
    if (!parsed.success) return NextResponse.json(parsed, { status: 400 });

    const { data, error } = await createEventsDatabase()
      .from("foods")
      .update({ ...parsed.data, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("patient_id", patientId)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ success: false, error: "Alimento no encontrado." }, { status: 404 });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return failure(error);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const patientId = await requireActivePatient(request);
    const { id } = await context.params;
    const { data, error } = await createEventsDatabase()
      .from("foods")
      .delete()
      .eq("id", id)
      .eq("patient_id", patientId)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ success: false, error: "Alimento no encontrado." }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (error) {
    return failure(error);
  }
}
