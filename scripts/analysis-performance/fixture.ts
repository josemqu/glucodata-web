// Synthetic system boundaries for the isolated production benchmark ONLY.
export const referenceTime = Date.parse('2026-10-28T12:00:00Z');
const rows = Array.from({ length: 365 * 288 }, (_, index) => ({
  user_id: 'synthetic-user', patient_id: 'synthetic-patient',
  timestamp: new Date(referenceTime - index * 300000).toISOString(),
  value: 60 + (index * 17 % 201), trend: 3, unit: 'mg/dL',
})).reverse().filter((row, index) => !process.env.GLUCO_BENCH_GAPS || (
  index % 1500 < 1490 &&
  !(row.timestamp >= '2026-01-01T02:50:00.000Z' && row.timestamp <= '2026-01-01T05:40:00.000Z') &&
  !(row.timestamp >= '2026-03-08T06:50:00.000Z' && row.timestamp <= '2026-03-08T07:40:00.000Z') &&
  !(row.timestamp >= '2026-06-01T18:05:00.000Z' && row.timestamp <= '2026-06-01T18:40:00.000Z')
));
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
export const fixtureOptions = { cap: 1000, failPage: -1, truncatePage: -1 };
let queryCount = 0;
let failure = false;
let loggedOut = false;
export function setFailure(value: boolean) { failure = value; }
export class EventAuthError extends Error {}
export function adminDatabase() { return database; }
const database = { from(table: string) {
  const filters: Array<(row: typeof rows[number]) => boolean> = [];
  let offset = 0, limit = 1000, count = false;
  const query = {
    select(_?: unknown, options?: { count?: string }) { count = !!options?.count; return query; },
    eq(field: string, value: string) { filters.push(row => row[field as keyof typeof row] === value); return query; },
    gte(_: string, value: string) { filters.push(row => row.timestamp >= value); return query; },
    gt(_: string, value: string) { filters.push(row => row.timestamp > value); return query; },
    lt(_: string, value: string) { filters.push(row => row.timestamp < value); return query; },
    lte(_: string, value: string) { filters.push(row => row.timestamp <= value); return query; },
    order() { return query; }, limit(value: number) { limit = value; return query; },
    range(from: number, to: number) { offset = from; limit = to - from + 1; return query; },
    async maybeSingle() { await wait(20); return { data: { patient_id: 'synthetic-patient' }, error: null }; },
    async then(resolve: (result: unknown) => unknown) {
      await wait(40);
      const page = ++queryCount;
      if (failure || page === fixtureOptions.failPage) return resolve({ error: new Error("Fallo sintético de base de datos") });
      const selected = rows.filter(row => filters.every(filter => filter(row)));
      return resolve({ data: selected.slice(offset, offset + Math.min(limit, fixtureOptions.cap) - (page === fixtureOptions.truncatePage ? 1 : 0)), count: count ? selected.length : null, error: null });
    },
  };
  return query;
} };
export async function requireUser() { await wait(20); if (loggedOut) throw new EventAuthError("Sesión cerrada"); return { userId: 'synthetic-user', database }; }
export async function libreContext() {
  await wait(200);
  return { ...await requireUser(), patientId: 'synthetic-patient', connections: [{ patientId: 'synthetic-patient', firstName: 'Datos', lastName: 'sintéticos' }] };
}
export async function logoutUser() { loggedOut = true; }
export async function latest() {
  const graph = rows.slice(-288).map(row => ({ value: row.value, time: Date.parse(row.timestamp), trend: 3 }));
  return { success: true, data: { glucose: null, graph, patient: { patientId: 'synthetic-patient', firstName: 'Datos', lastName: 'sintéticos' }, session: { token: 'internal', userId: 'synthetic-user', region: '' } } };
}
