import { NextResponse } from "next/server";

import { integrationContext } from "@/lib/server/integration-auth";

const DEFAULT_TARGETS = { low: 70, high: 180, hypo: 60, hyper: 250 };
const ALLOWED_HOURS = new Set([1, 3, 6, 12, 24]);

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "private, no-store",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function GET(req: Request) {
  let context;
  try { context = await integrationContext(req); }
  catch { return NextResponse.json({ success: false, error: "La integración no está disponible." }, { status: 503, headers: corsHeaders() }); }
  if (!context) return NextResponse.json({ success: false, error: "Token de integración inválido." }, { status: 401, headers: corsHeaders() });
  const { database: supabase, userId, patientId } = context;

  const requestURL = new URL(req.url);
  const requestedHours = Number(requestURL.searchParams.get("hours") ?? 24);
  const hours = ALLOWED_HOURS.has(requestedHours) ? requestedHours : 24;
  const startTime = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  const historyQuery = supabase
    .from("glucose_measurements")
    .select("timestamp,value,unit")
    .eq("user_id", userId)
    .eq("patient_id", patientId)
    .gte("timestamp", startTime)
    .order("timestamp", { ascending: true });

  const [{ data: measurements, error }, { data: config, error: configError }] =
    await Promise.all([
      historyQuery,
      supabase
        .from("glucose_target_config")
        .select("low,high,hypo,hyper")
        .eq("id", "default")
        .eq("user_id", userId)
        .maybeSingle(),
    ]);

  if (error || configError) {
    return NextResponse.json(
      { success: false, error: "No se pudo consultar el historial o la configuración." },
      { status: 503, headers: corsHeaders() },
    );
  }

  const targets = {
    low: Number(config?.low ?? DEFAULT_TARGETS.low),
    high: Number(config?.high ?? DEFAULT_TARGETS.high),
    hypo: Number(config?.hypo ?? DEFAULT_TARGETS.hypo),
    hyper: Number(config?.hyper ?? DEFAULT_TARGETS.hyper),
  };

  return NextResponse.json(
    {
      success: true,
      data: {
        hours,
        targets,
        readings: (measurements ?? []).map((measurement) => ({
          value: Number(measurement.value),
          timestamp: measurement.timestamp,
          unit: measurement.unit ?? "mg/dL",
        })),
      },
    },
    { status: 200, headers: corsHeaders() },
  );
}
