import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import { LibreLinkUpClient } from "../_shared/librelink.ts";

const LIBRE_EMAIL = Deno.env.get("LIBRE_EMAIL");
const LIBRE_PASSWORD = Deno.env.get("LIBRE_PASSWORD");

Deno.serve(async (_req: Request) => {
  console.log("Starting Glucose Sync...");
  const requestTime = Date.now();

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    // 1. Get current session
    const { data: sessionData, error: sessionError } = await supabase
      .from("provider_sessions")
      .select("*")
      .eq("id", "librelinkup")
      .single();

    if (sessionError && sessionError.code !== "PGRST116") {
      throw sessionError;
    }

    const client = new LibreLinkUpClient(
      LIBRE_EMAIL,
      LIBRE_PASSWORD,
      sessionData?.region,
      sessionData?.token,
      sessionData?.user_id,
    );

    // 2. Try to get data (using existing token if available)
    let connections;
    try {
      if (!sessionData?.token) throw new Error("No token stored");
      connections = await client.getConnections();
    } catch (e) {
      console.log("Token invalid or expired, logging in again...");
      await client.login();
      connections = await client.getConnections();
    }

    if (connections.length === 0) {
      throw new Error("No connected patients found");
    }

    const patientId = connections[0].patientId;
    const { measurement, graph } = await client.getGlucose(patientId);
    const onlineThresholdMs = 60 * 1000;
    const isRecentOnline =
      !!measurement &&
      typeof measurement.time === "number" &&
      requestTime - measurement.time <= onlineThresholdMs;

    // 3. Save latest measurement
    if (isRecentOnline && measurement) {
      console.log(
        `Saving measurement: ${measurement.value} @ ${new Date(measurement.time).toISOString()}`,
      );
      const { error: upsertError } = await supabase
        .from("glucose_measurements")
        .upsert(
          {
            timestamp: new Date(measurement.time).toISOString(),
            value: measurement.value,
            trend: measurement.trend,
            is_high: measurement.isHigh,
            is_low: measurement.isLow,
            unit: measurement.unit,
            patient_id: patientId,
          },
          { onConflict: "patient_id, timestamp" },
        );

      if (upsertError) throw upsertError;
    }

    // 4. Also upsert historical graph data to fill gaps
    if (graph && graph.length > 0) {
      const historicalData = graph.map((m) => ({
        timestamp: new Date(m.time).toISOString(),
        value: m.value,
        trend: m.trend,
        is_high: m.isHigh,
        is_low: m.isLow,
        unit: m.unit,
        patient_id: patientId,
      }));

      const { error: graphError } = await supabase
        .from("glucose_measurements")
        .upsert(historicalData, { onConflict: "patient_id, timestamp" });
      if (graphError)
        console.warn("Error upserting historical data:", graphError);
    }

    // 5. Persist updated session (CRITICAL to avoid 429)
    const newSession = client.getSession();
    const { error: updateError } = await supabase
      .from("provider_sessions")
      .upsert({
        id: "librelinkup",
        token: newSession.token,
        user_id: newSession.userId,
        region: newSession.region,
        updated_at: new Date().toISOString(),
      });

    if (updateError) throw updateError;

    return new Response(
      JSON.stringify({
        success: true,
        message: "Sync complete",
        value: measurement?.value,
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Sync Error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
