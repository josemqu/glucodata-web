import { NextResponse } from "next/server";

import { supabase } from "@/lib/supabase";

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

  return NextResponse.json(
    {
      success: true,
      data: {
        value: Number(data.value),
        trend: data.trend,
        time: new Date(data.timestamp).getTime(),
        timestamp: data.timestamp,
        unit: data.unit,
        isHigh: data.is_high,
        isLow: data.is_low,
        patientId: data.patient_id,
      },
    },
    { status: 200, headers: corsHeaders() }
  );
}
