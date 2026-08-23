"use client";

import { FormEvent, forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Activity,
  Check,
  BookOpenText,
  Dumbbell,
  Link2,
  Pencil,
  Plus,
  Save,
  Syringe,
  Trash2,
  Unlink,
  Utensils,
  X,
} from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { EventAnalysisResult, GlucoseReading } from "@/lib/event-analysis";
import type {
  EventInput,
  EventLinkSuggestion,
  EventRelationType,
  EventType,
  GlucoEvent,
  LinkedEvent,
} from "@/lib/events";

interface LibreSession {
  token: string;
  userId: string;
  region: string;
}

interface EventCenterProps {
  session: LibreSession;
  events: GlucoEvent[];
  loading: boolean;
  error: string | null;
  onRefresh: () => Promise<void>;
  onChanged: () => Promise<void>;
}

export interface EventCenterHandle {
  openEvent: (event: GlucoEvent) => void;
}

const choices: Array<{ type: EventType; label: string; icon: typeof Activity }> = [
  { type: "meal", label: "Comida", icon: Utensils },
  { type: "insulin", label: "Insulina", icon: Syringe },
  { type: "exercise", label: "Ejercicio", icon: Dumbbell },
  { type: "note", label: "Nota", icon: BookOpenText },
];

const copy: Record<EventType, { title: string; placeholder: string }> = {
  meal: { title: "Registrar comida", placeholder: "Ej. Almuerzo" },
  insulin: { title: "Registrar insulina", placeholder: "Ej. Fiasp" },
  exercise: { title: "Registrar ejercicio", placeholder: "Ej. Caminata" },
  note: { title: "Registrar nota", placeholder: "Ej. Día de mucho estrés" },
  medication: { title: "Registrar medicación", placeholder: "Nombre" },
  sleep: { title: "Registrar sueño", placeholder: "Descanso" },
  health: { title: "Registrar contexto de salud", placeholder: "Contexto" },
  other: { title: "Registrar evento", placeholder: "Título" },
};

function localDateTime(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function headers(session: LibreSession) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${session.token}`,
    "X-Libre-User-Id": session.userId,
    "X-Libre-Region": session.region ?? "",
  };
}

function eventIcon(type: EventType) {
  return choices.find((choice) => choice.type === type)?.icon ?? Activity;
}

function renderEventIcon(type: EventType, className: string) {
  if (type === "meal") return <Utensils className={className} />;
  if (type === "insulin") return <Syringe className={className} />;
  if (type === "exercise") return <Dumbbell className={className} />;
  if (type === "note") return <BookOpenText className={className} />;
  return <Activity className={className} />;
}

function eventSummary(event: GlucoEvent) {
  if (event.type === "meal" && typeof event.metadata.carbs_g === "number") return `${event.metadata.carbs_g} g CH`;
  if (event.type === "insulin" && typeof event.metadata.units === "number") return `${event.metadata.units} U`;
  if (event.type === "exercise") return String(event.metadata.intensity ?? "");
  return event.notes ?? "";
}

export const EventCenter = forwardRef<EventCenterHandle, EventCenterProps>(function EventCenter({ session, events, loading, error, onRefresh, onChanged }, ref) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const [open, setOpen] = useState(false);
  const [panelView, setPanelView] = useState<"register" | "today">("register");
  const [type, setType] = useState<EventType>("meal");
  const [editing, setEditing] = useState<GlucoEvent | null>(null);
  const [title, setTitle] = useState("");
  const [occurredAt, setOccurredAt] = useState(localDateTime);
  const [endedAt, setEndedAt] = useState("");
  const [notes, setNotes] = useState("");
  const [carbs, setCarbs] = useState("");
  const [units, setUnits] = useState("");
  const [insulinType, setInsulinType] = useState("rapid");
  const [isCorrection, setIsCorrection] = useState(false);
  const [intensity, setIntensity] = useState("medium");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detail, setDetail] = useState<{
    event: GlucoEvent;
    readings: GlucoseReading[];
    analysis: EventAnalysisResult;
    relatedEvents: GlucoEvent[];
  } | null>(null);
  const [relationships, setRelationships] = useState<{
    links: LinkedEvent[];
    suggestions: EventLinkSuggestion[];
  }>({ links: [], suggestions: [] });
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailRequestTitle, setDetailRequestTitle] = useState("");
  const [relationshipPendingKey, setRelationshipPendingKey] = useState<string | null>(null);
  const [dosePurposeSaving, setDosePurposeSaving] = useState(false);

  const todayEvents = useMemo(() => {
    const today = new Date();
    return events.filter((event) => {
      const date = new Date(event.occurred_at);
      return date.getFullYear() === today.getFullYear()
        && date.getMonth() === today.getMonth()
        && date.getDate() === today.getDate();
    });
  }, [events]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => void onRefresh(), 0);
    return () => window.clearTimeout(timer);
  }, [open, onRefresh]);

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    const trigger = triggerRef.current;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panel?.querySelector<HTMLElement>("button, input, select, textarea")?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        return;
      }
      if (event.key !== "Tab" || !panel) return;
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex='-1'])"));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      (previousFocus ?? trigger)?.focus();
    };
  }, [open]);

  const reset = (nextType: EventType = "meal") => {
    setEditing(null);
    setType(nextType);
    setTitle("");
    setOccurredAt(localDateTime());
    setEndedAt("");
    setNotes("");
    setCarbs("");
    setUnits("");
    setInsulinType("rapid");
    setIsCorrection(false);
    setIntensity("medium");
    setFormError(null);
  };

  const edit = (event: GlucoEvent) => {
    setDetail(null);
    setPanelView("register");
    setEditing(event);
    setType(event.type);
    setTitle(event.title);
    setOccurredAt(localDateTime(new Date(event.occurred_at)));
    setEndedAt(event.ended_at ? localDateTime(new Date(event.ended_at)) : "");
    setNotes(event.notes ?? "");
    setCarbs(event.metadata.carbs_g == null ? "" : String(event.metadata.carbs_g));
    setUnits(event.metadata.units == null ? "" : String(event.metadata.units));
    setInsulinType(String(event.metadata.insulin_type ?? "rapid"));
    setIsCorrection(event.metadata.dose_purpose === "correction");
    setIntensity(String(event.metadata.intensity ?? "medium"));
    setFormError(null);
  };

  const refreshRelationships = useCallback(async (event: GlucoEvent) => {
    const response = await fetch(`/api/events/${event.id}/links`, { headers: headers(session) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "No se pudieron cargar las relaciones.");
    setRelationships(result.data);
    setDetail((current) => current?.event.id === event.id
      ? { ...current, relatedEvents: result.data.links.map((item: LinkedEvent) => item.event) }
      : current);
  }, [session]);

  const openDetail = useCallback(async (event: GlucoEvent) => {
    setDetailRequestTitle(event.title);
    setDetailLoading(true);
    setDetailError(null);
    setRelationships({ links: [], suggestions: [] });
    try {
      const analysisResponse = await fetch(`/api/events/${event.id}/analysis`, { headers: headers(session) });
      const analysisResult = await analysisResponse.json();
      if (!analysisResponse.ok) throw new Error(analysisResult.error ?? "No se pudo cargar la respuesta glucémica.");
      setDetail(analysisResult.data);

      await refreshRelationships(event);
    } catch (requestError) {
      setDetailError(requestError instanceof Error ? requestError.message : "No se pudo cargar la respuesta glucémica.");
    } finally {
      setDetailLoading(false);
    }
  }, [refreshRelationships, session]);

  useImperativeHandle(ref, () => ({
    openEvent(event) {
      setDetail(null);
      setOpen(true);
      setPanelView("today");
      void openDetail(event);
    },
  }), [openDetail]);

  const updateRelationship = async (
    event: GlucoEvent,
    relatedEventId: string,
    relationType: EventRelationType,
    status: "accepted" | "dismissed",
  ) => {
    setDetailError(null);
    setRelationshipPendingKey(`event:${relatedEventId}`);
    try {
      const response = await fetch(`/api/events/${event.id}/links`, {
        method: "POST",
        headers: headers(session),
        body: JSON.stringify({
          related_event_id: relatedEventId,
          relation_type: relationType,
          status,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "No se pudo actualizar la relación.");
      await refreshRelationships(event);
    } catch (requestError) {
      setDetailError(requestError instanceof Error ? requestError.message : "No se pudo actualizar la relación.");
    } finally {
      setRelationshipPendingKey(null);
    }
  };

  const unlinkEvent = async (event: GlucoEvent, linkId: string) => {
    setDetailError(null);
    setRelationshipPendingKey(`link:${linkId}`);
    try {
      const response = await fetch(`/api/events/${event.id}/links?link_id=${encodeURIComponent(linkId)}`, {
        method: "DELETE",
        headers: headers(session),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "No se pudo desvincular el evento.");
      await refreshRelationships(event);
    } catch (requestError) {
      setDetailError(requestError instanceof Error ? requestError.message : "No se pudo desvincular el evento.");
    } finally {
      setRelationshipPendingKey(null);
    }
  };

  const updateDosePurpose = async (event: GlucoEvent, correction: boolean) => {
    setDosePurposeSaving(true);
    setDetailError(null);
    try {
      const response = await fetch(`/api/events/${event.id}`, {
        method: "PATCH",
        headers: headers(session),
        body: JSON.stringify({
          type: event.type,
          title: event.title,
          occurred_at: event.occurred_at,
          ended_at: event.ended_at,
          notes: event.notes,
          metadata: { ...event.metadata, dose_purpose: correction ? "correction" : "meal" },
        } satisfies EventInput),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "No se pudo actualizar la clasificación de la dosis.");
      setDetail((current) => current?.event.id === event.id ? { ...current, event: result.data } : current);
      await onChanged();
    } catch (requestError) {
      setDetailError(requestError instanceof Error ? requestError.message : "No se pudo actualizar la clasificación de la dosis.");
    } finally {
      setDosePurposeSaving(false);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setFormError(null);

    const metadata: Record<string, unknown> = {};
    if (type === "meal") metadata.carbs_g = Number(carbs);
    if (type === "insulin") {
      metadata.units = Number(units);
      metadata.insulin_type = insulinType;
      metadata.insulin_name = title.trim();
      metadata.dose_purpose = isCorrection ? "correction" : "meal";
    }
    if (type === "exercise") metadata.intensity = intensity;

    const payload: EventInput = {
      type,
      title,
      occurred_at: new Date(occurredAt).toISOString(),
      ended_at: type === "exercise" && endedAt ? new Date(endedAt).toISOString() : null,
      notes: notes || null,
      metadata,
    };

    try {
      const response = await fetch(editing ? `/api/events/${editing.id}` : "/api/events", {
        method: editing ? "PATCH" : "POST",
        headers: headers(session),
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "No se pudo guardar el evento.");
      reset(type);
      setDetail(null);
      setPanelView("today");
      await Promise.all([onChanged(), openDetail(result.data)]);
    } catch (requestError) {
      setFormError(requestError instanceof Error ? requestError.message : "No se pudo guardar el evento.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (event: GlucoEvent) => {
    if (!window.confirm(`¿Eliminar “${event.title}”?`)) return;
    setFormError(null);
    try {
      const response = await fetch(`/api/events/${event.id}`, { method: "DELETE", headers: headers(session) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "No se pudo eliminar el evento.");
      if (editing?.id === event.id) reset(type);
      await onChanged();
    } catch (requestError) {
      setFormError(requestError instanceof Error ? requestError.message : "No se pudo eliminar el evento.");
    }
  };

  return (
    <>
      <Button ref={triggerRef} onClick={() => { setDetail(null); setDetailError(null); setPanelView("register"); setOpen(true); }} className="min-h-11 gap-2 px-3 text-[10px] font-bold sm:min-h-8">
        <Plus className="h-4 w-4" />
        Registrar evento
      </Button>

      {open && typeof document !== "undefined" ? createPortal(
        <div className="fixed inset-0 z-50 bg-black/45" role="presentation" onMouseDown={(event) => {
          if (event.currentTarget === event.target) setOpen(false);
        }}>
          <aside ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="event-center-title" className="absolute inset-y-0 right-0 flex w-full max-w-lg flex-col bg-background shadow-2xl">
            <div className="flex items-start justify-between gap-4 px-5 pb-4 pt-5 sm:px-6">
              <div className="min-w-0">
                <h2 id="event-center-title" className="text-lg font-bold tracking-tight">Eventos</h2>
                <p className="mt-1 max-w-sm text-sm leading-5 text-muted-foreground">Sumá contexto a la curva de glucosa.</p>
              </div>
              <Button variant="ghost" size="icon" className="shrink-0" onClick={() => setOpen(false)} aria-label="Cerrar panel">
                <X className="h-4 w-4" />
              </Button>
            </div>

            {!detail && !detailLoading ? (
              <div className="border-b px-5 sm:px-6">
                <nav className="flex gap-5" aria-label="Secciones de eventos">
                  <button type="button" aria-current={panelView === "register" ? "page" : undefined} onClick={() => setPanelView("register")} className={`min-h-11 border-b-2 px-0.5 text-sm font-semibold transition-colors ${panelView === "register" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>Registrar</button>
                  <button type="button" aria-current={panelView === "today" ? "page" : undefined} onClick={() => setPanelView("today")} className={`min-h-11 border-b-2 px-0.5 text-sm font-semibold transition-colors ${panelView === "today" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>Hoy <span className="ml-1 text-xs font-medium text-muted-foreground">{todayEvents.length}</span></button>
                </nav>
              </div>
            ) : null}

            <div className="flex-1 overflow-y-auto bg-muted/10 px-5 py-5 sm:px-6 sm:py-6">
              {detail ? (
                <EventDetail
                  data={detail}
                  relationships={relationships}
                  error={detailError}
                  pendingKey={relationshipPendingKey}
                  dosePurposeSaving={dosePurposeSaving}
                  onBack={() => setDetail(null)}
                  onEdit={() => edit(detail.event)}
                  onDosePurposeChange={(correction) => void updateDosePurpose(detail.event, correction)}
                  onUpdateRelationship={(relatedEventId, relationType, status) => void updateRelationship(detail.event, relatedEventId, relationType, status)}
                  onUnlink={(linkId) => void unlinkEvent(detail.event, linkId)}
                />
              ) : detailLoading ? (
                <EventDetailSkeleton title={detailRequestTitle} />
              ) : panelView === "register" ? (
                <form onSubmit={submit} className="overflow-hidden rounded-2xl border bg-card shadow-sm">
                  <div className="flex items-center justify-between gap-3 border-b px-4 py-4 sm:px-5">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">{renderEventIcon(type, "h-5 w-5")}</span>
                      <div className="min-w-0"><h3 className="truncate text-sm font-bold">{editing ? "Editar evento" : copy[type].title}</h3><p className="mt-0.5 text-xs text-muted-foreground">Elegí el tipo y completá lo esencial.</p></div>
                    </div>
                    {editing ? <button type="button" onClick={() => reset(type)} className="shrink-0 text-xs font-medium text-muted-foreground hover:text-foreground">Cancelar</button> : null}
                  </div>

                  <div className="border-b bg-muted/20 p-2" aria-label="Tipo de evento">
                    <div className="grid grid-cols-4 gap-1 rounded-xl bg-muted/60 p-1">
                      {choices.map((choice) => {
                        const Icon = choice.icon;
                        return <button key={choice.type} type="button" aria-label={choice.label} aria-pressed={type === choice.type} disabled={Boolean(editing)} onClick={() => reset(choice.type)} className={`flex min-h-12 items-center justify-center gap-1.5 rounded-lg px-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60 ${type === choice.type ? "bg-background text-primary shadow-sm" : "text-muted-foreground hover:bg-background/60 hover:text-foreground"}`}><Icon className="h-4 w-4" /><span className="hidden min-[390px]:inline">{choice.label}</span></button>;
                      })}
                    </div>
                  </div>

                  <div className="space-y-5 px-4 py-5 sm:px-5">
                    <div className="space-y-2"><Label htmlFor="event-title">Nombre</Label><Input id="event-title" className="h-11 bg-background" value={title} onChange={(event) => setTitle(event.target.value)} placeholder={copy[type].placeholder} maxLength={120} required /></div>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div className="space-y-2"><Label htmlFor="event-occurred-at">Fecha y hora</Label><Input id="event-occurred-at" className="h-11 bg-background" type="datetime-local" value={occurredAt} onChange={(event) => setOccurredAt(event.target.value)} required /></div>
                      {type === "meal" ? <div className="space-y-2"><Label htmlFor="event-carbs">Carbohidratos (g CH)</Label><div className="relative"><Input id="event-carbs" className="h-11 bg-background pr-12 font-numbers" type="number" min="0" step="0.1" value={carbs} onChange={(event) => setCarbs(event.target.value)} required /><span aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">g CH</span></div></div> : null}
                      {type === "insulin" ? <div className="space-y-2"><Label htmlFor="event-units">Dosis (U)</Label><div className="relative"><Input id="event-units" className="h-11 bg-background pr-9 font-numbers" type="number" min="0" step="0.1" value={units} onChange={(event) => setUnits(event.target.value)} required /><span aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">U</span></div></div> : null}
                      {type === "exercise" ? <div className="space-y-2"><Label htmlFor="event-ended-at">Finalización</Label><Input id="event-ended-at" className="h-11 bg-background" type="datetime-local" value={endedAt} onChange={(event) => setEndedAt(event.target.value)} required /></div> : null}
                    </div>
                    {type === "insulin" ? <div className="space-y-2"><Label htmlFor="insulin-type">Tipo de insulina</Label><select id="insulin-type" value={insulinType} onChange={(event) => setInsulinType(event.target.value)} className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"><option value="rapid">Rápida</option><option value="short">Corta</option><option value="intermediate">Intermedia</option><option value="long">Larga</option><option value="ultra_long">Ultralarga</option><option value="other">Otra</option></select></div> : null}
                    {type === "insulin" ? <label htmlFor="event-correction" className="flex min-h-14 cursor-pointer items-start gap-3 rounded-xl border bg-background px-3 py-3"><input id="event-correction" type="checkbox" checked={isCorrection} onChange={(event) => setIsCorrection(event.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-primary" /><span className="min-w-0"><span className="block text-sm font-semibold">Esta dosis fue una corrección</span><span className="mt-0.5 block text-xs leading-5 text-muted-foreground">Desmarcada se guarda como dosis habitual o asociada a comida.</span></span></label> : null}
                    {type === "exercise" ? <div className="space-y-2"><Label htmlFor="exercise-intensity">Intensidad</Label><select id="exercise-intensity" value={intensity} onChange={(event) => setIntensity(event.target.value)} className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"><option value="low">Baja</option><option value="medium">Media</option><option value="high">Alta</option></select></div> : null}
                    <div className="space-y-2"><Label htmlFor="event-notes">Nota <span className="font-normal text-muted-foreground">(opcional)</span></Label><textarea id="event-notes" value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={2000} rows={3} placeholder="Agregá un dato que ayude a interpretar el evento" className="min-h-20 w-full resize-none rounded-md border border-input bg-background px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring" /></div>
                    {formError ? <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive">{formError}</p> : null}
                  </div>
                  <div className="flex items-center justify-end gap-2 border-t bg-muted/20 px-4 py-3 sm:px-5"><Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button><Button type="submit" disabled={saving} className="min-w-36 gap-2"><Save className="h-4 w-4" />{saving ? "Guardando…" : editing ? "Guardar cambios" : "Registrar"}</Button></div>
                </form>
              ) : (
                <section>
                <div className="flex items-center justify-between">
                  <div><h3 className="text-base font-bold">Eventos de hoy</h3><p className="mt-1 text-sm text-muted-foreground">{todayEvents.length} {todayEvents.length === 1 ? "evento registrado" : "eventos registrados"}</p></div>
                  {loading ? <span role="status" className="text-xs text-muted-foreground">Actualizando…</span> : null}
                </div>
                {detailError ? <p role="alert" className="mt-4 rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive">{detailError}</p> : null}
                {error ? <p role="alert" className="mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p> : null}
                <div className="mt-4 overflow-hidden rounded-2xl border bg-card px-4 shadow-sm sm:px-5">
                  {!loading && todayEvents.length === 0 ? <div className="flex flex-col items-center py-10 text-center"><BookOpenText className="h-6 w-6 text-muted-foreground" /><p className="mt-3 text-sm font-medium">Todavía no registraste eventos</p><p className="mt-1 text-xs text-muted-foreground">Usá la pestaña Registrar para sumar contexto.</p></div> : null}
                  {todayEvents.map((event) => {
                    const Icon = eventIcon(event.type);
                    return (
                      <article key={event.id} className="group flex items-center gap-3 border-b py-3.5 last:border-b-0">
                        <div className="mt-0.5 rounded-lg bg-muted p-2 text-primary"><Icon className="h-4 w-4" /></div>
                        <button type="button" disabled={detailLoading} onClick={() => void openDetail(event)} className="min-w-0 flex-1 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><div className="flex items-baseline gap-2"><time className="font-numbers text-xs font-bold">{new Date(event.occurred_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time><h4 className="truncate text-sm font-semibold">{event.title}</h4></div><p className="mt-1 truncate text-xs text-muted-foreground">{eventSummary(event) || "Sin detalles adicionales"}</p></button>
                        <div className="flex opacity-80 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"><Button type="button" variant="ghost" size="icon" className="h-11 w-11 sm:h-8 sm:w-8" onClick={() => edit(event)} aria-label={`Editar ${event.title}`}><Pencil className="h-3.5 w-3.5" /></Button><Button type="button" variant="ghost" size="icon" className="h-11 w-11 text-destructive sm:h-8 sm:w-8" onClick={() => void remove(event)} aria-label={`Eliminar ${event.title}`}><Trash2 className="h-3.5 w-3.5" /></Button></div>
                      </article>
                    );
                  })}
                </div>
              </section>
              )}
            </div>
          </aside>
        </div>,
        document.body,
      ) : null}
    </>
  );
});

function EventDetailSkeleton({ title }: { title: string }) {
  return (
    <section role="status" aria-live="polite" aria-label={`Cargando respuesta de ${title || "evento"}`}>
      <div className="animate-pulse motion-reduce:animate-none">
        <div className="h-4 w-28 rounded bg-muted" />
        <div className="mt-5 h-3 w-32 rounded bg-muted" />
        <div className="mt-2 h-7 max-w-64 rounded bg-muted" />
        <div className="mt-5 h-56 rounded-xl border bg-card" />
        <div className="mt-3 flex items-center justify-between rounded-xl bg-muted/50 px-3 py-3">
          <div className="h-6 w-28 rounded bg-muted" />
          <div className="h-3 w-24 rounded bg-muted" />
        </div>
        <div className="mt-5 grid grid-cols-2 gap-5 border-b pb-5">
          {[0, 1, 2, 3].map((item) => <div key={item}><div className="h-3 w-20 rounded bg-muted" /><div className="mt-2 h-5 w-24 rounded bg-muted" /></div>)}
        </div>
      </div>
      <p className="sr-only">Cargando respuesta del evento {title}.</p>
    </section>
  );
}

function formatMetric(value: number | null, suffix = "") {
  return value == null ? "Sin dato" : `${Math.round(value)}${suffix}`;
}

function EventDetail({
  data,
  relationships,
  error,
  pendingKey,
  dosePurposeSaving,
  onBack,
  onEdit,
  onDosePurposeChange,
  onUpdateRelationship,
  onUnlink,
}: {
  data: { event: GlucoEvent; readings: GlucoseReading[]; analysis: EventAnalysisResult; relatedEvents: GlucoEvent[] };
  relationships: { links: LinkedEvent[]; suggestions: EventLinkSuggestion[] };
  error: string | null;
  pendingKey: string | null;
  dosePurposeSaving: boolean;
  onBack: () => void;
  onEdit: () => void;
  onDosePurposeChange: (correction: boolean) => void;
  onUpdateRelationship: (relatedEventId: string, relationType: EventRelationType, status: "accepted" | "dismissed") => void;
  onUnlink: (linkId: string) => void;
}) {
  const occurredMs = new Date(data.event.occurred_at).getTime();
  const unit = data.readings[0]?.unit ?? "mg/dL";
  const chart = data.readings.map((reading) => ({
    ...reading,
    relativeMinutes: Math.round((new Date(reading.timestamp).getTime() - occurredMs) / 60_000),
  }));
  const primaryMetrics = [
    ["Glucosa previa", formatMetric(data.analysis.baselineGlucose, ` ${unit}`)],
    ["Pico", formatMetric(data.analysis.peakGlucose, ` ${unit}`)],
    ["Δ máximo", data.analysis.glucoseDelta == null ? "Sin dato" : `${data.analysis.glucoseDelta >= 0 ? "+" : ""}${Math.round(data.analysis.glucoseDelta)} ${unit}`],
    ["Promedio posterior", formatMetric(data.analysis.averageGlucose, ` ${unit}`)],
  ];
  const checkpoints = [
    ["+1 h", formatMetric(data.analysis.glucose1h, ` ${unit}`)],
    ["+2 h", formatMetric(data.analysis.glucose2h, ` ${unit}`)],
    ["+3 h", formatMetric(data.analysis.glucose3h, ` ${unit}`)],
    ["+4 h", formatMetric(data.analysis.glucose4h, ` ${unit}`)],
  ];
  const qualityCopy = data.analysis.quality === "good"
    ? { label: "Cobertura buena", className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" }
    : data.analysis.quality === "partial"
      ? { label: "Resultados provisionales", className: "bg-amber-500/10 text-amber-700 dark:text-amber-400" }
      : { label: "Datos insuficientes", className: "bg-destructive/10 text-destructive" };
  const targetRange = unit === "mmol/L"
    ? `${data.analysis.targets.low.toFixed(1)}–${data.analysis.targets.high.toFixed(1)} ${unit}`
    : `${Math.round(data.analysis.targets.low)}–${Math.round(data.analysis.targets.high)} ${unit}`;
  const relatedMarkers = data.relatedEvents.flatMap((event) => {
    const relativeMinutes = Math.round((new Date(event.occurred_at).getTime() - occurredMs) / 60_000);
    return relativeMinutes >= data.analysis.window.beforeMinutes * -1 && relativeMinutes <= data.analysis.window.afterMinutes
      ? [{ event, relativeMinutes }]
      : [];
  });

  return (
    <section>
      <button type="button" onClick={onBack} className="mb-4 text-xs font-semibold text-primary hover:underline">← Volver al registro</button>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs text-muted-foreground">{new Date(data.event.occurred_at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</p>
          <h3 className="mt-1 text-xl font-bold">{data.event.title}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{eventSummary(data.event)}</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className={`rounded-md px-2 py-1 text-[10px] font-semibold ${data.analysis.complete ? "bg-emerald-500/10 text-emerald-600" : "bg-amber-500/10 text-amber-600"}`}>{data.analysis.complete ? "Ventana temporal finalizada" : "Análisis en curso"}</span>
          <Button type="button" variant="outline" size="sm" className="min-h-9 gap-2" onClick={onEdit}><Pencil className="h-3.5 w-3.5" />Editar</Button>
        </div>
      </div>

      {data.event.type === "insulin" ? (
        <label htmlFor="detail-event-correction" className="mt-4 flex min-h-14 cursor-pointer items-start gap-3 rounded-xl border bg-card px-3 py-3">
          <input id="detail-event-correction" type="checkbox" checked={data.event.metadata.dose_purpose === "correction"} disabled={dosePurposeSaving} onChange={(event) => onDosePurposeChange(event.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-primary disabled:cursor-wait" />
          <span className="min-w-0"><span className="block text-sm font-semibold">Esta dosis fue una corrección</span><span role="status" className="mt-0.5 block text-xs leading-5 text-muted-foreground">{dosePurposeSaving ? "Guardando clasificación…" : data.event.metadata.dose_purpose === "correction" ? "Clasificada como dosis de corrección." : "Clasificada como dosis habitual o asociada a comida."}</span></span>
        </label>
      ) : null}

      <div className="mt-5 h-56 rounded-xl border bg-card p-3">
        {chart.length ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chart} margin={{ top: 8, right: 8, bottom: 4, left: -18 }}>
              <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.45} />
              <XAxis
                dataKey="relativeMinutes"
                type="number"
                domain={[data.analysis.window.beforeMinutes * -1, data.analysis.window.afterMinutes]}
                tickFormatter={(value) => value === 0 ? "Evento" : `${value > 0 ? "+" : ""}${value}m`}
                tick={{ fontSize: 9 }}
              />
              <YAxis domain={["dataMin - 15", "dataMax + 15"]} tick={{ fontSize: 9 }} />
              <Tooltip
                cursor={{ stroke: "var(--muted-foreground)", strokeOpacity: 0.35, strokeDasharray: "3 3" }}
                allowEscapeViewBox={{ x: false, y: true }}
                wrapperStyle={{ outline: "none", pointerEvents: "none" }}
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const value = Number(payload[0]?.value);
                  if (!Number.isFinite(value)) return null;
                  const minutes = Number(label);
                  const timing = minutes === 0 ? "Momento del evento" : `${Math.abs(minutes)} min ${minutes > 0 ? "después" : "antes"}`;
                  const status = value < data.analysis.targets.low
                    ? { label: "Bajo", className: "text-amber-600" }
                    : value > data.analysis.targets.high
                      ? { label: "Alto", className: "text-amber-600" }
                      : { label: "En rango", className: "text-emerald-600" };
                  return (
                    <div className="min-w-36 rounded-xl border bg-popover px-3 py-2.5 text-popover-foreground shadow-lg">
                      <p className="text-xs font-medium text-muted-foreground">{timing}</p>
                      <div className="mt-1.5 flex items-baseline justify-between gap-4">
                        <p className="font-numbers text-base font-bold">{Math.round(value)} <span className="text-xs font-medium text-muted-foreground">{unit}</span></p>
                        <p className={`text-xs font-semibold ${status.className}`}>{status.label}</p>
                      </div>
                    </div>
                  );
                }}
              />
              <ReferenceLine x={0} stroke="var(--primary)" strokeDasharray="3 3" />
              {relatedMarkers.map(({ event, relativeMinutes }) => (
                <ReferenceLine
                  key={event.id}
                  x={relativeMinutes}
                  stroke="var(--muted-foreground)"
                  strokeDasharray="2 4"
                  label={{ value: event.type === "insulin" ? "Insulina" : event.type === "exercise" ? "Ejercicio" : "Relacionado", position: "insideTopRight", fontSize: 10, fill: "var(--muted-foreground)" }}
                />
              ))}
              <Line type="monotone" dataKey="value" stroke="var(--primary)" strokeWidth={3} dot={false} connectNulls={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center text-center text-xs text-muted-foreground">No hay lecturas CGM en esta ventana.</div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-muted/50 px-3 py-2.5">
        <span className={`rounded-md px-2 py-1 text-xs font-semibold ${qualityCopy.className}`}>{qualityCopy.label}</span>
        <span className="text-xs text-muted-foreground">{data.analysis.coveragePercent}% cubierto · {data.analysis.gapCount} {data.analysis.gapCount === 1 ? "interrupción" : "interrupciones"}</span>
      </div>

      {data.analysis.quality === "insufficient" ? (
        <div className="mt-5 rounded-xl border border-dashed px-4 py-5 text-center">
          <p className="text-sm font-semibold">Todavía no hay datos suficientes para calcular la respuesta</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">La curva muestra las lecturas observadas. Los agregados aparecerán cuando exista al menos 50% de cobertura y dos lecturas posteriores.</p>
        </div>
      ) : (
        <>
      <dl className="mt-5 grid grid-cols-2 gap-x-5 gap-y-4 border-b pb-5">
        {primaryMetrics.map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="font-numbers mt-1 text-base font-semibold tracking-tight">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-5">
        <div className="flex flex-wrap items-center justify-between gap-1"><h4 className="text-sm font-semibold">Tiempo posterior en rangos</h4><span className="text-xs text-muted-foreground">{targetRange} · sobre datos cubiertos</span></div>
        <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-muted" aria-label={`Tiempo en rango ${data.analysis.timeInRange ?? 0}%, alto ${data.analysis.timeAboveRange ?? 0}%, bajo ${data.analysis.timeBelowRange ?? 0}%`}>
          <span className="bg-amber-500" style={{ width: `${data.analysis.timeBelowRange ?? 0}%` }} />
          <span className="bg-emerald-500" style={{ width: `${data.analysis.timeInRange ?? 0}%` }} />
          <span className="bg-amber-500" style={{ width: `${data.analysis.timeAboveRange ?? 0}%` }} />
        </div>
        <dl className="mt-3 grid grid-cols-3 gap-2 text-center"><div><dt className="text-xs text-muted-foreground">Bajo</dt><dd className="font-numbers mt-1 text-sm font-semibold text-amber-600">{formatMetric(data.analysis.timeBelowRange, "%")}</dd></div><div><dt className="text-xs text-muted-foreground">En rango</dt><dd className="font-numbers mt-1 text-sm font-semibold text-emerald-600">{formatMetric(data.analysis.timeInRange, "%")}</dd></div><div><dt className="text-xs text-muted-foreground">Alto</dt><dd className="font-numbers mt-1 text-sm font-semibold text-amber-600">{formatMetric(data.analysis.timeAboveRange, "%")}</dd></div></dl>
      </div>

      <div className="mt-5 border-t pt-5">
        <div className="flex items-center justify-between"><h4 className="text-sm font-semibold">Lecturas posteriores</h4><span className="text-xs text-muted-foreground">Pico en {formatMetric(data.analysis.timeToPeakMinutes, " min")}</span></div>
        <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">{checkpoints.map(([label, value]) => <div key={label} className="rounded-lg bg-muted/50 px-2 py-2 text-center"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="font-numbers mt-1 text-sm font-semibold">{value}</dd></div>)}</dl>
      </div>
        </>
      )}

      <div className="mt-5 border-t pt-5">
        <div className="flex items-center gap-2">
          <Link2 className="h-4 w-4 text-primary" />
          <h4 className="text-sm font-semibold">Eventos relacionados</h4>
        </div>
        {error ? <p role="alert" className="mt-3 rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive">{error}</p> : null}
        {relationships.links.length ? (
          <ul className="mt-3 space-y-2">
            {relationships.links.map(({ link, event }) => (
              <li key={link.id} className="flex items-center gap-3 rounded-xl border bg-card px-3 py-2.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">{renderEventIcon(event.type, "h-4 w-4")}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{event.title}</p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">{relationLabel(link.relation_type)} · {new Date(event.occurred_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}{eventSummary(event) ? ` · ${eventSummary(event)}` : ""}</p>
                </div>
                <Button type="button" variant="ghost" size="icon" disabled={pendingKey !== null} className="h-11 w-11 shrink-0 sm:h-9 sm:w-9" onClick={() => onUnlink(link.id)} aria-label={`Desvincular ${event.title}`}><Unlink className="h-4 w-4" /></Button>
              </li>
            ))}
          </ul>
        ) : <p className="mt-2 text-xs leading-5 text-muted-foreground">Todavía no hay eventos vinculados.</p>}

        {relationships.suggestions.length ? (
          <div className="mt-4 rounded-xl bg-muted/50 p-3">
            <p className="text-xs font-semibold">Sugerencias por cercanía</p>
            <ul className="mt-2 space-y-2">
              {relationships.suggestions.map((suggestion) => (
                <li key={`${suggestion.event.id}-${suggestion.relation_type}`} className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{suggestion.event.title}</p>
                    <p className="text-xs text-muted-foreground">{relationLabel(suggestion.relation_type)} · {formatRelativeDistance(suggestion.distance_minutes)}</p>
                  </div>
                  <Button type="button" variant="ghost" size="icon" disabled={pendingKey !== null} className="h-11 w-11 shrink-0 text-emerald-600 sm:h-9 sm:w-9" onClick={() => onUpdateRelationship(suggestion.event.id, suggestion.relation_type, "accepted")} aria-label={`Vincular ${suggestion.event.title}`}><Check className="h-4 w-4" /></Button>
                  <Button type="button" variant="ghost" size="icon" disabled={pendingKey !== null} className="h-11 w-11 shrink-0 text-muted-foreground sm:h-9 sm:w-9" onClick={() => onUpdateRelationship(suggestion.event.id, suggestion.relation_type, "dismissed")} aria-label={`Descartar sugerencia ${suggestion.event.title}`}><X className="h-4 w-4" /></Button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
        La glucosa previa usa la última lectura anterior dentro de 10 minutos; los hitos posteriores usan la lectura más cercana dentro de ±10 minutos. Promedio y rangos ponderan el tiempo y limitan cada gap a 15 minutos. {data.analysis.readingCount} lecturas · algoritmo {data.analysis.analysisVersion}. No constituye una recomendación terapéutica.
      </p>
    </section>
  );
}

function relationLabel(relation: EventRelationType) {
  const labels: Record<EventRelationType, string> = {
    meal_insulin: "Insulina asociada a la comida",
    correction: "Corrección",
    post_meal_exercise: "Ejercicio posterior a la comida",
    pre_meal_exercise: "Ejercicio previo a la comida",
    related: "Evento relacionado",
  };
  return labels[relation];
}

function formatRelativeDistance(minutes: number) {
  if (minutes === 0) return "misma hora";
  return `${Math.abs(minutes)} min ${minutes > 0 ? "después" : "antes"}`;
}
