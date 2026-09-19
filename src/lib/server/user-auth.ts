import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { createClient, type Session } from "@supabase/supabase-js";
import { LibreLinkUpClient } from "@/lib/librelink";

export class EventAuthError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
export function adminDatabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Falta la configuración de Supabase del servidor.");
  return createClient(url, key, options);
}
function publicDatabase(accessToken?: string) {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    ...options,
    ...(accessToken ? { global: { headers: { Authorization: `Bearer ${accessToken}` } } } : {}),
  });
}
async function saveSession(session: Session) {
  const jar = await cookies();
  const settings = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", maxAge: 60 * 60 * 24 * 30 };
  jar.set("gluco_access", session.access_token, settings);
  jar.set("gluco_refresh", session.refresh_token, settings);
}
export async function requireUser() {
  const jar = await cookies();
  let accessToken = jar.get("gluco_access")?.value;
  const auth = publicDatabase();
  let user = accessToken ? (await auth.auth.getUser(accessToken)).data.user : null;
  if (!user) {
    const refresh = jar.get("gluco_refresh")?.value;
    if (!refresh) throw new EventAuthError("Volvé a iniciar sesión con LibreLinkUp para activar tu cuenta privada.", 401);
    const result = await auth.auth.refreshSession({ refresh_token: refresh });
    if (result.error || !result.data.session) throw new EventAuthError("La sesión venció. Volvé a iniciar sesión.", 401);
    await saveSession(result.data.session);
    accessToken = result.data.session.access_token;
    user = result.data.user;
  }
  if (!user || !accessToken) throw new EventAuthError("Sesión inválida.", 401);
  const database = publicDatabase(accessToken);
  const { data: identity, error } = await database.from("app_users").select("id,librelink_user_id").eq("id", user.id).single();
  if (error || !identity) throw new EventAuthError("La cuenta no está asociada a LibreLinkUp.", 403);
  return { userId: user.id, database, accessToken };
}

// Only a successful provider credential login may establish an identity. Never
// use a caller's x-libre-user-id or an unverified provider JWT as ownership proof.
export async function loginUser(email: string, password: string) {
  const client = new LibreLinkUpClient(email, password);
  await client.login();
  const connections = await client.getConnections();
  if (!connections.length) throw new EventAuthError("No hay pacientes conectados.", 403);
  const provider = client.getSession();
  if (!provider.userId || !provider.token) throw new EventAuthError("LibreLinkUp no devolvió una identidad válida.", 401);
  const admin = adminDatabase();
  const lookup = () => admin.from("app_users").select("id").eq("librelink_user_id", provider.userId).maybeSingle();
  const initial = await lookup();
  if (initial.error) throw initial.error;
  let userId = initial.data?.id as string | undefined;
  if (!userId) {
    // Random, non-deliverable internal address prevents pre-registration attacks.
    const created = await admin.auth.admin.createUser({ email: `${randomUUID()}@identity.glucodata.invalid`, email_confirm: true });
    if (created.error || !created.data.user) throw new Error("No se pudo crear la identidad interna.");
    userId = created.data.user.id;
    const inserted = await admin.from("app_users").insert({ id: userId, librelink_user_id: provider.userId });
    if (inserted.error) {
      await admin.auth.admin.deleteUser(userId);
      const concurrent = await lookup();
      if (concurrent.error || !concurrent.data) throw inserted.error;
      userId = concurrent.data.id;
    }
  }
  const patientId = connections[0].patientId;
  const linked = await admin.from("user_patients").upsert({ user_id: userId, patient_id: patientId });
  if (linked.error) throw linked.error;
  const stored = await admin.from("user_provider_sessions").upsert({ user_id: userId, librelink_user_id: provider.userId, patient_id: patientId, token: provider.token, region: provider.region, updated_at: new Date().toISOString() });
  if (stored.error) throw stored.error;
  const internal = await admin.auth.admin.getUserById(userId!);
  if (internal.error || !internal.data.user.email) throw new Error("No se pudo recuperar la identidad interna.");
  // Generate and consume server-side; no email is sent and no secret goes to JS.
  const link = await admin.auth.admin.generateLink({ type: "magiclink", email: internal.data.user.email });
  if (link.error) throw new Error("No se pudo abrir la sesión interna.");
  const verified = await publicDatabase().auth.verifyOtp({ type: "email", token_hash: link.data.properties.hashed_token });
  if (verified.error || !verified.data.session || verified.data.user?.id !== userId) throw new Error("No se pudo validar la sesión interna.");
  await saveSession(verified.data.session);
  return requireUser();
}
export async function libreContext(email?: string, password?: string) {
  let user;
  try { user = await requireUser(); }
  catch (error) {
    if (!(error instanceof EventAuthError) || !email || !password) throw error;
    user = await loginUser(email, password);
  }
  const result = await adminDatabase().from("user_provider_sessions").select("token,librelink_user_id,region,patient_id").eq("user_id", user.userId).single();
  if (result.error || !result.data) throw new EventAuthError("Volvé a iniciar sesión con LibreLinkUp.", 401);
  const stored = result.data;
  const client = new LibreLinkUpClient(undefined, undefined, stored.region, stored.token, stored.librelink_user_id);
  const connections = await client.getConnections();
  const patient = connections.find(p => p.patientId === stored.patient_id);
  if (!patient) throw new EventAuthError("El paciente ya no está disponible en LibreLinkUp.", 403);
  return { ...user, client, patientId: patient.patientId, connections: [patient] };
}
export async function logoutUser() {
  const jar = await cookies();
  const token = jar.get("gluco_access")?.value;
  if (token) await adminDatabase().auth.admin.signOut(token, "local");
  jar.delete("gluco_access");
  jar.delete("gluco_refresh");
}
