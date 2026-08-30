"use client";

import { FormEvent, forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Activity,
  BarChart3,
  Check,
  BookOpenText,
  Copy,
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
import { InsetField, InsetNumberStepper, insetControlClass, insetSelectClass, insetTextareaClass } from "@/components/ui/inset-field";
import { MealComposer, type MealSelection } from "@/components/meal-composer";
import type { EventAnalysisResult, GlucoseReading } from "@/lib/event-analysis";
import type { EventComparisonResult } from "@/lib/event-comparison";
import {
  CHART_TOOLTIP_CONTENT_STYLE,
  CHART_TOOLTIP_OFFSET,
  CHART_TOOLTIP_WRAPPER_STYLE,
} from "@/lib/chart-tooltip";
import type {
  EventInput,
  EventLinkSuggestion,
  EventRelationType,
  EventType,
  GlucoEvent,
  LinkedEvent,
} from "@/lib/events";
import { eventInsulinDoses } from "@/lib/events";
import type { MealItem } from "@/lib/foods";
import { INSULIN_TYPE_LABELS, type PatientInsulin } from "@/lib/insulins";

interface LibreSession {
  token: string;
  userId: string;
  region: string;
}

interface EventCenterProps {
  session: LibreSession;
  events: GlucoEvent[];
  visibleFrom: number;
  visibleTo: number;
  loading: boolean;
  error: string | null;
  onRefresh: () => Promise<void>;
  onChanged: () => Promise<void>;
  insulins: PatientInsulin[];
}

export interface EventCenterHandle {
  openEvent: (event: GlucoEvent) => void;
  openNewAt: (occurredAt: Date, type: EventType) => void;
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
  if (event.type === "insulin") {
    const doses = eventInsulinDoses(event);
    if (doses.length) return doses.map((dose) => `${dose.name} ${dose.units} U`).join(" · ");
  }
  if (event.type === "exercise") return String(event.metadata.intensity ?? "");
  return event.notes ?? "";
}

export const EventCenter = forwardRef<EventCenterHandle, EventCenterProps>(function EventCenter({ session, events, visibleFrom, visibleTo, loading, error, onRefresh, onChanged, insulins }, ref) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const [open, setOpen] = useState(false);
  const [panelView, setPanelView] = useState<"register" | "today" | "compare">("register");
  const [type, setType] = useState<EventType>("meal");
  const [editing, setEditing] = useState<GlucoEvent | null>(null);
  const [title, setTitle] = useState("");
  const [occurredAt, setOccurredAt] = useState(localDateTime);
  const [endedAt, setEndedAt] = useState("");
  const [notes, setNotes] = useState("");
  const [carbs, setCarbs] = useState("");
  const [insulinDoses, setInsulinDoses] = useState<Record<string, string>>({});
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
  const [comparisonSelection, setComparisonSelection] = useState<string[]>([]);
  const [comparison, setComparison] = useState<EventComparisonResult | null>(null);
  const [comparisonLoading, setComparisonLoading] = useState(false);
  const [comparisonError, setComparisonError] = useState<string | null>(null);
  const [mealSelection, setMealSelection] = useState<MealSelection[]>([]);
  const [mealCompositionDirty, setMealCompositionDirty] = useState(false);
  const [duplicating, setDuplicating] = useState<GlucoEvent | null>(null);

  const visibleEvents = useMemo(() => {
    return events.filter((event) => {
      const occurredAt = new Date(event.occurred_at).getTime();
      const endedAt = event.ended_at ? new Date(event.ended_at).getTime() : occurredAt;
      return endedAt >= visibleFrom && occurredAt <= visibleTo;
    });
  }, [events, visibleFrom, visibleTo]);

  const visibleRangeLabel = useMemo(() => {
    const from = new Date(visibleFrom);
    const to = new Date(visibleTo);
    const sameDay = from.toDateString() === to.toDateString();
    const time = (date: Date) => date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    if (sameDay) return `${time(from)}–${time(to)}`;
    return `${from.toLocaleDateString([], { day: "2-digit", month: "short" })}, ${time(from)} – ${to.toLocaleDateString([], { day: "2-digit", month: "short" })}, ${time(to)}`;
  }, [visibleFrom, visibleTo]);

  const selectedMealCarbs = useMemo(() => mealSelection.reduce(
    (sum, item) => sum + Number(item.food.carbs_g) * item.quantity,
    0,
  ), [mealSelection]);

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

  const reset = useCallback((nextType: EventType = "meal", nextOccurredAt = new Date()) => {
    setEditing(null);
    setDuplicating(null);
    setType(nextType);
    setTitle(nextType === "insulin" ? (insulins[0]?.name ?? "") : "");
    setOccurredAt(localDateTime(nextOccurredAt));
    setEndedAt("");
    setNotes("");
    setCarbs("");
    setInsulinDoses(insulins[0] ? { [insulins[0].name]: "" } : {});
    setIsCorrection(false);
    setIntensity("medium");
    setMealSelection([]);
    setMealCompositionDirty(false);
    setFormError(null);
  }, [insulins]);

  const edit = (event: GlucoEvent) => {
    setDetail(null);
    setPanelView("register");
    setEditing(event);
    setDuplicating(null);
    setType(event.type);
    setTitle(event.title);
    setOccurredAt(localDateTime(new Date(event.occurred_at)));
    setEndedAt(event.ended_at ? localDateTime(new Date(event.ended_at)) : "");
    setNotes(event.notes ?? "");
    setCarbs(event.metadata.carbs_g == null ? "" : String(event.metadata.carbs_g));
    setInsulinDoses(Object.fromEntries(eventInsulinDoses(event).map((dose) => [dose.name, String(dose.units)])));
    setIsCorrection(event.metadata.dose_purpose === "correction");
    setIntensity(String(event.metadata.intensity ?? "medium"));
    setMealSelection([]);
    setMealCompositionDirty(false);
    setFormError(null);
    if (event.type === "meal") {
      void (async () => {
        try {
          const response = await fetch(`/api/events/${event.id}/meal-items`, { headers: headers(session) });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error ?? "No se pudo cargar la composición de la comida.");
          const items = (result.data ?? []) as MealItem[];
          setMealSelection(items.filter((item) => item.food_id).map((item) => ({
            quantity: Number(item.quantity),
            food: {
              id: item.food_id as string,
              patient_id: item.patient_id,
              name: item.food_name,
              serving_size: Number(item.serving_size),
              serving_unit: item.serving_unit,
              carbs_g: Number(item.carbs_g) / Number(item.quantity),
              protein_g: Number(item.protein_g) / Number(item.quantity),
              fat_g: Number(item.fat_g) / Number(item.quantity),
              calories: item.calories == null ? null : Number(item.calories) / Number(item.quantity),
              favorite: false,
              created_at: item.created_at,
              updated_at: item.updated_at,
            },
          })));
        } catch (requestError) {
          setFormError(requestError instanceof Error ? requestError.message : "No se pudo cargar la composición de la comida.");
        }
      })();
    }
  };

  const duplicateMeal = async (event: GlucoEvent) => {
    setDetail(null);
    setPanelView("register");
    setEditing(null);
    setDuplicating(event);
    setType("meal");
    setTitle(event.title);
    setOccurredAt(localDateTime());
    setEndedAt("");
    setNotes(event.notes ?? "");
    setCarbs(event.metadata.carbs_g == null ? "" : String(event.metadata.carbs_g));
    setMealSelection([]);
    setMealCompositionDirty(false);
    setFormError(null);
    try {
      const response = await fetch(`/api/events/${event.id}/meal-items`, { headers: headers(session) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "No se pudo cargar la composición histórica.");
      const items = (result.data ?? []) as MealItem[];
      if (!items.length) throw new Error("Esta comida no tiene alimentos guardados para reutilizar.");
      setMealSelection(items.map((item) => ({
        sourceMealItemId: item.id,
        quantity: Number(item.quantity),
        food: {
          id: `snapshot:${item.id}`,
          patient_id: item.patient_id,
          name: item.food_name,
          serving_size: Number(item.serving_size),
          serving_unit: item.serving_unit,
          carbs_g: Number(item.carbs_g) / Number(item.quantity),
          protein_g: Number(item.protein_g) / Number(item.quantity),
          fat_g: Number(item.fat_g) / Number(item.quantity),
          calories: item.calories == null ? null : Number(item.calories) / Number(item.quantity),
          favorite: false,
          created_at: item.created_at,
          updated_at: item.updated_at,
        },
      })));
    } catch (requestError) {
      setDuplicating(null);
      setFormError(requestError instanceof Error ? requestError.message : "No se pudo preparar la copia de la comida.");
    }
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
    openNewAt(nextOccurredAt, nextType) {
      setDetail(null);
      setDetailError(null);
      setPanelView("register");
      reset(nextType, nextOccurredAt);
      setOpen(true);
    },
  }), [openDetail, reset]);

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
    if (type === "meal") metadata.carbs_g = mealSelection.length ? selectedMealCarbs : Number(carbs);
    if (type === "insulin") {
      const doses = insulins.flatMap((insulin) => Object.hasOwn(insulinDoses, insulin.name)
        ? [{ name: insulin.name, insulin_type: insulin.insulin_type, units: Number(insulinDoses[insulin.name]) }]
        : []);
      metadata.insulin_doses = doses;
      metadata.dose_purpose = isCorrection ? "correction" : "meal";
    }
    if (type === "exercise") metadata.intensity = intensity;

    let payloadTitle = title;
    if (type === "insulin") {
      const selectedNames = insulins.filter((insulin) => Object.hasOwn(insulinDoses, insulin.name)).map((insulin) => insulin.name);
      const combinedTitle = selectedNames.join(" + ");
      payloadTitle = combinedTitle.length > 120 ? `Dosis combinada (${selectedNames.length} insulinas)` : combinedTitle || "Insulina";
    }
    const payload: EventInput = {
      type,
      title: payloadTitle,
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
      if (type === "meal" && (mealSelection.length > 0 || (editing && mealCompositionDirty))) {
        const compositionResponse = await fetch(`/api/events/${result.data.id}/meal-items`, {
          method: "PUT",
          headers: headers(session),
          body: JSON.stringify({ items: mealSelection.map((item) => item.sourceMealItemId
            ? { source_meal_item_id: item.sourceMealItemId, quantity: item.quantity }
            : { food_id: item.food.id, quantity: item.quantity }) }),
        });
        const compositionResult = await compositionResponse.json();
        if (!compositionResponse.ok) throw new Error(`El evento se guardó, pero no su composición: ${compositionResult.error ?? "intentá nuevamente."}`);
      }
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

  const toggleComparisonEvent = (event: GlucoEvent) => {
    setComparisonError(null);
    setComparisonSelection((current) => {
      if (current.includes(event.id)) return current.filter((id) => id !== event.id);
      if (current.length >= 8) return current;
      const selectedType = events.find((candidate) => candidate.id === current[0])?.type;
      if (selectedType && selectedType !== event.type) return current;
      return [...current, event.id];
    });
  };

  const compareEvents = async () => {
    if (comparisonSelection.length < 2) {
      setComparisonError("Seleccioná al menos dos eventos del mismo tipo.");
      return;
    }
    setComparisonLoading(true);
    setComparisonError(null);
    try {
      const response = await fetch("/api/events/compare", {
        method: "POST",
        headers: headers(session),
        body: JSON.stringify({ event_ids: comparisonSelection }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "No se pudieron comparar los eventos.");
      setComparison(result.data);
    } catch (requestError) {
      setComparisonError(requestError instanceof Error ? requestError.message : "No se pudieron comparar los eventos.");
    } finally {
      setComparisonLoading(false);
    }
  };

  return (
    <>
      <Button ref={triggerRef} aria-label="Registrar evento" onClick={() => { setDetail(null); setDetailError(null); setPanelView("register"); reset("insulin"); setOpen(true); }} className="h-11 w-11 gap-2 px-0 text-[10px] font-bold sm:h-8 sm:w-auto sm:px-3">
        <Plus className="h-4 w-4" />
        <span className="hidden sm:inline">Registrar evento</span>
      </Button>

      {open && typeof document !== "undefined" ? createPortal(
        <div className="fixed inset-0 z-50 bg-black/45" role="presentation" onMouseDown={(event) => {
          if (event.currentTarget === event.target) setOpen(false);
        }}>
          <aside ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="event-center-title" className="absolute inset-y-0 right-0 flex w-full max-w-lg flex-col overflow-hidden bg-background shadow-2xl">
            <div className="flex items-start justify-between gap-4 px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))] sm:px-6 sm:pb-4 sm:pt-5">
              <div className="min-w-0">
                <h2 id="event-center-title" className="text-lg font-bold tracking-tight">Eventos</h2>
                <p className="mt-1 max-w-sm text-sm leading-5 text-muted-foreground">Sumá contexto a la curva de glucosa.</p>
              </div>
              <Button variant="ghost" size="icon" className="shrink-0" onClick={() => setOpen(false)} aria-label="Cerrar panel">
                <X className="h-4 w-4" />
              </Button>
            </div>

            {!detail && !detailLoading ? (
              <div className="overflow-x-auto border-b px-4 sm:px-6">
                <nav className="flex min-w-max gap-5" aria-label="Secciones de eventos">
                  <button type="button" aria-current={panelView === "register" ? "page" : undefined} onClick={() => setPanelView("register")} className={`min-h-11 border-b-2 px-0.5 text-sm font-semibold transition-colors ${panelView === "register" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>Registrar</button>
                  <button type="button" aria-current={panelView === "today" ? "page" : undefined} onClick={() => setPanelView("today")} className={`min-h-11 border-b-2 px-0.5 text-sm font-semibold transition-colors ${panelView === "today" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>En gráfico <span className="ml-1 text-xs font-medium text-muted-foreground">{visibleEvents.length}</span></button>
                  <button type="button" aria-current={panelView === "compare" ? "page" : undefined} onClick={() => setPanelView("compare")} className={`min-h-11 border-b-2 px-0.5 text-sm font-semibold transition-colors ${panelView === "compare" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>Comparar</button>
                </nav>
              </div>
            ) : null}

            <div className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden bg-muted/10 px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-6">
              {detail ? (
                <EventDetail
                  data={detail}
                  relationships={relationships}
                  error={detailError}
                  pendingKey={relationshipPendingKey}
                  dosePurposeSaving={dosePurposeSaving}
                  onBack={() => setDetail(null)}
                  onEdit={() => edit(detail.event)}
                  onDuplicate={detail.event.type === "meal" ? () => void duplicateMeal(detail.event) : undefined}
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
                      <div className="min-w-0"><h3 className="truncate text-sm font-bold">{editing ? "Editar evento" : duplicating ? "Repetir comida" : copy[type].title}</h3><p className="mt-0.5 text-xs text-muted-foreground">{duplicating ? "Revisá la hora y las porciones antes de registrar." : "Elegí el tipo y completá lo esencial."}</p></div>
                    </div>
                    {editing || duplicating ? <button type="button" onClick={() => reset(type)} className="min-h-11 shrink-0 px-2 text-xs font-medium text-muted-foreground hover:text-foreground sm:min-h-8">Cancelar</button> : null}
                  </div>

                  <div className="border-b bg-muted/20 p-2" aria-label="Tipo de evento">
                    <div className="grid grid-cols-4 gap-1 rounded-xl bg-muted/60 p-1">
                      {choices.map((choice) => {
                        const Icon = choice.icon;
                        return <button key={choice.type} type="button" aria-label={choice.label} aria-pressed={type === choice.type} disabled={Boolean(editing || duplicating)} onClick={() => { const selectedAt = new Date(occurredAt); reset(choice.type, Number.isNaN(selectedAt.getTime()) ? new Date() : selectedAt); }} className={`flex min-h-12 items-center justify-center gap-1.5 rounded-lg px-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60 ${type === choice.type ? "bg-background text-primary shadow-sm" : "text-muted-foreground hover:bg-background/60 hover:text-foreground"}`}><Icon className="h-4 w-4" /><span className="hidden min-[390px]:inline">{choice.label}</span></button>;
                      })}
                    </div>
                  </div>

                  <div className="space-y-3 px-4 py-4 sm:px-5">
                    {type === "insulin" ? (
                      <fieldset className="space-y-2">
                        <legend className="text-xs font-semibold text-muted-foreground">Insulina</legend>
                        <div className="grid grid-cols-2 gap-2">
                          {insulins.map((insulin) => {
                            const selected = Object.hasOwn(insulinDoses, insulin.name);
                            return <div key={`${insulin.name}-${insulin.insulin_type}`} className={`overflow-hidden rounded-xl border transition-colors ${selected ? "border-primary bg-primary/5" : "bg-background"}`}><button type="button" aria-pressed={selected} onClick={() => setInsulinDoses((current) => { const next = { ...current }; if (Object.hasOwn(next, insulin.name)) delete next[insulin.name]; else next[insulin.name] = ""; return next; })} className="flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"><span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${selected ? "border-primary bg-primary text-primary-foreground" : "border-input"}`}>{selected ? <Check className="h-3.5 w-3.5" /> : null}</span><span className="min-w-0"><span className="block truncate text-sm font-bold">{insulin.name}</span><span className="mt-0.5 block text-xs text-muted-foreground">{INSULIN_TYPE_LABELS[insulin.insulin_type]}</span></span></button>{selected ? <div className="border-t px-2 py-2"><InsetNumberStepper id={`event-units-${insulin.sort_order}`} label={`Dosis de ${insulin.name}`} value={insulinDoses[insulin.name]} onValueChange={(value) => setInsulinDoses((current) => ({ ...current, [insulin.name]: String(value) }))} step={1} min={0} unit="U" required /></div> : null}</div>;
                          })}
                        </div>
                        <p className="text-xs leading-5 text-muted-foreground">Podés seleccionar más de una si las aplicaste al mismo tiempo.</p>
                      </fieldset>
                    ) : <InsetField id="event-title" label="Nombre"><Input id="event-title" className={insetControlClass} value={title} onChange={(event) => setTitle(event.target.value)} placeholder={copy[type].placeholder} maxLength={120} required /></InsetField>}
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <InsetField id="event-occurred-at" label="Fecha y hora"><Input id="event-occurred-at" className={insetControlClass} type="datetime-local" value={occurredAt} onChange={(event) => setOccurredAt(event.target.value)} required /></InsetField>
                      {type === "meal" ? <InsetNumberStepper id="event-carbs" label={mealSelection.length ? "Carbohidratos calculados" : "Carbohidratos"} value={mealSelection.length ? Number(selectedMealCarbs.toFixed(1)) : carbs} onValueChange={setCarbs} step={1} min={0} unit="g CH" readOnly={mealSelection.length > 0} required /> : null}
                      {type === "exercise" ? <InsetField id="event-ended-at" label="Finalización"><Input id="event-ended-at" className={insetControlClass} type="datetime-local" value={endedAt} onChange={(event) => setEndedAt(event.target.value)} required /></InsetField> : null}
                    </div>
                    {type === "meal" ? <MealComposer session={session} value={mealSelection} disabled={saving} onChange={(next) => { setMealSelection(next); setMealCompositionDirty(true); if (next.length) setCarbs(String(next.reduce((sum, item) => sum + Number(item.food.carbs_g) * item.quantity, 0))); }} /> : null}
                    {type === "insulin" ? <label htmlFor="event-correction" className="flex min-h-14 cursor-pointer items-start gap-3 rounded-xl border bg-background px-3 py-3"><input id="event-correction" type="checkbox" checked={isCorrection} onChange={(event) => setIsCorrection(event.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-primary" /><span className="min-w-0"><span className="block text-sm font-semibold">Esta dosis fue una corrección</span><span className="mt-0.5 block text-xs leading-5 text-muted-foreground">Desmarcada se guarda como dosis habitual o asociada a comida.</span></span></label> : null}
                    {type === "exercise" ? <InsetField id="exercise-intensity" label="Intensidad"><select id="exercise-intensity" value={intensity} onChange={(event) => setIntensity(event.target.value)} className={insetSelectClass}><option value="low">Baja</option><option value="medium">Media</option><option value="high">Alta</option></select></InsetField> : null}
                    <InsetField id="event-notes" label="Nota" optional><textarea id="event-notes" value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={2000} rows={3} placeholder="Agregá un dato que ayude a interpretar el evento" className={insetTextareaClass} /></InsetField>
                    {formError ? <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive">{formError}</p> : null}
                  </div>
                  <div className="grid grid-cols-1 gap-2 border-t bg-muted/20 px-4 py-3 min-[380px]:grid-cols-[auto_1fr] sm:px-5"><Button type="button" variant="ghost" className="min-h-11" onClick={() => setOpen(false)}>Cancelar</Button><Button type="submit" disabled={saving} className="min-h-11 min-w-0 gap-2"><Save className="h-4 w-4" />{saving ? "Guardando…" : editing ? "Guardar cambios" : duplicating ? "Registrar copia" : "Registrar"}</Button></div>
                </form>
              ) : panelView === "compare" ? (
                comparison ? (
                  <EventComparison
                    data={comparison}
                    onBack={() => setComparison(null)}
                  />
                ) : (
                  <ComparisonPicker
                    events={events}
                    selectedIds={comparisonSelection}
                    loading={comparisonLoading}
                    error={comparisonError}
                    onToggle={toggleComparisonEvent}
                    onCompare={() => void compareEvents()}
                    onClear={() => { setComparisonSelection([]); setComparisonError(null); }}
                  />
                )
              ) : (
                <section>
                <div className="flex items-center justify-between">
                  <div><h3 className="text-base font-bold">Eventos en el gráfico</h3><p className="mt-1 text-sm text-muted-foreground">{visibleRangeLabel} · {visibleEvents.length} {visibleEvents.length === 1 ? "evento" : "eventos"}</p></div>
                  {loading ? <span role="status" className="text-xs text-muted-foreground">Actualizando…</span> : null}
                </div>
                {detailError ? <p role="alert" className="mt-4 rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive">{detailError}</p> : null}
                {error ? <p role="alert" className="mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p> : null}
                <div className="mt-4 overflow-hidden rounded-2xl border bg-card px-4 shadow-sm sm:px-5">
                  {!loading && visibleEvents.length === 0 ? <div className="flex flex-col items-center py-10 text-center"><BookOpenText className="h-6 w-6 text-muted-foreground" /><p className="mt-3 text-sm font-medium">No hay eventos en este rango</p><p className="mt-1 text-xs text-muted-foreground">Cambiá el rango del gráfico o registrá un evento.</p></div> : null}
                  {visibleEvents.map((event) => {
                    const Icon = eventIcon(event.type);
                    return (
                      <article key={event.id} className="group flex items-center gap-3 border-b py-3.5 last:border-b-0">
                        <div className="mt-0.5 rounded-lg bg-muted p-2 text-primary"><Icon className="h-4 w-4" /></div>
                        <button type="button" disabled={detailLoading} onClick={() => void openDetail(event)} className="min-w-0 flex-1 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><div className="flex items-baseline gap-2"><time className="font-numbers text-xs font-bold">{new Date(event.occurred_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time><h4 className="truncate text-sm font-semibold">{event.title}</h4></div><p className="mt-1 truncate text-xs text-muted-foreground">{eventSummary(event) || "Sin detalles adicionales"}</p></button>
                        <div className="flex opacity-100 transition-opacity sm:opacity-80 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"><Button type="button" variant="ghost" size="icon" className="h-11 w-11 sm:h-8 sm:w-8" onClick={() => edit(event)} aria-label={`Editar ${event.title}`}><Pencil className="h-3.5 w-3.5" /></Button><Button type="button" variant="ghost" size="icon" className="h-11 w-11 text-destructive sm:h-8 sm:w-8" onClick={() => void remove(event)} aria-label={`Eliminar ${event.title}`}><Trash2 className="h-3.5 w-3.5" /></Button></div>
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

const comparisonColors = ["#2563eb", "#db2777", "#7c3aed", "#0891b2", "#ea580c", "#16a34a", "#9333ea", "#475569"];
const comparisonDashes = [undefined, "8 3", "3 3", "10 3 2 3", "2 4", "12 4", "6 2 2 2", "1 3"];

function ComparisonPicker({
  events,
  selectedIds,
  loading,
  error,
  onToggle,
  onCompare,
  onClear,
}: {
  events: GlucoEvent[];
  selectedIds: string[];
  loading: boolean;
  error: string | null;
  onToggle: (event: GlucoEvent) => void;
  onCompare: () => void;
  onClear: () => void;
}) {
  const selectedType = events.find((event) => event.id === selectedIds[0])?.type;
  const comparableEvents = events.filter((event) => choices.some((choice) => choice.type === event.type));
  return (
    <section>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-bold">Comparar respuestas</h3>
          <p className="mt-1 text-sm leading-5 text-muted-foreground">Elegí entre 2 y 8 eventos del mismo tipo. Las curvas se alinean en el momento del registro.</p>
        </div>
        {selectedIds.length ? <button type="button" onClick={onClear} className="min-h-11 shrink-0 text-xs font-semibold text-muted-foreground hover:text-foreground">Limpiar</button> : null}
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border bg-card shadow-sm">
        {comparableEvents.length === 0 ? (
          <div className="px-4 py-10 text-center"><BarChart3 className="mx-auto h-6 w-6 text-muted-foreground" /><p className="mt-3 text-sm font-medium">Todavía no hay eventos para comparar</p></div>
        ) : comparableEvents.map((event) => {
          const checked = selectedIds.includes(event.id);
          const disabled = Boolean(selectedType && selectedType !== event.type) || (!checked && selectedIds.length >= 8);
          return (
            <label key={event.id} className={`flex min-h-16 items-center gap-3 border-b px-4 py-3 last:border-b-0 ${disabled ? "cursor-not-allowed opacity-45" : "cursor-pointer hover:bg-muted/30"}`}>
              <input type="checkbox" checked={checked} disabled={disabled || loading} onChange={() => onToggle(event)} className="h-5 w-5 shrink-0 accent-primary" />
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">{renderEventIcon(event.type, "h-4 w-4")}</span>
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{event.title}</span><span className="mt-0.5 block truncate text-xs text-muted-foreground">{new Date(event.occurred_at).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}{eventSummary(event) ? ` · ${eventSummary(event)}` : ""}</span></span>
            </label>
          );
        })}
      </div>

      {selectedIds.length ? <p className="mt-3 text-xs font-medium text-muted-foreground">{selectedIds.length}/8 seleccionados{selectedType ? ` · ${choices.find((choice) => choice.type === selectedType)?.label ?? selectedType}` : ""}</p> : null}

      {error ? <p role="alert" className="mt-4 rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive">{error}</p> : null}
      <div className="sticky bottom-0 -mx-5 mt-5 border-t bg-background/95 px-5 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <Button type="button" className="min-h-11 w-full gap-2" disabled={loading || selectedIds.length < 2} onClick={onCompare}>
          <BarChart3 className="h-4 w-4" />{loading ? "Preparando comparación…" : `Comparar ${selectedIds.length || ""} ${selectedIds.length === 1 ? "evento" : "eventos"}`}
        </Button>
      </div>
    </section>
  );
}

function EventComparison({ data, onBack }: { data: EventComparisonResult; onBack: () => void }) {
  const chartRows = useMemo(() => {
    const rows = new Map<number, Record<string, number>>();
    const ensure = (minute: number) => {
      const rounded = Math.round(minute);
      const current = rows.get(rounded) ?? { relativeMinutes: rounded };
      rows.set(rounded, current);
      return current;
    };
    data.events.forEach((item, index) => item.points.forEach((point) => {
      ensure(point.relativeMinutes)[`event${index}`] = point.value;
    }));
    data.averageCurve.forEach((point) => {
      const row = ensure(point.relativeMinutes);
      row.average = point.value;
      row.averageN = point.sampleSize;
    });
    return [...rows.values()].toSorted((a, b) => a.relativeMinutes - b.relativeMinutes);
  }, [data]);
  const formatValue = (value: number) => data.unit === "mmol/L" ? value.toFixed(1) : String(Math.round(value));
  const formatGlucose = (value: number | null) => value == null ? "—" : `${formatValue(value)} ${data.unit}`;

  return (
    <section>
      <button type="button" onClick={onBack} className="mb-4 min-h-11 text-xs font-semibold text-primary hover:underline">← Cambiar selección</button>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h3 className="text-xl font-bold">Comparación de eventos</h3><p className="mt-1 text-sm text-muted-foreground">{data.sampleSize} seleccionados · {data.usableSampleSize} con datos utilizables</p></div>
        <span className="rounded-md bg-primary/10 px-2.5 py-1.5 text-xs font-semibold text-primary">n utilizable = {data.usableSampleSize}</span>
      </div>

      <div className="mt-5 h-64 min-w-0 rounded-xl border bg-card p-2 sm:h-72 sm:p-3" role="img" aria-label={`Curvas de glucosa de ${data.sampleSize} eventos alineadas al momento del evento. El promedio usa ${data.usableSampleSize} eventos con cobertura suficiente y puede variar según el momento.`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartRows} margin={{ top: 8, right: 8, bottom: 4, left: -18 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.45} />
            <XAxis dataKey="relativeMinutes" type="number" domain={[-data.window.beforeMinutes, data.window.afterMinutes]} tickFormatter={(value) => value === 0 ? "Evento" : `${value > 0 ? "+" : ""}${value}m`} tick={{ fontSize: 10 }} />
            <YAxis domain={["dataMin - 15", "dataMax + 15"]} tick={{ fontSize: 10 }} />
            <Tooltip offset={CHART_TOOLTIP_OFFSET} allowEscapeViewBox={{ x: false, y: true }} wrapperStyle={CHART_TOOLTIP_WRAPPER_STYLE} contentStyle={CHART_TOOLTIP_CONTENT_STYLE} labelFormatter={(value) => Number(value) === 0 ? "Momento del evento" : `${Math.abs(Number(value))} min ${Number(value) > 0 ? "después" : "antes"}`} formatter={(value, name, item) => [`${formatValue(Number(value))} ${data.unit}${name === "average" ? ` · n ${String((item.payload as Record<string, unknown>).averageN ?? data.usableSampleSize)}` : ""}`, name === "average" ? "Promedio" : data.events[Number(String(name).replace("event", ""))]?.event.title ?? String(name)]} />
            <ReferenceLine x={0} stroke="var(--foreground)" strokeDasharray="3 3" />
            {data.events.map((item, index) => <Line key={item.event.id} type="monotone" dataKey={`event${index}`} stroke={comparisonColors[index]} strokeDasharray={comparisonDashes[index]} strokeWidth={1.5} strokeOpacity={0.58} dot={false} connectNulls={false} isAnimationActive={false} />)}
            <Line type="monotone" dataKey="average" name="average" stroke="var(--foreground)" strokeWidth={3} dot={false} connectNulls={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 rounded-xl bg-muted/50 px-3 py-3 text-xs">
        <span className="flex items-center gap-2 font-semibold"><span className="h-0.5 w-5 bg-foreground" />Promedio</span>
        {data.events.map((item, index) => <span key={item.event.id} className="flex min-w-0 items-center gap-2 text-muted-foreground"><svg aria-hidden="true" className="h-2 w-5 shrink-0" viewBox="0 0 20 4"><line x1="0" y1="2" x2="20" y2="2" stroke={comparisonColors[index]} strokeWidth="2" strokeDasharray={comparisonDashes[index]} /></svg><span className="max-w-28 truncate">{item.event.title}</span></span>)}
      </div>

      <div className="mobile-scroll-hint -mx-1 mt-5 max-w-[calc(100%+0.5rem)] overflow-x-auto overscroll-x-contain rounded-xl border bg-card" tabIndex={0} aria-label="Tabla comparativa desplazable horizontalmente">
        <table className="w-full min-w-[540px] text-left text-xs">
          <thead className="bg-muted/50 text-muted-foreground"><tr><th className="px-3 py-2.5 font-semibold">Evento</th><th className="px-3 py-2.5 font-semibold">Previa</th><th className="px-3 py-2.5 font-semibold">Δ</th><th className="px-3 py-2.5 font-semibold">Pico</th><th className="px-3 py-2.5 font-semibold">Al pico</th><th className="px-3 py-2.5 font-semibold">TIR posterior</th></tr></thead>
          <tbody>{data.events.map((item) => { const usable = item.analysis.quality !== "insufficient"; return <tr key={item.event.id} className="border-t"><td className="max-w-40 px-3 py-3"><span className="block truncate font-semibold">{item.event.title}</span><span className="mt-0.5 block text-muted-foreground">{new Date(item.event.occurred_at).toLocaleDateString()} · {usable ? item.analysis.quality === "good" ? "buena cobertura" : "provisional" : "datos insuficientes"}</span></td><td className="font-numbers px-3 py-3">{formatGlucose(item.analysis.baselineGlucose)}</td><td className="font-numbers px-3 py-3">{!usable || item.analysis.glucoseDelta == null ? "—" : `${item.analysis.glucoseDelta >= 0 ? "+" : ""}${formatValue(item.analysis.glucoseDelta)} ${data.unit}`}</td><td className="font-numbers px-3 py-3">{usable ? formatGlucose(item.analysis.peakGlucose) : "—"}</td><td className="font-numbers px-3 py-3">{!usable || item.analysis.timeToPeakMinutes == null ? "—" : `${item.analysis.timeToPeakMinutes} min`}</td><td className="font-numbers px-3 py-3">{!usable || item.analysis.timeInRange == null ? "—" : `${item.analysis.timeInRange}%`}</td></tr>; })}</tbody>
        </table>
      </div>
      <p className="mt-4 text-xs leading-5 text-muted-foreground">Curvas alineadas a t=0. El promedio excluye eventos con datos insuficientes y se calcula cada 15 minutos sólo cuando hay al menos dos muestras cercanas; el n efectivo aparece en el tooltip y puede variar. Los resultados describen estos registros; no implican causalidad ni constituyen una recomendación terapéutica.</p>
    </section>
  );
}

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
  onDuplicate,
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
  onDuplicate?: () => void;
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
      <button type="button" onClick={onBack} className="mb-4 min-h-11 text-xs font-semibold text-primary hover:underline">← Volver al registro</button>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs text-muted-foreground">{new Date(data.event.occurred_at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</p>
          <h3 className="mt-1 text-xl font-bold">{data.event.title}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{eventSummary(data.event)}</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className={`rounded-md px-2 py-1 text-[10px] font-semibold ${data.analysis.complete ? "bg-emerald-500/10 text-emerald-600" : "bg-amber-500/10 text-amber-600"}`}>{data.analysis.complete ? "Ventana temporal finalizada" : "Análisis en curso"}</span>
          <Button type="button" variant="outline" size="sm" className="min-h-9 gap-2" onClick={onEdit}><Pencil className="h-3.5 w-3.5" />Editar</Button>
          {onDuplicate ? <Button type="button" variant="outline" size="sm" className="min-h-9 gap-2" onClick={onDuplicate}><Copy className="h-3.5 w-3.5" />Repetir</Button> : null}
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
                offset={CHART_TOOLTIP_OFFSET}
                cursor={{ stroke: "var(--muted-foreground)", strokeOpacity: 0.35, strokeDasharray: "3 3" }}
                allowEscapeViewBox={{ x: false, y: true }}
                wrapperStyle={CHART_TOOLTIP_WRAPPER_STYLE}
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
                    <div className="min-w-36 rounded-xl border border-border/60 bg-popover/80 px-3 py-2.5 text-popover-foreground shadow-lg backdrop-blur-md">
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
