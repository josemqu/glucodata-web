import { NextResponse } from "next/server";

import { calculateTrend } from "@/lib/trend";
import { createClient } from "@supabase/supabase-js";

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
    { status: 401, headers: corsHeaders() },
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
      { status: 500, headers: corsHeaders() },
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Server is missing NEXT_PUBLIC_SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY",
      },
      { status: 500, headers: corsHeaders() },
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

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
      { status: 500, headers: corsHeaders() },
    );
  }

  const targets = {
    low: Number(configRow?.low ?? DEFAULT_TARGETS.low),
    high: Number(configRow?.high ?? DEFAULT_TARGETS.high),
    hypo: Number(configRow?.hypo ?? DEFAULT_TARGETS.hypo),
    hyper: Number(configRow?.hyper ?? DEFAULT_TARGETS.hyper),
  };

  // Fetch last ~70 mins to ensure we have enough points for the 60 min window
  const startTime = new Date(Date.now() - 70 * 60 * 1000).toISOString();

  const { data: recentData, error } = await supabase
    .from("glucose_measurements")
    .select("timestamp,value,trend,is_high,is_low,unit,patient_id")
    .gte("timestamp", startTime)
    .order("timestamp", { ascending: true });

  if (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500, headers: corsHeaders() },
    );
  }

  if (!recentData || recentData.length === 0) {
    return NextResponse.json(
      { success: true, data: null },
      { status: 200, headers: corsHeaders() },
    );
  }

  // Latest is the last one in ascending order
  const latest = recentData[recentData.length - 1];

  const historyForTrend = recentData.map((d) => ({
    time: new Date(d.timestamp).getTime(),
    value: Number(d.value),
  }));

  const calculatedTrend = calculateTrend(historyForTrend, 60);

  const value = Number(latest.value);
  const status = computeStatus(value, targets);

  return NextResponse.json(
    {
      success: true,
      data: {
        value,
        trend: latest.trend,
        trendState: calculatedTrend, // New field for advanced trend
        time: new Date(latest.timestamp).getTime(),
        timestamp: latest.timestamp,
        unit: latest.unit,
        isHigh: latest.is_high,
        isLow: latest.is_low,
        patientId: latest.patient_id,
        targets,
        status,
      },
    },
    { status: 200, headers: corsHeaders() },
  );
}
