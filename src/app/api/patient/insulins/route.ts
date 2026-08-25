import { NextResponse } from "next/server";

import { validatePatientInsulins } from "@/lib/insulins";
import { createEventsDatabase, EventAuthError, requireActivePatient } from "@/lib/server/event-auth";

function failure(error: unknown) {
  const status = error instanceof EventAuthError ? error.status : 500;
  const message = error instanceof Error ? error.message : "No se pudo procesar la configuración de insulina.";
  return NextResponse.json({ success: false, error: message }, { status });
}

export async function GET(request: Request) {
  try {
    const patientId = await requireActivePatient(request);
    const { data, error } = await createEventsDatabase()
      .from("patient_insulins")
      .select("id,patient_id,name,insulin_type,sort_order")
      .eq("patient_id", patientId)
      .order("sort_order", { ascending: true });
    if (error) throw error;
    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (error) {
    return failure(error);
  }
}

export async function PUT(request: Request) {
  try {
    const patientId = await requireActivePatient(request);
    const parsed = validatePatientInsulins(await request.json());
    if (!parsed.success) return NextResponse.json(parsed, { status: 400 });

    const { data, error } = await createEventsDatabase().rpc("replace_patient_insulins", {
      p_patient_id: patientId,
      p_insulins: parsed.data,
    });
    if (error) throw error;
    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (error) {
    return failure(error);
  }
}
