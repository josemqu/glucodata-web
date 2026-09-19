import { createHash } from "node:crypto";
import { adminDatabase } from "@/lib/server/user-auth";

// Tokens must be explicitly bound to an account AND patient. Never infer the
// owner from the latest measurement or from the last provider session.
export async function integrationContext(request: Request) {
  const match = /^Bearer (\S+)$/i.exec(request.headers.get("authorization") ?? "");
  if (!match) return null;
  const database = adminDatabase();
  const { data, error } = await database.from("integration_tokens")
    .select("user_id,patient_id")
    .eq("token_hash", createHash("sha256").update(match[1]).digest("hex"))
    .maybeSingle();
  if (error) throw error;
  return data ? { database, userId: data.user_id as string, patientId: data.patient_id as string } : null;
}
