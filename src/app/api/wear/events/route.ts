import { wearContext } from "@/lib/server/wear-auth";
import { recordWearDose, WearInputError } from "@/lib/wear-events";

export async function POST(request: Request) {
  try {
    const context = await wearContext(request);
    if (!context) return Response.json({ error: "Volvé a vincular el reloj." }, { status: 401 });
    const text = await request.text();
    if (text.length > 4096) return Response.json({ error: "Registro demasiado grande." }, { status: 413 });
    let input: unknown;
    try { input = JSON.parse(text); } catch { return Response.json({ error: "Registro inválido." }, { status: 400 }); }
    return Response.json({ success: true, ...await recordWearDose(context, input) });
  } catch (error) {
    const invalid = error instanceof WearInputError;
    return Response.json({ error: invalid ? error.message : "No se pudo sincronizar. El registro sigue pendiente." }, { status: invalid ? 422 : 503 });
  }
}
