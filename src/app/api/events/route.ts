import { NextResponse } from "next/server";

import { isEventType, validateEventInput } from "@/lib/events";
import {
  createEventsDatabase,
  EventAuthError,
  requireActivePatient,
} from "@/lib/server/event-auth";

function failure(error: unknown) {
  const status = error instanceof EventAuthError ? error.status : 500;
  const message = error instanceof Error ? error.message : "No se pudo procesar el evento.";
  return NextResponse.json({ success: false, error: message }, { status });
}

export async function GET(request: Request) {
  try {
    const patientId = await requireActivePatient(request);
    const url = new URL(request.url);
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const type = url.searchParams.get("type");
    const database = createEventsDatabase();

    let query = database
      .from("events")
      .select("*")
      .eq("patient_id", patientId)
      .order("occurred_at", { ascending: false })
      .limit(250);

    if (from && Number.isFinite(new Date(from).getTime())) query = query.gte("occurred_at", new Date(from).toISOString());
    if (to && Number.isFinite(new Date(to).getTime())) query = query.lte("occurred_at", new Date(to).toISOString());
    if (type && isEventType(type)) query = query.eq("type", type);

    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  try {
    const patientId = await requireActivePatient(request);
    const parsed = validateEventInput(await request.json());
    if (!parsed.success) {
      return NextResponse.json(parsed, { status: 400 });
    }

    const database = createEventsDatabase();
    const { data, error } = await database
      .from("events")
      .insert({ ...parsed.data, patient_id: patientId })
      .select("*")
      .single();
    if (error) throw error;
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return failure(error);
  }
}
