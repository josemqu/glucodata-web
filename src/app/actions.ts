"use server";

import { LibreLinkUpClient, GlucoseData, Patient } from "@/lib/librelink";
import { supabase as supabaseAnon } from "@/lib/supabase";
import { createClient } from "@supabase/supabase-js";

// En una app real, estas credenciales vendrían de variables de entorno o de un formulario de login seguro
const LIBRE_EMAIL = process.env.LIBRE_EMAIL || "";
const LIBRE_PASSWORD = process.env.LIBRE_PASSWORD || "";

export async function getLatestGlucoseAction(
  email?: string,
  password?: string,
  sessionData?: { token: string; userId: string; region: string },
) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    const canWriteToSupabase = !!(supabaseUrl && serviceRoleKey);
    if (!serviceRoleKey) {
      console.warn(
        "SUPABASE_SERVICE_ROLE_KEY is not set. Server action will use anon key and may be blocked by RLS.",
      );
    }
    const supabase =
      supabaseUrl && serviceRoleKey
        ? createClient(supabaseUrl, serviceRoleKey, {
            auth: { persistSession: false, autoRefreshToken: false },
          })
        : supabaseAnon;

    const requestTime = Date.now();
    const client = new LibreLinkUpClient(
      email || LIBRE_EMAIL,
      password || LIBRE_PASSWORD,
      sessionData?.region,
      sessionData?.token,
      sessionData?.userId,
    );

    // Solo logueamos si no tenemos token
    if (!sessionData?.token) {
      await client.login();
    }
    const connections = await client.getConnections();

    if (connections.length === 0) {
      throw new Error("No hay pacientes conectados");
    }

    // Tomamos el primer paciente por defecto
    const patientId = connections[0].patientId;
    const { measurement: rawGlucose, graph: apiGraph } =
      await client.getGlucose(patientId);

    const onlineThresholdMs = 60 * 1000;
    const isRecentOnline =
      !!rawGlucose &&
      typeof rawGlucose.time === "number" &&
      requestTime - rawGlucose.time <= onlineThresholdMs;

    const glucose = isRecentOnline ? rawGlucose : null;

    // If the latest measurement is not online/recent, do not show historical graph
    // (requested behavior: graph should be empty when device is offline/stale)
    if (!glucose) {
      const currentSession = client.getSession();
      if (currentSession.token) {
        await supabase.from("provider_sessions").upsert({
          id: "librelinkup",
          token: currentSession.token,
          user_id: currentSession.userId,
          region: currentSession.region,
          updated_at: new Date().toISOString(),
        });
      }

      const lastGlucoseThresholdMs = 5 * 60 * 1000;
      const { data: lastRow, error: lastRowError } = await supabase
        .from("glucose_measurements")
        .select("timestamp,value,trend,is_high,is_low,unit")
        .eq("patient_id", patientId)
        .order("timestamp", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (lastRowError) {
        console.error("Error fetching last measurement from Supabase:", {
          message: lastRowError.message,
          code: (lastRowError as any).code,
          details: (lastRowError as any).details,
        });
      }

      const lastGlucoseTime = lastRow?.timestamp
        ? new Date(lastRow.timestamp).getTime()
        : null;
      const lastGlucoseIsFresh =
        typeof lastGlucoseTime === "number" &&
        Number.isFinite(lastGlucoseTime) &&
        requestTime - lastGlucoseTime <= lastGlucoseThresholdMs;

      const lastGlucose = lastGlucoseIsFresh
        ? ({
            value: Number(lastRow?.value),
            trend: Number(lastRow?.trend),
            time: lastGlucoseTime as number,
            isHigh: Boolean(lastRow?.is_high),
            isLow: Boolean(lastRow?.is_low),
            unit: String(lastRow?.unit ?? "mg/dL"),
            isRealtime: false,
          } satisfies GlucoseData)
        : null;

      return {
        success: true,
        data: {
          glucose: null,
          lastGlucose,
          graph: [],
          patient: connections[0],
          session: currentSession,
        },
      };
    }

    // Guardar datos en Supabase si existen
    if (glucose) {
      if (!canWriteToSupabase) {
        console.warn(
          "Skipping glucose_measurements upsert: missing SUPABASE_SERVICE_ROLE_KEY (RLS blocks anon writes).",
        );
      } else {
        const { error: upsertLatestError } = await supabase
          .from("glucose_measurements")
          .upsert(
            {
              timestamp: new Date(glucose.time).toISOString(),
              value: glucose.value,
              trend: glucose.trend,
              is_high: glucose.isHigh,
              is_low: glucose.isLow,
              unit: glucose.unit,
              patient_id: patientId,
            },
            { onConflict: "patient_id, timestamp" },
          );

        if (upsertLatestError) {
          console.error("Error upserting latest measurement to Supabase:", {
            message: upsertLatestError.message,
            code: (upsertLatestError as any).code,
            details: (upsertLatestError as any).details,
          });
        }
      }
    }

    // También podemos guardar los datos del gráfico de la API para poblar la base de datos inicialmente
    if (apiGraph && apiGraph.length > 0) {
      if (!canWriteToSupabase) {
        console.warn(
          "Skipping glucose_measurements graph upsert: missing SUPABASE_SERVICE_ROLE_KEY (RLS blocks anon writes).",
        );
      } else {
        const formattedGraph = apiGraph.map((m) => ({
          timestamp: new Date(m.time).toISOString(),
          value: m.value,
          trend: m.trend,
          is_high: m.isHigh,
          is_low: m.isLow,
          unit: m.unit,
          patient_id: patientId,
        }));

        await supabase
          .from("glucose_measurements")
          .upsert(formattedGraph, { onConflict: "patient_id, timestamp" });
      }
    }

    // Obtener historial de las últimas 24 horas desde Supabase
    const twentyFourHoursAgo = new Date(
      Date.now() - 24 * 60 * 60 * 1000,
    ).toISOString();
    const { data: dbHistory, error: dbError } = await supabase
      .from("glucose_measurements")
      .select("*")
      .eq("patient_id", patientId)
      .gte("timestamp", twentyFourHoursAgo)
      .order("timestamp", { ascending: true });

    if (dbError) {
      console.error("Error fetching from Supabase:", dbError);
    }

    // Mapear datos de la DB al formato GlucoseData
    const finalGraph: GlucoseData[] = (dbHistory || []).map((row) => ({
      value: Number(row.value),
      trend: row.trend,
      time: new Date(row.timestamp).getTime(),
      isHigh: row.is_high,
      isLow: row.is_low,
      unit: row.unit,
    }));

    // 7. Persist session for the background Edge Function (avoiding 429 errors)
    const currentSession = client.getSession();
    if (currentSession.token) {
      await supabase.from("provider_sessions").upsert({
        id: "librelinkup",
        token: currentSession.token,
        user_id: currentSession.userId,
        region: currentSession.region,
        updated_at: new Date().toISOString(),
      });
    }

    return {
      success: true,
      data: {
        glucose,
        graph: finalGraph.length > 0 ? finalGraph : apiGraph, // Usar DB preferentemente, fallback a API
        patient: connections[0],
        session: currentSession,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
    };
  }
}
