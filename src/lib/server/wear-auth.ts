import { createHash } from "node:crypto";
import { adminDatabase } from "@/lib/server/user-auth";

export async function wearContext(request: Request) {
  const match = /^Bearer (gw_wear_[a-f0-9]{64})$/.exec(request.headers.get("authorization") ?? "");
  if (!match) return null;
  const database = adminDatabase();
  const { data, error } = await database.from("wear_tokens").select("user_id,patient_id")
    .eq("token_hash", createHash("sha256").update(match[1]).digest("hex"))
    .gt("expires_at", new Date().toISOString()).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const membership = await database.from("user_patients").select("user_id")
    .eq("user_id", data.user_id).eq("patient_id", data.patient_id).maybeSingle();
  if (membership.error) throw membership.error;
  return membership.data ? { database, userId: data.user_id as string, patientId: data.patient_id as string } : null;
}
