import { createHash } from "node:crypto";
import { wearContext } from "@/lib/server/wear-auth";
export async function GET(request: Request) {
  try {
    const context = await wearContext(request);
    if (!context) return Response.json({ error: "Volvé a vincular el reloj." }, { status: 401 });
    const { data, error } = await context.database.from("patient_insulins")
      .select("name,insulin_type,sort_order").eq("user_id", context.userId)
      .eq("patient_id", context.patientId).order("sort_order");
    if (error) throw error;
    return Response.json({ owner: createHash("sha256").update(`${context.userId}:${context.patientId}`).digest("hex"), insulins: data ?? [] });
  } catch { return Response.json({ error: "No se pudo cargar la configuración." }, { status: 503 }); }
}
