import { NextResponse } from "next/server";

import { createClient } from "@supabase/supabase-js";

const DEFAULT_TARGETS = { low: 70, high: 180, hypo: 60, hyper: 250 };
const ALLOWED_HOURS = new Set([1, 3, 6, 12, 24]);

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function GET(req: Request) {
  const apiToken = process.env.GLUCO_API_TOKEN || "";
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice("bearer ".length).trim()
    : "";

  if (!apiToken || !token || token !== apiToken) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401, headers: corsHeaders() },
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      { success: false, error: "Server is missing Supabase configuration" },
      { status: 500, headers: corsHeaders() },
    );
  }

  const requestURL = new URL(req.url);
  const requestedHours = Number(requestURL.searchParams.get("hours") ?? 24);
  const hours = ALLOWED_HOURS.has(requestedHours) ? requestedHours : 24;
  const startTime = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // The web app scopes its graph to the active LibreLink patient. The API token
  // has no patient identity of its own, so use the patient from the latest stored
  // measurement and apply the same patient_id filter to the requested window.
  const { data: latestMeasurement, error: latestError } = await supabase
    .from("glucose_measurements")
    .select("patient_id")
    .order("timestamp", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestError) {
    return NextResponse.json(
      { success: false, error: latestError.message },
      { status: 500, headers: corsHeaders() },
    );
  }

  const patientId = latestMeasurement?.patient_id;
  const historyQuery = supabase
    .from("glucose_measurements")
    .select("timestamp,value,unit")
    .gte("timestamp", startTime)
    .order("timestamp", { ascending: true });

  const [{ data: measurements, error }, { data: config, error: configError }] =
    await Promise.all([
      patientId ? historyQuery.eq("patient_id", patientId) : historyQuery.limit(0),
      supabase
        .from("glucose_target_config")
        .select("low,high,hypo,hyper")
        .eq("id", "default")
        .maybeSingle(),
    ]);

  if (error || configError) {
    return NextResponse.json(
      { success: false, error: error?.message ?? configError?.message },
      { status: 500, headers: corsHeaders() },
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
