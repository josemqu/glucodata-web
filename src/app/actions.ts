"use server";

import { GlucoseData } from "@/lib/librelink";
import { adminDatabase, libreContext, logoutUser, requireUser, EventAuthError } from "@/lib/server/user-auth";

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
type YearOverviewDay = { date: string; average: number; count: number; timeInRangePercent: number | null; coverageMinutes: number };
const yearOverviewCache = new Map<string, { data: YearOverviewDay[]; timestamp: number }>();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes
const MONITOR_DAY_PAGE_SIZE = 500;
const MONITOR_DAY_MAX_ROWS = 5000;
const YEAR_OVERVIEW_PAGE_SIZE = 1000;
const YEAR_OVERVIEW_PAGE_BATCH_SIZE = 32;
const YEAR_OVERVIEW_MAX_ROWS = 250_000;
const YEAR_OVERVIEW_MAX_GAP_MS = 15 * 60 * 1000;
const YEAR_OVERVIEW_LAST_READING_MS = 5 * 60 * 1000;

const analysisTokens = new Map<string, { valid: boolean }>();
function analysisToken(userId: string) {
  let token = analysisTokens.get(userId);
  if (!token) {
    if (analysisTokens.size >= 128) {
      const oldest = analysisTokens.keys().next().value!;
      analysisTokens.get(oldest)!.valid = false;
      analysisTokens.delete(oldest);
    }
    token = { valid: true };
    analysisTokens.set(userId, token);
  }
  return token;
}
function invalidateAnalysisResults(userId: string) {
  const token = analysisTokens.get(userId);
  if (token) token.valid = false;
  analysisTokens.delete(userId);
  for (const key of analysisCache.keys()) if (key.startsWith(`${userId}:`)) analysisCache.delete(key);
  for (const key of yearOverviewCache.keys()) if (key.startsWith(`${userId}:`)) yearOverviewCache.delete(key);
}

function dateKeyInTimeZone(timestamp: string, formatter: Intl.DateTimeFormat) {
  const parts = formatter.formatToParts(new Date(timestamp));
  let year = "";
  let month = "";
  let day = "";
  for (const part of parts) {
    if (part.type === "year") year = part.value;
    else if (part.type === "month") month = part.value;
    else if (part.type === "day") day = part.value;
  }
  return `${year}-${month}-${day}`;
}

function localMidnightUtc(year: number, month: number, day: number, timeZone: string, formatter?: Intl.DateTimeFormat) {
  const wanted = Date.UTC(year, month, day);
  let candidate = wanted;
  for (let attempt = 0; attempt < 3; attempt++) {
    const parts = (formatter ?? new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })).formatToParts(new Date(candidate));
    const values = new Map(parts.map((part) => [part.type, Number(part.value)]));
    const represented = Date.UTC(
      values.get("year") ?? year,
      (values.get("month") ?? month + 1) - 1,
      values.get("day") ?? day,
      values.get("hour") ?? 0,
      values.get("minute") ?? 0,
      values.get("second") ?? 0,
    );
    const correction = wanted - represented;
    if (correction === 0) break;
    candidate += correction;
  }
  return new Date(candidate).toISOString();
}

export async function getYearOverviewAction(
  year: number,
  timeZone = "UTC",
  targets: { low: number; high: number } = { low: 70, high: 180 },
  refresh = false,
) {
  try {
    // Validate the zone first, then use its local year at the server boundary.
    const currentYear = Number(new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric" }).format(new Date()));
    if (!Number.isInteger(year) || year < 2000 || year > currentYear) {
      return { success: false, error: "El año seleccionado no es válido." };
    }
    if (!Number.isFinite(targets.low) || !Number.isFinite(targets.high) || targets.low >= targets.high) {
      return { success: false, error: "Los umbrales de glucosa no son válidos." };
    }

    const { userId, database: supabase } = await requireUser();
    const { data: providerSession, error: sessionError } = await adminDatabase()
      .from("user_provider_sessions")
      .select("patient_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (sessionError || !providerSession?.patient_id) {
      throw new EventAuthError("Volvé a iniciar sesión con LibreLinkUp.", 401);
    }
    const patientId = providerSession.patient_id;
    if (refresh) invalidateAnalysisResults(userId);
    const token = analysisToken(userId);
    const cacheKey = `${userId}:${patientId}:${year}:${timeZone}:${targets.low}:${targets.high}`;
    const cached = yearOverviewCache.get(cacheKey);
    if (!refresh && cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return { success: true, data: cached.data, validForMs: CACHE_TTL - (Date.now() - cached.timestamp) };
    }

    const queryStarted = Date.now();
    const start = localMidnightUtc(year, 0, 1, timeZone);
    const end = localMidnightUtc(year + 1, 0, 1, timeZone);
    const dateFormatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const daily = new Map<string, { sum: number; count: number; inRangeMs: number; coveredMs: number }>();
    const midnightFormatter = new Intl.DateTimeFormat("en-US", {
      timeZone, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
    });
    const midnightCache = new Map<string, number>();
    const previousReading: { current: { time: number; value: number; date: string } | null } = { current: null };
    const addDuration = (reading: { time: number; value: number; date: string }, durationMs: number) => {
      if (durationMs <= 0) return;
      const current = daily.get(reading.date);
      if (!current) return;
      current.coveredMs += durationMs;
      if (reading.value >= targets.low && reading.value <= targets.high) current.inRangeMs += durationMs;
    };
    const localMidnightAfter = (date: string) => {
      const cachedMidnight = midnightCache.get(date);
      if (cachedMidnight !== undefined) return cachedMidnight;
      const [localYear, localMonth, localDay] = date.split("-").map(Number);
      const midnight = Date.parse(localMidnightUtc(localYear, localMonth - 1, localDay + 1, timeZone, midnightFormatter));
      midnightCache.set(date, midnight);
      return midnight;
    };
    const readPage = (from: number, to: number, withCount = false) => supabase
        .from("glucose_measurements")
        .select("timestamp,value", withCount ? { count: "exact" } : undefined)
        .eq("user_id", userId)
        .eq("patient_id", patientId)
        .gte("timestamp", start)
        .lt("timestamp", end)
        .order("timestamp", { ascending: true })
        .range(from, to);

    const first = await readPage(0, YEAR_OVERVIEW_PAGE_SIZE - 1, true);
    if (first.error) throw first.error;
    const totalRows = first.count ?? first.data?.length ?? 0;
    if (first.count === null && (first.data?.length ?? 0) === YEAR_OVERVIEW_PAGE_SIZE) {
      throw new Error("No se pudo determinar cuántas lecturas tiene el año para resumirlas con seguridad.");
    }
    if (totalRows > YEAR_OVERVIEW_MAX_ROWS) {
      throw new Error("El año contiene más lecturas de las que se pueden resumir de forma segura.");
    }

    let localDate = "";
    let nextMidnight = -Infinity;
    const pageSize = first.data?.length || YEAR_OVERVIEW_PAGE_SIZE;
    if (totalRows > 0 && !first.data?.length) throw new Error("El historial anual está incompleto.");
    const aggregate = (rows: Array<{ timestamp: string; value: number | string }>) => {
      for (const row of rows) {
        const value = Number(row.value);
        const time = Date.parse(row.timestamp);
        if (!Number.isFinite(value) || !Number.isFinite(time)) continue;
        // Pages are chronological. Format only when crossing a local midnight.
        if (time >= nextMidnight) {
          localDate = dateKeyInTimeZone(row.timestamp, dateFormatter);
          nextMidnight = localMidnightAfter(localDate);
        }
        const date = localDate;
        if (previousReading.current) {
          let durationMs = Math.min(Math.max(0, time - previousReading.current.time), YEAR_OVERVIEW_MAX_GAP_MS);
          if (date !== previousReading.current.date) {
            durationMs = Math.min(durationMs, Math.max(0, localMidnightAfter(previousReading.current.date) - previousReading.current.time));
          }
          addDuration(previousReading.current, durationMs);
        }
        const current = daily.get(date) ?? { sum: 0, count: 0, inRangeMs: 0, coveredMs: 0 };
        current.sum += value;
        current.count += 1;
        daily.set(date, current);
        previousReading.current = { time, value, date };
      }
    };
    aggregate(first.data ?? []);

    const offsets = Array.from({ length: Math.ceil(Math.max(0, totalRows - pageSize) / pageSize) }, (_, index) => pageSize * (index + 1));
    const pages: Array<Awaited<ReturnType<typeof readPage>>> = new Array(offsets.length);
    let nextPage = 0;
    // Keep the same concurrency bound while immediately filling a freed slot.
    // A slow page must not stall the next batch of independent reads.
    await Promise.all(Array.from({ length: Math.min(YEAR_OVERVIEW_PAGE_BATCH_SIZE, offsets.length) }, async () => {
      while (nextPage < offsets.length) {
        const index = nextPage++;
        const offset = offsets[index];
        const page = await readPage(offset, Math.min(offset + pageSize - 1, totalRows - 1));
        if (page.error) throw page.error;
        if (page.data?.length !== Math.min(pageSize, totalRows - offset)) throw new Error("El historial anual está incompleto.");
        pages[index] = page;
      }
    }));
    // Aggregate in chronological order to preserve duration weighting across pages.
    for (const page of pages) aggregate(page.data ?? []);

    if (previousReading.current) {
      const untilMidnight = Math.max(0, localMidnightAfter(previousReading.current.date) - previousReading.current.time);
      addDuration(previousReading.current, Math.min(YEAR_OVERVIEW_LAST_READING_MS, untilMidnight));
    }

    const result = [...daily.entries()]
      .map(([date, { sum, count, inRangeMs, coveredMs }]) => ({
        date,
        average: sum / count,
        count,
        timeInRangePercent: coveredMs > 0 ? (inRangeMs / coveredMs) * 100 : null,
        coverageMinutes: coveredMs / 60_000,
      }))
      .sort((first, second) => first.date.localeCompare(second.date));
    if (yearOverviewCache.size >= 64) yearOverviewCache.delete(yearOverviewCache.keys().next().value!);
    if (token.valid) yearOverviewCache.set(cacheKey, { data: result, timestamp: queryStarted });
    return { success: true, data: result, validForMs: token.valid ? Math.max(0, CACHE_TTL - (Date.now() - queryStarted)) : 0 };
  } catch (error: unknown) {
    return {
      success: false,
      error: error instanceof EventAuthError ? error.message : "No se pudo cargar el resumen anual.",
    };
  }
}

export async function getLatestGlucoseAction(
  email?: string,
  password?: string,
  sessionData?: { token: string; userId: string; region: string },
) {
  try {
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
        console.error("No se pudo consultar el historial.");
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
      invalidateAnalysisResults(userId);
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
        console.error("No se pudo consultar la última medición.");
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
      error: error instanceof EventAuthError ? error.message : "No se pudo completar la consulta.",
    };
  }
}
export async function getHistoricalGlucoseAction(
  days: number = 7,
  email?: string,
  password?: string,
  sessionData?: { token: string; userId: string; region: string },
  targetConfig?: { low: number; high: number; hypo: number; hyper: number },
  timeZone = "UTC",
  refresh = false,
) {
  try {
    const { database: supabase, patientId, connections, userId } = await libreContext(email, password);

    if (refresh) invalidateAnalysisResults(userId);
    const token = analysisToken(userId);
    // Check cache
    const cacheKey = `${userId}:${patientId}_${days}_${JSON.stringify(targetConfig)}_${timeZone}`;
    const cached = analysisCache.get(cacheKey);
    if (!refresh && cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
      return {
        success: true,
        data: cached.data,
        validForMs: CACHE_TTL - (Date.now() - cached.timestamp),
      };
    }

    if (![7, 14, 30, 90].includes(days)) {
      throw new Error("Ventana de análisis no válida.");
    }
    const queryStarted = Date.now();
    const endDate = new Date().toISOString();
    const startDate = new Date(Date.parse(endDate) - days * 24 * 60 * 60 * 1000).toISOString();
    // Disjoint half-open windows allow bounded concurrency without relying on
    // the Data API's configured page cap. Each window still follows every cursor.
    const startMs = Date.parse(startDate);
    const endMs = Date.parse(endDate);
    const windows = await Promise.all(Array.from({ length: 8 }, async (_, index) => {
      const from = new Date(startMs + Math.floor((endMs - startMs) * index / 8)).toISOString();
      const to = new Date(startMs + Math.floor((endMs - startMs) * (index + 1) / 8)).toISOString();
      const readings: { value: number; time: number }[] = [];
      let after: string | undefined;
      while (true) {
        let query = supabase.from("glucose_measurements")
          .select("timestamp,value")
          .eq("user_id", userId).eq("patient_id", patientId)
          .gte("timestamp", from)
          .order("timestamp", { ascending: true }).limit(1000);
        query = index === 7 ? query.lte("timestamp", to) : query.lt("timestamp", to);
        if (after) query = query.gt("timestamp", after);
        const { data, error } = await query;
        if (error) throw error;
        if (!data?.length) break;
        for (const row of data) readings.push({ value: Number(row.value), time: Date.parse(row.timestamp) });
        if (readings.length > 250_000) throw new Error("Demasiadas mediciones para analizar el período completo.");
        after = data[data.length - 1].timestamp;
      }
      return readings;
    }));
    const history = windows.flat();
    if (history.length > 250_000) throw new Error("Demasiadas mediciones para analizar el período completo.");

    const stats = targetConfig ? calculateStats(history, targetConfig) : null;
    const percentileData = calculatePercentiles(history, timeZone);

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
    if (analysisCache.size >= 64) analysisCache.delete(analysisCache.keys().next().value!);
    if (token.valid) analysisCache.set(cacheKey, { data: resultData, timestamp: queryStarted });

    return {
      success: true,
      data: resultData,
      validForMs: token.valid ? Math.max(0, CACHE_TTL - (Date.now() - queryStarted)) : 0,
    };
  } catch (error: unknown) {
    return { success: false, error: error instanceof EventAuthError ? error.message : "No se pudo completar la consulta." };
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
    return { success: false, error: error instanceof EventAuthError ? error.message : "No se pudo cargar el día seleccionado." };
  }
}

export async function logoutAction() { await logoutUser(); }

export async function getSessionAction() {
  try {
    const { userId } = await requireUser();
    return { token: "internal", userId, region: "" };
  } catch { return null; }
}
