"use server";

import { GlucoseData } from "@/lib/librelink";
import { libreContext, loginUser, logoutUser } from "@/lib/server/user-auth";

import { calculateStats, calculatePercentiles } from "@/lib/metrics";

// Simple in-memory cache for analysis results
type MonitorDayResult = {
  graph: Array<{
    value: number;
    trend: number | string | null;
    time: number;
    isHigh: boolean | null;
    isLow: boolean | null;
    unit: string | null;
  }>;
  from: string;
  to: string;
  hasData: boolean;
};

const analysisCache = new Map<string, { data: { stats: ReturnType<typeof calculateStats> | null; percentileData: ReturnType<typeof calculatePercentiles>; history: { value: number; time: number }[]; patient: import("@/lib/librelink").Patient; days: number }, timestamp: number }>();
const monitorDayCache = new Map<string, { data: MonitorDayResult, timestamp: number }>();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes
const MONITOR_DAY_PAGE_SIZE = 500;
const MONITOR_DAY_MAX_ROWS = 5000;

export async function getLatestGlucoseAction(
  email?: string,
  password?: string,
  sessionData?: { token: string; userId: string; region: string },
) {
  try {
    if (email && password && !sessionData?.token) await loginUser(email, password);
    const { database: supabase, client, patientId, connections, userId } = await libreContext(email, password);
    const requestTime = Date.now();
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

    const readings = new Map(apiGraph.map(reading => [reading.time, reading]));
    if (glucose) readings.set(glucose.time, glucose);
    if (readings.size && process.env.GLUCO_IMPORTS_PAUSED !== "true") {
      const { error } = await supabase.from("glucose_measurements").upsert(
        [...readings.values()].map(reading => ({
          user_id: userId, patient_id: patientId, timestamp: new Date(reading.time).toISOString(),
          value: reading.value, trend: reading.trend, is_high: reading.isHigh,
          is_low: reading.isLow, unit: reading.unit,
        })), { onConflict: "user_id,patient_id,timestamp" },
      );
      if (error) throw new Error("No se pudieron guardar las mediciones.");
    }

    // If the latest measurement is not online/recent, we still want to show history
    if (!glucose) {
      const currentSession = { token: "internal", userId, region: "" };


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

    const finalGraph = await fetchHistory();

    // Browser compatibility marker; provider tokens stay on the server.
    const currentSession = { token: "internal", userId, region: "" };


    return {
      success: true,
      data: {
        glucose,
        graph: finalGraph.length > 0 ? finalGraph : apiGraph, // Usar DB preferentemente, fallback a API
        patient: connections[0],
        session: currentSession,
      },
    };
  } catch (error: unknown) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "No se pudo completar la consulta.",
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
    const { database: supabase, patientId, connections, userId } = await libreContext(email, password);

    // Check cache
    const cacheKey = `${userId}:${patientId}_${days}_${JSON.stringify(targetConfig)}`;
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
  } catch (error: unknown) {
    return { success: false, error: error instanceof Error ? error.message : "No se pudo completar la consulta." };
  }
}

export async function getMonitorGlucoseDayAction(
  startIso: string,
  endIso: string,
  email?: string,
  password?: string,
  _sessionData?: { token: string; userId: string; region: string },
) {
  void _sessionData; // Legacy argument retained for existing callers; never authorizes database access.
  try {
    const start = new Date(startIso);
    const end = new Date(endIso);
    const duration = end.getTime() - start.getTime();
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || duration < 20 * 60 * 60 * 1000 || duration > 28 * 60 * 60 * 1000) {
      return { success: false, error: "El rango diario no es válido." };
    }

    const { database: supabase, patientId, userId } = await libreContext(email, password);
    const cacheKey = `${userId}:${patientId}:${start.toISOString()}:${end.toISOString()}`;
    const cached = monitorDayCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return { success: true, data: cached.data };
    }

    const rows: Array<{
      timestamp: string;
      value: number | string;
      trend: number | string | null;
      is_high: boolean | null;
      is_low: boolean | null;
      unit: string | null;
    }> = [];
    for (let offset = 0; offset < MONITOR_DAY_MAX_ROWS; offset += MONITOR_DAY_PAGE_SIZE) {
      const { data: page, error } = await supabase
        .from("glucose_measurements")
        .select("timestamp,value,trend,is_high,is_low,unit")
        .eq("patient_id", patientId)
        .gte("timestamp", start.toISOString())
        .lt("timestamp", end.toISOString())
        .order("timestamp", { ascending: true })
        .range(offset, offset + MONITOR_DAY_PAGE_SIZE - 1);

      if (error) throw error;
      rows.push(...(page ?? []));
      if (!page || page.length < MONITOR_DAY_PAGE_SIZE) break;
      if (rows.length >= MONITOR_DAY_MAX_ROWS) {
        throw new Error("El día contiene más lecturas de las que se pueden cargar de forma segura.");
      }
    }

    const graph = rows.map((row) => ({
      value: Number(row.value),
      trend: row.trend as number | string | null,
      time: new Date(row.timestamp).getTime(),
      isHigh: row.is_high as boolean | null,
      isLow: row.is_low as boolean | null,
      unit: row.unit as string | null,
    }));
    const resultData = {
      graph,
      from: start.toISOString(),
      to: end.toISOString(),
      hasData: graph.length > 0,
    };
    monitorDayCache.set(cacheKey, { data: resultData, timestamp: Date.now() });

    return {
      success: true,
      data: resultData,
    };
  } catch (error: unknown) {
    return { success: false, error: error instanceof Error ? error.message : "No se pudo cargar el día seleccionado." };
  }
}

export async function logoutAction() { await logoutUser(); }
