"use server";

import { LibreLinkUpClient, GlucoseData, Patient } from "@/lib/librelink";
import { supabase } from "@/lib/supabase";

// En una app real, estas credenciales vendrían de variables de entorno o de un formulario de login seguro
const LIBRE_EMAIL = process.env.LIBRE_EMAIL || "";
const LIBRE_PASSWORD = process.env.LIBRE_PASSWORD || "";

export async function getLatestGlucoseAction(
  email?: string,
  password?: string,
  sessionData?: { token: string; userId: string; region: string },
) {
  try {
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

    // Guardar datos en Supabase si existen
    if (glucose) {
      await supabase.from("glucose_measurements").upsert(
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
    }

    // También podemos guardar los datos del gráfico de la API para poblar la base de datos inicialmente
    if (apiGraph && apiGraph.length > 0) {
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
