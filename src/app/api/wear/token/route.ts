import { createHash, randomBytes } from "node:crypto";
import { adminDatabase, requireUser, libreContext, EventAuthError } from "@/lib/server/user-auth";

export async function POST() {
  try {
    const { userId } = await requireUser();
    const { patientId } = await libreContext();
    const token = `gw_wear_${randomBytes(32).toString("hex")}`;
    const expiresAt = new Date(Date.now() + 365 * 86400000).toISOString();
    const { error } = await adminDatabase().from("wear_tokens").upsert({
      user_id: userId, patient_id: patientId,
      token_hash: createHash("sha256").update(token).digest("hex"), expires_at: expiresAt,
    }, { onConflict: "user_id,patient_id" });
    if (error) throw error;
    return Response.json({ token, expires_at: expiresAt });
  } catch (error) { return Response.json({ error: "Iniciá sesión y volvé a intentar." }, { status: error instanceof EventAuthError ? error.status : 503 }); }
}
export async function DELETE() {
  try {
    const { userId } = await requireUser();
    const { error } = await adminDatabase().from("wear_tokens").delete().eq("user_id", userId);
    if (error) throw error;
    return Response.json({ success: true });
  } catch { return Response.json({ error: "No se pudo desvincular." }, { status: 503 }); }
}
