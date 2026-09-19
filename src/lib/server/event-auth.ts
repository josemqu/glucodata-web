import { libreContext, requireUser } from "@/lib/server/user-auth";
export { EventAuthError } from "@/lib/server/user-auth";

export async function createEventsDatabase() {
  return (await requireUser()).database;
}
export async function requireActivePatient(_request: Request) {
  void _request; // Authentication comes from the verified HttpOnly session, never caller identity headers.
  return (await libreContext()).patientId;
}
