import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import { LibreLinkUpClient } from "../_shared/librelink.ts";

Deno.serve(async (request: Request) => {
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const syncSecret = Deno.env.get("GLUCO_SYNC_SECRET");
  const bearer = request.headers.get("authorization");
  if (bearer !== `Bearer ${serviceKey}` && (!syncSecret || bearer !== `Bearer ${syncSecret}`)) {
    return new Response("Unauthorized", { status: 401 });
  }
  const database = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  let completed = 0;
  let failed = 0;
  try {
    // Stable keyset pagination; one expired provider token cannot stop others.
    let after = "";
    while (true) {
      let query = database.from("user_provider_sessions").select("user_id,librelink_user_id,patient_id,token,region").order("user_id").limit(100);
      if (after) query = query.gt("user_id", after);
      const { data: sessions, error } = await query;
      if (error) throw error;
      if (!sessions?.length) break;
      for (const session of sessions) {
        after = session.user_id;
        try {
          const client = new LibreLinkUpClient(undefined, undefined, session.region, session.token, session.librelink_user_id);
          const connections = await client.getConnections();
          if (!connections.some(patient => patient.patientId === session.patient_id)) throw new Error("Patient access revoked");
          const { measurement, graph } = await client.getGlucose(session.patient_id);
          const readings = new Map(graph.map(reading => [reading.time, reading]));
          if (measurement && Date.now() - measurement.time <= 5 * 60 * 1000) readings.set(measurement.time, measurement);
          const rows = [...readings.values()].map(reading => ({
            user_id: session.user_id, patient_id: session.patient_id,
            timestamp: new Date(reading.time).toISOString(), value: reading.value,
            trend: reading.trend, is_high: reading.isHigh, is_low: reading.isLow, unit: reading.unit,
          }));
          if (rows.length) {
            const saved = await database.from("glucose_measurements").upsert(rows, { onConflict: "user_id,patient_id,timestamp" });
            if (saved.error) throw saved.error;
          }
          const updated = client.getSession();
          const saved = await database.from("user_provider_sessions").update({ token: updated.token, region: updated.region, updated_at: new Date().toISOString() })
            .eq("user_id", session.user_id).eq("token", session.token);
          if (saved.error) throw saved.error;
          completed++;
        } catch {
          // Do not log provider tokens, patient IDs or glucose values.
          failed++;
        }
      }
      if (sessions.length < 100) break;
    }
    return Response.json({ success: failed === 0, completed, failed }, { status: failed ? 207 : 200 });
  } catch {
    return Response.json({ success: false, completed, failed, error: "Sync storage unavailable" }, { status: 500 });
  }
});
