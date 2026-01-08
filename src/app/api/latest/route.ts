import { NextResponse } from "next/server";

import { supabase } from "@/lib/supabase";

const DEFAULT_TARGETS = {
  low: 70,
  high: 180,
  hypo: 60,
  hyper: 250,
};

function computeStatus(val: number, targets: typeof DEFAULT_TARGETS) {
  if (!Number.isFinite(val)) {
    return { label: "SIN DATOS", colorKey: "unknown" as const };
  }
  if (val <= targets.hypo) {
    return { label: "HIPO", colorKey: "critical" as const };
  }
  if (val < targets.low) {
    return { label: "BAJA", colorKey: "warning" as const };
  }
  if (val >= targets.hyper) {
    return { label: "HIPER", colorKey: "critical" as const };
  }
  if (val > targets.high) {
    return { label: "ALTA", colorKey: "warning" as const };
  }
  return { label: "OBJETIVO", colorKey: "ok" as const };
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };
}

function unauthorized() {
  return NextResponse.json(
    { success: false, error: "Unauthorized" },
    { status: 401, headers: corsHeaders() }
  );
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function GET(req: Request) {
  const apiToken = process.env.GLUCO_API_TOKEN || "";
  if (!apiToken) {
    return NextResponse.json(
      { success: false, error: "Server is missing GLUCO_API_TOKEN" },
      { status: 500, headers: corsHeaders() }
    );
  }

  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice("bearer ".length).trim()
    : "";

  if (!token || token !== apiToken) {
    return unauthorized();
  }

  const { data: configRow, error: configError } = await supabase
    .from("glucose_target_config")
    .select("low,high,hypo,hyper")
    .eq("id", "default")
    .maybeSingle();

  if (configError) {
    return NextResponse.json(
      { success: false, error: configError.message },
      { status: 500, headers: corsHeaders() }
    );
  }

  const targets = {
    low: Number(configRow?.low ?? DEFAULT_TARGETS.low),
    high: Number(configRow?.high ?? DEFAULT_TARGETS.high),
    hypo: Number(configRow?.hypo ?? DEFAULT_TARGETS.hypo),
    hyper: Number(configRow?.hyper ?? DEFAULT_TARGETS.hyper),
  };

  const { data, error } = await supabase
    .from("glucose_measurements")
    .select("timestamp,value,trend,is_high,is_low,unit,patient_id")
    .order("timestamp", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500, headers: corsHeaders() }
    );
  }

  if (!data) {
    return NextResponse.json(
      { success: true, data: null },
      { status: 200, headers: corsHeaders() }
    );
  }

  const value = Number(data.value);
  const status = computeStatus(value, targets);

  return NextResponse.json(
    {
      success: true,
      data: {
        value,
        trend: data.trend,
        time: new Date(data.timestamp).getTime(),
        timestamp: data.timestamp,
        unit: data.unit,
        isHigh: data.is_high,
        isLow: data.is_low,
        patientId: data.patient_id,
        targets,
        status,
      },
    },
    { status: 200, headers: corsHeaders() }
  );
}
