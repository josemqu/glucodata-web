import { createClient } from "@supabase/supabase-js";

import { LibreLinkUpClient } from "@/lib/librelink";

export function createEventsDatabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("El servidor no tiene configurado Supabase para eventos.");
  }

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function requireActivePatient(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.toLowerCase().startsWith("bearer ")
    ? authorization.slice(7).trim()
    : "";
  const userId = request.headers.get("x-libre-user-id")?.trim() ?? "";
  const region = request.headers.get("x-libre-region")?.trim() ?? "";

  if (!token || !userId) {
    throw new EventAuthError("La sesión de LibreLink no está disponible.", 401);
  }

  try {
    const client = new LibreLinkUpClient(undefined, undefined, region, token, userId);
    const connections = await client.getConnections();
    if (!connections.length) {
      throw new EventAuthError("No hay un paciente activo en LibreLink.", 403);
    }
    return connections[0].patientId;
  } catch (error) {
    if (error instanceof EventAuthError) throw error;
    throw new EventAuthError("La sesión de LibreLink venció o no pudo validarse.", 401);
  }
}

export class EventAuthError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}
