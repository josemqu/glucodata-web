import { NextResponse } from "next/server";

import {
  isEventRelationType,
  type EventLink,
  type EventLinkSuggestion,
  type EventRelationType,
  type GlucoEvent,
  type LinkedEvent,
} from "@/lib/events";
import {
  createEventsDatabase,
  EventAuthError,
  requireActivePatient,
} from "@/lib/server/event-auth";

type RouteContext = { params: Promise<{ id: string }> };
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function failure(error: unknown) {
  const status = error instanceof EventAuthError ? error.status : 500;
  const message = error instanceof Error ? error.message : "No se pudieron procesar las relaciones.";
  return NextResponse.json({ success: false, error: message }, { status });
}

function suggestedRelation(parent: GlucoEvent, candidate: GlucoEvent): EventRelationType | null {
  const distanceMinutes = (new Date(candidate.occurred_at).getTime() - new Date(parent.occurred_at).getTime()) / 60_000;
  if (parent.type === "meal" && candidate.type === "insulin" && Math.abs(distanceMinutes) <= 45) {
    return "meal_insulin";
  }
  if (parent.type === "meal" && candidate.type === "exercise" && distanceMinutes >= 0 && distanceMinutes <= 180) {
    return "post_meal_exercise";
  }
  if (parent.type === "meal" && candidate.type === "exercise" && distanceMinutes < 0 && distanceMinutes >= -120) {
    return "pre_meal_exercise";
  }
  return null;
}

function canonicalPair(firstId: string, secondId: string) {
  return firstId < secondId ? [firstId, secondId] as const : [secondId, firstId] as const;
}

function relationIsValid(first: GlucoEvent, second: GlucoEvent, relation: EventRelationType) {
  const meal = first.type === "meal" ? first : second.type === "meal" ? second : null;
  const insulin = first.type === "insulin" ? first : second.type === "insulin" ? second : null;
  const exercise = first.type === "exercise" ? first : second.type === "exercise" ? second : null;
  if (relation === "related") return true;
  if (relation === "meal_insulin") return Boolean(meal && insulin);
  if (relation === "correction") return Boolean(meal && insulin && new Date(insulin.occurred_at) > new Date(meal.occurred_at));
  if (!meal || !exercise) return false;
  const distanceMinutes = (new Date(exercise.occurred_at).getTime() - new Date(meal.occurred_at).getTime()) / 60_000;
  return relation === "post_meal_exercise"
    ? distanceMinutes >= 0 && distanceMinutes <= 180
    : distanceMinutes < 0 && distanceMinutes >= -120;
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const patientId = await requireActivePatient(request);
    const { id } = await context.params;
    if (!UUID_PATTERN.test(id)) return NextResponse.json({ success: false, error: "El identificador del evento no es válido." }, { status: 400 });
    const database = createEventsDatabase();
    const { data: parent, error: parentError } = await database
      .from("events")
      .select("*")
      .eq("id", id)
      .eq("patient_id", patientId)
      .maybeSingle<GlucoEvent>();
    if (parentError) throw parentError;
    if (!parent) return NextResponse.json({ success: false, error: "Evento no encontrado." }, { status: 404 });

    const { data: linkRows, error: linksError } = await database
      .from("event_links")
      .select("*")
      .eq("patient_id", patientId)
      .or(`parent_event_id.eq.${id},related_event_id.eq.${id}`);
    if (linksError) throw linksError;

    const links = (linkRows ?? []) as EventLink[];
    const linkedIds = links.map((link) => link.parent_event_id === id ? link.related_event_id : link.parent_event_id);
    let linkedEvents: GlucoEvent[] = [];
    if (linkedIds.length) {
      const linkedResult = await database
        .from("events")
        .select("*")
        .eq("patient_id", patientId)
        .in("id", linkedIds);
      if (linkedResult.error) throw linkedResult.error;
      linkedEvents = (linkedResult.data ?? []) as GlucoEvent[];
    }
    const eventsById = new Map(linkedEvents.map((event) => [event.id, event]));
    const accepted: LinkedEvent[] = links
      .filter((link) => link.status === "accepted")
      .flatMap((link) => {
        const relatedId = link.parent_event_id === id ? link.related_event_id : link.parent_event_id;
        const event = eventsById.get(relatedId);
        return event ? [{ link, event }] : [];
      });

    const parentTime = new Date(parent.occurred_at).getTime();
    const nearbyResult = await database
      .from("events")
      .select("*")
      .eq("patient_id", patientId)
      .neq("id", id)
      .gte("occurred_at", new Date(parentTime - 3 * 60 * 60 * 1000).toISOString())
      .lte("occurred_at", new Date(parentTime + 3 * 60 * 60 * 1000).toISOString())
      .order("occurred_at", { ascending: true });
    if (nearbyResult.error) throw nearbyResult.error;

    const resolvedIds = new Set(linkedIds);
    const suggestions: EventLinkSuggestion[] = ((nearbyResult.data ?? []) as GlucoEvent[])
      .flatMap((candidate) => {
        if (resolvedIds.has(candidate.id)) return [];
        const relation = suggestedRelation(parent, candidate);
        if (!relation) return [];
        return [{
          event: candidate,
          relation_type: relation,
          distance_minutes: Math.round((new Date(candidate.occurred_at).getTime() - parentTime) / 60_000),
        }];
      });

    return NextResponse.json({ success: true, data: { links: accepted, suggestions } });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const patientId = await requireActivePatient(request);
    const { id } = await context.params;
    const body = await request.json() as Record<string, unknown>;
    const relatedEventId = typeof body.related_event_id === "string" ? body.related_event_id : "";
    const status = body.status === "dismissed" ? "dismissed" : "accepted";
    if (!UUID_PATTERN.test(id) || !UUID_PATTERN.test(relatedEventId) || relatedEventId === id || !isEventRelationType(body.relation_type)) {
      return NextResponse.json({ success: false, error: "La relación no es válida." }, { status: 400 });
    }

    const database = createEventsDatabase();
    const { data: events, error: eventsError } = await database
      .from("events")
      .select("*")
      .eq("patient_id", patientId)
      .in("id", [id, relatedEventId]);
    if (eventsError) throw eventsError;
    if ((events ?? []).length !== 2) {
      return NextResponse.json({ success: false, error: "Uno de los eventos no pertenece al paciente activo." }, { status: 404 });
    }
    const typedEvents = events as GlucoEvent[];
    if (!relationIsValid(typedEvents[0], typedEvents[1], body.relation_type)) {
      return NextResponse.json({ success: false, error: "El tipo o el orden temporal de los eventos no coincide con la relación." }, { status: 422 });
    }
    const [parentEventId, canonicalRelatedEventId] = canonicalPair(id, relatedEventId);

    const { data, error } = await database
      .from("event_links")
      .upsert({
        patient_id: patientId,
        parent_event_id: parentEventId,
        related_event_id: canonicalRelatedEventId,
        relation_type: body.relation_type,
        status,
      }, { onConflict: "patient_id,parent_event_id,related_event_id" })
      .select("*")
      .single();
    if (error) throw error;
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return failure(error);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const patientId = await requireActivePatient(request);
    const { id } = await context.params;
    const linkId = new URL(request.url).searchParams.get("link_id") ?? "";
    if (!UUID_PATTERN.test(id) || !UUID_PATTERN.test(linkId)) return NextResponse.json({ success: false, error: "La relación no tiene identificadores válidos." }, { status: 400 });
    const { data, error } = await createEventsDatabase()
      .from("event_links")
      .delete()
      .eq("id", linkId)
      .eq("patient_id", patientId)
      .or(`parent_event_id.eq.${id},related_event_id.eq.${id}`)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ success: false, error: "Relación no encontrada." }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (error) {
    return failure(error);
  }
}
