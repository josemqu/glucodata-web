import type { SupabaseClient } from "@supabase/supabase-js";

export class WearInputError extends Error {}
export interface WearContext { userId: string; patientId: string; database: SupabaseClient }

export async function recordWearDose(context: WearContext, value: unknown) {
  if (!value || typeof value !== "object") throw new WearInputError("Registro inválido.");
  const input = value as Record<string, unknown>;
  if (typeof input.id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.id)
    || typeof input.occurred_at !== "string" || !Number.isFinite(Date.parse(input.occurred_at))
    || Date.parse(input.occurred_at) > Date.now() + 300000
    || typeof input.name !== "string" || !input.name.trim() || input.name.length > 80
    || !["rapid", "long", "ultra_long", "intermediate"].includes(String(input.insulin_type))
    || typeof input.units !== "number" || !Number.isInteger(input.units) || input.units < 1 || input.units > 250) {
    throw new WearInputError("Revisá cantidad, insulina y hora del reloj.");
  }
  const { data, error } = await context.database.rpc("record_wear_dose", {
    p_user_id: context.userId, p_patient_id: context.patientId, p_id: input.id,
    p_occurred_at: new Date(input.occurred_at).toISOString(), p_name: input.name.trim(),
    p_insulin_type: input.insulin_type, p_units: input.units,
  });
  if (error) {
    if (["22023", "23505"].includes(error.code)) throw new WearInputError("El registro o la insulina no coincide. Revisá la configuración.");
    throw error;
  }
  return { id: data, request_id: input.id };
}
