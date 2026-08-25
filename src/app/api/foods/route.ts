import { NextResponse } from "next/server";

import { validateFoodInput } from "@/lib/foods";
import {
  createEventsDatabase,
  EventAuthError,
  requireActivePatient,
} from "@/lib/server/event-auth";

function failure(error: unknown) {
  const status = error instanceof EventAuthError ? error.status : 500;
  const message = error instanceof Error ? error.message : "No se pudo procesar el alimento.";
  return NextResponse.json({ success: false, error: message }, { status });
}

export async function GET(request: Request) {
  try {
    const patientId = await requireActivePatient(request);
    const url = new URL(request.url);
    const search = (url.searchParams.get("search")?.trim() ?? "").slice(0, 80);
    const favoritesOnly = url.searchParams.get("favorite") === "true";
    const database = createEventsDatabase();

    let query = database
      .from("foods")
      .select("*")
      .eq("patient_id", patientId)
      .order("favorite", { ascending: false })
      .order("name", { ascending: true })
      .limit(100);

    if (search) query = query.ilike("name", `%${search.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`);
    if (favoritesOnly) query = query.eq("favorite", true);

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
    const parsed = validateFoodInput(await request.json());
    if (!parsed.success) return NextResponse.json(parsed, { status: 400 });

    const { data, error } = await createEventsDatabase()
      .from("foods")
      .insert({ ...parsed.data, patient_id: patientId })
      .select("*")
      .single();
    if (error) throw error;
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return failure(error);
  }
}
