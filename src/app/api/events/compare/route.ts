import { NextResponse } from "next/server";

import { analyzeEventGlucose, type GlucoseReading } from "@/lib/event-analysis";
import { buildEventComparison } from "@/lib/event-comparison";
import type { GlucoEvent } from "@/lib/events";
import { createEventsDatabase, EventAuthError, requireActivePatient } from "@/lib/server/event-auth";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function failure(error: unknown) {
  const status = error instanceof EventAuthError ? error.status : 500;
  const message = error instanceof Error ? error.message : "No se pudieron comparar los eventos.";
  return NextResponse.json({ success: false, error: message }, { status });
}

export async function POST(request: Request) {
  try {
    const patientId = await requireActivePatient(request);
    const body = await request.json() as { event_ids?: unknown };
    if (!Array.isArray(body.event_ids)) {
      return NextResponse.json({ success: false, error: "Enviá los eventos que querés comparar." }, { status: 400 });
    }
    const eventIds = [...new Set(body.event_ids.filter((id): id is string => typeof id === "string"))];
    if (eventIds.length < 2 || eventIds.length > 8 || eventIds.some((id) => !UUID_PATTERN.test(id))) {
      return NextResponse.json({ success: false, error: "Seleccioná entre 2 y 8 eventos válidos." }, { status: 400 });
    }

    const database = createEventsDatabase();
    const { data: eventRows, error: eventError } = await database
      .from("events")
      .select("*")
      .eq("patient_id", patientId)
      .in("id", eventIds);
    if (eventError) throw eventError;
    const events = (eventRows ?? []) as GlucoEvent[];
    if (events.length !== eventIds.length) {
      return NextResponse.json({ success: false, error: "Uno o más eventos no están disponibles." }, { status: 404 });
    }
    if (new Set(events.map((event) => event.type)).size !== 1) {
      return NextResponse.json({ success: false, error: "Elegí eventos del mismo tipo para obtener una comparación válida." }, { status: 422 });
    }

    const windows = events.map((event) => analyzeEventGlucose(event.type, event.occurred_at, []).window);
    const [readingResults, targetsResult] = await Promise.all([
      Promise.all(windows.map((window) => database
        .from("glucose_measurements")
        .select("timestamp,value,unit")
        .eq("patient_id", patientId)
        .gte("timestamp", window.start)
        .lte("timestamp", window.end)
        .order("timestamp", { ascending: true }))),
      database.from("glucose_target_config").select("low,high").eq("id", "default").maybeSingle(),
    ]);
    const readingError = readingResults.find((result) => result.error)?.error;
    if (readingError) throw readingError;
    if (targetsResult.error) throw targetsResult.error;

    const rawReadings = readingResults.flatMap((result) => result.data ?? []);
    const displayUnits = new Set(rawReadings.map((row) => String(row.unit ?? "mg/dL").toLowerCase().includes("mmol") ? "mmol/L" : "mg/dL"));
    if (displayUnits.size > 1) {
      return NextResponse.json({ success: false, error: "El período contiene unidades de glucosa incompatibles." }, { status: 422 });
    }
    const usesMmol = displayUnits.has("mmol/L");
    const unit = usesMmol ? "mmol/L" : "mg/dL";
    const targets = {
      low: usesMmol ? Number(targetsResult.data?.low ?? 70) / 18.0182 : Number(targetsResult.data?.low ?? 70),
      high: usesMmol ? Number(targetsResult.data?.high ?? 180) / 18.0182 : Number(targetsResult.data?.high ?? 180),
    };
    const now = new Date();
    const comparison = buildEventComparison(events.map((event, index) => {
      const eventReadings: GlucoseReading[] = (readingResults[index].data ?? []).map((row) => ({
        timestamp: row.timestamp,
        value: usesMmol ? Number(row.value) / 18.0182 : Number(row.value),
        unit,
      }));
      return {
        event,
        readings: eventReadings,
        analysis: analyzeEventGlucose(event.type, event.occurred_at, eventReadings, now, targets),
      };
    }));

    return NextResponse.json({ success: true, data: comparison });
  } catch (error) {
    return failure(error);
  }
}
