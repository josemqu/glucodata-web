import { useEffect, useReducer } from "react";

type Reply<T> = { success: boolean; data?: T; error?: string; validForMs?: number };
type Entry<T> = { data?: T; expiresAt: number; error?: string; pending?: Promise<void> };

/** Owned by one mounted, authenticated page; never persisted or shared across sessions. */
export class AnalysisResource<T> {
  private entries = new Map<string, Entry<T>>();
  private listeners = new Set<() => void>();
  private generation = 0;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private notify() { this.listeners.forEach(listener => listener()); }
  read(key: string) {
    const entry = this.entries.get(key);
    return entry && (entry.pending || entry.error || entry.expiresAt > Date.now()) ? entry : undefined;
  }
  clear() {
    this.generation++;
    this.entries.clear();
    this.notify();
  }
  private trim() {
    for (const [key, entry] of this.entries) {
      if (this.entries.size <= 16) break;
      if (!entry.pending) this.entries.delete(key);
    }
  }

  load(key: string, fetcher: (refresh?: boolean) => Promise<Reply<T>>, refresh = false) {
    const previous = this.read(key);
    if (previous?.pending) return previous.pending;
    if (!refresh && previous?.data !== undefined && previous.expiresAt > Date.now()) return Promise.resolve();
    const generation = this.generation;
    let started = Date.now();
    const entry: Entry<T> = { data: previous?.data, expiresAt: 0 };
    const pending = Promise.resolve().then(() => fetcher(refresh)).then(async firstReply => {
      let reply = firstReply;
      // A nearly expired server hit can expire in transit. Retry once with a fresh
      // server read instead of repeatedly requesting that same aged cache entry.
      if (reply.success && (reply.validForMs ?? 0) <= Date.now() - started) {
        started = Date.now();
        reply = await fetcher(true);
        if (reply.success && (reply.validForMs ?? 0) <= Date.now() - started) {
          throw new Error("Los datos cambiaron durante la consulta. Volvé a intentar.");
        }
      }
      if (!reply.success || reply.data === undefined) throw new Error(reply.error || "No se pudo cargar el análisis.");
      if (generation !== this.generation) return;
      entry.data = reply.data;
      // Anchor remaining server lifetime to request START, conservatively accounting
      // for transit and avoiding extension of an already aged server result.
      entry.expiresAt = started + Math.max(0, reply.validForMs ?? 0);
    }).catch((error: unknown) => {
      if (generation === this.generation) entry.error = error instanceof Error ? error.message : "No se pudo cargar el análisis.";
    }).finally(() => {
      if (generation !== this.generation) return;
      entry.pending = undefined;
      this.trim();
      this.notify();
    });
    entry.pending = pending;
    this.entries.delete(key);
    this.entries.set(key, entry);
    this.trim();
    this.notify();
    return pending;
  }
}

export function useAnalysisResource<T>(resource: AnalysisResource<T>, key: string, fetcher: (refresh?: boolean) => Promise<Reply<T>>) {
  const [, render] = useReducer(value => value + 1, 0);
  const entry = resource.read(key);
  const expiresAt = entry?.expiresAt;
  useEffect(() => resource.subscribe(render), [resource]);
  useEffect(() => {
    if (!entry) void resource.load(key, fetcher);
    if (!expiresAt) return;
    const timer = setTimeout(render, Math.max(0, expiresAt - Date.now()) + 1);
    return () => clearTimeout(timer);
  }, [resource, key, entry, expiresAt, fetcher]);
  return { data: entry?.data, error: entry?.error, loading: !entry || !!entry.pending,
    retry: () => resource.load(key, fetcher, true) };
}
