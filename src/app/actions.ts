"use server";

import { LibreLinkUpClient, GlucoseData, Patient } from "@/lib/librelink";
import { supabase as supabaseAnon } from "@/lib/supabase";
import { createClient } from "@supabase/supabase-js";
import { calculateStats, calculatePercentiles, GlucoseStats, PercentilePoint } from "@/lib/metrics";

// En una app real, estas credenciales vendrían de variables de entorno o de un formulario de login seguro
const LIBRE_EMAIL = process.env.LIBRE_EMAIL || "";
const LIBRE_PASSWORD = process.env.LIBRE_PASSWORD || "";

// Simple in-memory cache for analysis results
const analysisCache = new Map<string, { data: any, timestamp: number }>();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

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

    const onlineThresholdMs = 5 * 60 * 1000;
    const isRecentOnline =
      !!rawGlucose &&
      typeof rawGlucose.time === "number" &&
      requestTime - rawGlucose.time <= onlineThresholdMs;

    const glucose = isRecentOnline ? rawGlucose : null;

    const twentyFourHoursAgo = new Date(
      Date.now() - 24 * 60 * 60 * 1000,
    ).toISOString();

    const fetchHistory = async () => {
      const { data: dbHistory, error: dbError } = await supabase
        .from("glucose_measurements")
        .select("*")
        .eq("patient_id", patientId)
        .gte("timestamp", twentyFourHoursAgo)
        .order("timestamp", { ascending: true });

      if (dbError) {
        console.error("Error fetching from Supabase:", dbError);
        return [];
      }

      return (dbHistory || []).map((row) => ({
        value: Number(row.value),
        trend: row.trend,
        time: new Date(row.timestamp).getTime(),
        isHigh: row.is_high,
        isLow: row.is_low,
        unit: row.unit,
      }));
    };

    // If the latest measurement is not online/recent, we still want to show history
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
        console.error("Error fetching last measurement from Supabase:", lastRowError);
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

      const history = await fetchHistory();

      return {
        success: true,
        data: {
          glucose: null,
          lastGlucose,
          graph: history,
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
          console.error("Error upserting latest measurement to Supabase:", upsertLatestError);
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

    const finalGraph = await fetchHistory();

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
export async function getHistoricalGlucoseAction(
  days: number = 7,
  email?: string,
  password?: string,
  sessionData?: { token: string; userId: string; region: string },
  targetConfig?: { low: number; high: number; hypo: number; hyper: number }
) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const client = new LibreLinkUpClient(
      email || LIBRE_EMAIL,
      password || LIBRE_PASSWORD,
      sessionData?.region,
      sessionData?.token,
      sessionData?.userId,
    );

    if (!sessionData?.token) {
      await client.login();
    }
    const connections = await client.getConnections();
    if (connections.length === 0) throw new Error("No hay pacientes conectados");
    const patientId = connections[0].patientId;

    // Check cache
    const cacheKey = `${patientId}_${days}_${JSON.stringify(targetConfig)}`;
    const cached = analysisCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
      return {
        success: true,
        data: cached.data
      };
    }

    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const { data: dbHistory, error: dbError } = await supabase
      .from("glucose_measurements")
      .select("*")
      .eq("patient_id", patientId)
      .gte("timestamp", startDate)
      .order("timestamp", { ascending: true });

    if (dbError) throw dbError;

    const history = (dbHistory || []).map((row) => ({
      value: Number(row.value),
      time: new Date(row.timestamp).getTime(),
    }));

    const stats = targetConfig ? calculateStats(history, targetConfig) : null;
    const percentileData = calculatePercentiles(history);

    const resultData = {
      stats,
      percentileData,
      // We still return history but only if specifically needed or for fallback
      // For now, let's keep it but it could be removed if we are sure the client won't need it
      history: history.length > 5000 ? [] : history, // Don't send massive history if it's too big
      patient: connections[0],
      days,
    };

    // Update cache
    analysisCache.set(cacheKey, { data: resultData, timestamp: Date.now() });

    return {
      success: true,
      data: resultData,
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
