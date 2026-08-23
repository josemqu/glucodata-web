import { NextResponse } from "next/server";

import { analyzeEventGlucose, type GlucoseReading } from "@/lib/event-analysis";
import type { GlucoEvent } from "@/lib/events";
import {
  createEventsDatabase,
  EventAuthError,
  requireActivePatient,
} from "@/lib/server/event-auth";

type RouteContext = { params: Promise<{ id: string }> };
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function failure(error: unknown) {
  const status = error instanceof EventAuthError ? error.status : 500;
  const message = error instanceof Error ? error.message : "No se pudo analizar el evento.";
  return NextResponse.json({ success: false, error: message }, { status });
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const patientId = await requireActivePatient(request);
    const { id } = await context.params;
    if (!UUID_PATTERN.test(id)) return NextResponse.json({ success: false, error: "El identificador del evento no es válido." }, { status: 400 });
    const database = createEventsDatabase();
    const { data: event, error: eventError } = await database
      .from("events")
      .select("*")
      .eq("id", id)
      .eq("patient_id", patientId)
      .maybeSingle<GlucoEvent>();

    if (eventError) throw eventError;
    if (!event) return NextResponse.json({ success: false, error: "Evento no encontrado." }, { status: 404 });

    const preliminary = analyzeEventGlucose(event.type, event.occurred_at, []);
    const [readingsResult, targetsResult] = await Promise.all([
      database
        .from("glucose_measurements")
        .select("timestamp,value,unit")
        .eq("patient_id", patientId)
        .gte("timestamp", preliminary.window.start)
        .lte("timestamp", preliminary.window.end)
        .order("timestamp", { ascending: true }),
      database
        .from("glucose_target_config")
        .select("low,high")
        .eq("id", "default")
        .maybeSingle(),
    ]);
    if (readingsResult.error) throw readingsResult.error;
    if (targetsResult.error) throw targetsResult.error;

    const readings: GlucoseReading[] = (readingsResult.data ?? []).map((row) => {
      const usesMmol = String(row.unit ?? "mg/dL").toLowerCase().includes("mmol");
      return {
        timestamp: row.timestamp,
        value: usesMmol ? Number(row.value) / 18.0182 : Number(row.value),
        unit: usesMmol ? "mmol/L" : "mg/dL",
      };
    });
    const units = new Set(readings.map((reading) => reading.unit));
    if (units.size > 1) {
      throw new Error("La ventana contiene lecturas con unidades incompatibles.");
    }
    const usesMmol = readings[0]?.unit === "mmol/L";
    const effectiveTargets = {
      low: usesMmol ? Number(targetsResult.data?.low ?? 70) / 18.0182 : Number(targetsResult.data?.low ?? 70),
      high: usesMmol ? Number(targetsResult.data?.high ?? 180) / 18.0182 : Number(targetsResult.data?.high ?? 180),
    };
    const analysis = analyzeEventGlucose(event.type, event.occurred_at, readings, new Date(), effectiveTargets);

    return NextResponse.json({
      success: true,
      data: {
        event,
        readings,
        analysis,
        relatedEvents: [],
        targets: effectiveTargets,
      },
    });
  } catch (error) {
    return failure(error);
  }
}
