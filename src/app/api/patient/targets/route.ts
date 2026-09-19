import { NextResponse } from "next/server";
import { EventAuthError, requireUser } from "@/lib/server/user-auth";
const defaults = { low: 70, high: 180, hypo: 60, hyper: 250 };
function failure(error: unknown) {
  return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo guardar la configuración." }, { status: error instanceof EventAuthError ? error.status : 500 });
}
export async function GET() {
  try {
    const { database } = await requireUser();
    const { data, error } = await database.from("glucose_target_config").select("low,high,hypo,hyper").eq("id", "default").maybeSingle();
    if (error) throw error;
    return NextResponse.json({ data: data ?? defaults });
  } catch (error) { return failure(error); }
}
export async function PUT(request: Request) {
  try {
    const { database } = await requireUser();
    const body = await request.json();
    const { low, high, hypo, hyper } = body ?? {};
    if (![low, high, hypo, hyper].every(v => Number.isInteger(v) && v > 0 && v <= 1000) || !(hypo < low && low < high && high < hyper)) {
      return NextResponse.json({ error: "Los límites deben cumplir: hipoglucemia < bajo < alto < hiperglucemia." }, { status: 400 });
    }
    const { error } = await database.from("glucose_target_config").upsert({ id: "default", low, high, hypo, hyper, updated_at: new Date().toISOString() }, { onConflict: "user_id,id" });
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) { return failure(error); }
}
