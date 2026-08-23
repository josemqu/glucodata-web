import type { EventAnalysisResult, GlucoseReading } from "@/lib/event-analysis";
import type { GlucoEvent } from "@/lib/events";

export const EVENT_COMPARISON_VERSION = "event-comparison-v1";
export const COMPARISON_GRID_MINUTES = 15;
const MAX_SAMPLE_DISTANCE_MINUTES = 10;

export interface ComparedEvent {
  event: GlucoEvent;
  analysis: EventAnalysisResult;
  points: Array<{ relativeMinutes: number; value: number }>;
}

export interface EventComparisonResult {
  comparisonVersion: string;
  eventType: GlucoEvent["type"];
  unit: string;
  sampleSize: number;
  usableSampleSize: number;
  window: { beforeMinutes: number; afterMinutes: number };
  events: ComparedEvent[];
  averageCurve: Array<{ relativeMinutes: number; value: number; sampleSize: number }>;
}

function relativeMinutes(event: GlucoEvent, reading: GlucoseReading) {
  return (new Date(reading.timestamp).getTime() - new Date(event.occurred_at).getTime()) / 60_000;
}

function nearestPoint(points: ComparedEvent["points"], target: number) {
  let best: ComparedEvent["points"][number] | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const point of points) {
    const distance = Math.abs(point.relativeMinutes - target);
    if (distance < bestDistance) {
      best = point;
      bestDistance = distance;
    }
  }
  return bestDistance <= MAX_SAMPLE_DISTANCE_MINUTES ? best : null;
}

export function buildEventComparison(
  items: Array<{ event: GlucoEvent; readings: GlucoseReading[]; analysis: EventAnalysisResult }>,
): EventComparisonResult {
  if (items.length < 2) throw new Error("Seleccioná al menos dos eventos para comparar.");
  const eventType = items[0].event.type;
  if (items.some((item) => item.event.type !== eventType)) {
    throw new Error("Los eventos comparados deben ser del mismo tipo.");
  }

  const units = new Set(items.flatMap((item) => item.readings.map((reading) => reading.unit)));
  if (units.size > 1) throw new Error("Los eventos tienen unidades de glucosa incompatibles.");
  const unit = units.values().next().value ?? "mg/dL";
  const window = {
    beforeMinutes: Math.min(...items.map((item) => item.analysis.window.beforeMinutes)),
    afterMinutes: Math.min(...items.map((item) => item.analysis.window.afterMinutes)),
  };
  const events: ComparedEvent[] = items.map(({ event, readings, analysis }) => {
    const rawPoints = readings
      .map((reading) => ({ relativeMinutes: relativeMinutes(event, reading), value: reading.value }))
      .filter((point) => point.relativeMinutes >= -window.beforeMinutes && point.relativeMinutes <= window.afterMinutes)
      .toSorted((a, b) => a.relativeMinutes - b.relativeMinutes);
    const points: ComparedEvent["points"] = [];
    for (let minute = -window.beforeMinutes; minute <= window.afterMinutes; minute += COMPARISON_GRID_MINUTES) {
      const sample = nearestPoint(rawPoints, minute);
      if (sample) points.push({ relativeMinutes: minute, value: sample.value });
    }
    return { event, analysis, points };
  });

  const usableEvents = events.filter((event) => event.analysis.quality !== "insufficient");
  const averageCurve: EventComparisonResult["averageCurve"] = [];
  for (let minute = -window.beforeMinutes; minute <= window.afterMinutes; minute += COMPARISON_GRID_MINUTES) {
    const samples = usableEvents
      .map((event) => nearestPoint(event.points, minute)?.value ?? null)
      .filter((value): value is number => value !== null);
    if (samples.length < 2) continue;
    averageCurve.push({
      relativeMinutes: minute,
      value: samples.reduce((sum, value) => sum + value, 0) / samples.length,
      sampleSize: samples.length,
    });
  }

  return {
    comparisonVersion: EVENT_COMPARISON_VERSION,
    eventType,
    unit,
    sampleSize: events.length,
    usableSampleSize: usableEvents.length,
    window,
    events,
    averageCurve,
  };
}
