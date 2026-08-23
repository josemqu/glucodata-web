import type { EventType } from "@/lib/events";

export interface AnalysisWindow {
  beforeMinutes: number;
  afterMinutes: number;
}

export interface GlucoseReading {
  timestamp: string;
  value: number;
  unit: string;
}

export interface GlucoseTargets {
  low: number;
  high: number;
}

export const EVENT_ANALYSIS_VERSION = "event-response-v1";

export interface EventAnalysisResult {
  analysisVersion: string;
  window: AnalysisWindow & { start: string; end: string };
  complete: boolean;
  readingCount: number;
  baselineGlucose: number | null;
  peakGlucose: number | null;
  nadirGlucose: number | null;
  glucoseDelta: number | null;
  timeToPeakMinutes: number | null;
  glucose1h: number | null;
  glucose2h: number | null;
  glucose3h: number | null;
  glucose4h: number | null;
  averageGlucose: number | null;
  timeInRange: number | null;
  timeAboveRange: number | null;
  timeBelowRange: number | null;
  coveragePercent: number;
  coveredMinutes: number;
  expectedMinutes: number;
  gapCount: number;
  quality: "good" | "partial" | "insufficient";
  targets: GlucoseTargets;
}

export const ANALYSIS_WINDOWS: Record<EventType, AnalysisWindow> = {
  meal: { beforeMinutes: 30, afterMinutes: 240 },
  insulin: { beforeMinutes: 30, afterMinutes: 360 },
  exercise: { beforeMinutes: 60, afterMinutes: 360 },
  medication: { beforeMinutes: 30, afterMinutes: 240 },
  sleep: { beforeMinutes: 60, afterMinutes: 480 },
  health: { beforeMinutes: 30, afterMinutes: 240 },
  note: { beforeMinutes: 30, afterMinutes: 240 },
  other: { beforeMinutes: 30, afterMinutes: 240 },
};

const NEAREST_TOLERANCE_MS = 10 * 60 * 1000;
const MAX_CONTIGUOUS_GAP_MS = 15 * 60 * 1000;
const DEFAULT_TARGETS: GlucoseTargets = { low: 70, high: 180 };

function nearest(readings: GlucoseReading[], targetMs: number) {
  let candidate: GlucoseReading | null = null;
  let distance = Number.POSITIVE_INFINITY;
  for (const reading of readings) {
    const currentDistance = Math.abs(new Date(reading.timestamp).getTime() - targetMs);
    if (currentDistance < distance) {
      candidate = reading;
      distance = currentDistance;
    }
  }
  return distance <= NEAREST_TOLERANCE_MS ? candidate : null;
}

function baselineBeforeEvent(readings: GlucoseReading[], occurredMs: number) {
  const eligible = readings.filter((reading) => {
    const timestamp = new Date(reading.timestamp).getTime();
    return timestamp <= occurredMs && occurredMs - timestamp <= NEAREST_TOLERANCE_MS;
  });
  return eligible.at(-1) ?? null;
}

export function analyzeEventGlucose(
  type: EventType,
  occurredAt: string,
  readings: GlucoseReading[],
  now = new Date(),
  targets: GlucoseTargets = DEFAULT_TARGETS,
): EventAnalysisResult {
  const window = ANALYSIS_WINDOWS[type];
  const occurredMs = new Date(occurredAt).getTime();
  const startMs = occurredMs - window.beforeMinutes * 60_000;
  const endMs = occurredMs + window.afterMinutes * 60_000;
  const validReadings = readings
    .filter((reading) => Number.isFinite(reading.value) && Number.isFinite(new Date(reading.timestamp).getTime()))
    .toSorted((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  const postEvent = validReadings.filter((reading) => {
    const timestamp = new Date(reading.timestamp).getTime();
    return timestamp >= occurredMs && timestamp <= endMs;
  });
  const observedEndMs = Math.min(endMs, now.getTime());
  const expectedMinutes = Math.max(0, (observedEndMs - occurredMs) / 60_000);
  let coveredMs = 0;
  let weightedGlucose = 0;
  let aboveRangeMs = 0;
  let belowRangeMs = 0;
  let gapCount = 0;

  const firstPostEventMs = postEvent[0]
    ? new Date(postEvent[0].timestamp).getTime()
    : null;
  const lastPostEventMs = postEvent.at(-1)
    ? new Date(postEvent.at(-1)!.timestamp).getTime()
    : null;
  if (firstPostEventMs === null || firstPostEventMs - occurredMs > MAX_CONTIGUOUS_GAP_MS) gapCount += 1;
  if (lastPostEventMs === null || observedEndMs - lastPostEventMs > MAX_CONTIGUOUS_GAP_MS) gapCount += 1;

  for (let index = 0; index < postEvent.length; index += 1) {
    const reading = postEvent[index];
    const timestamp = new Date(reading.timestamp).getTime();
    const nextTimestamp = index + 1 < postEvent.length
      ? new Date(postEvent[index + 1].timestamp).getTime()
      : observedEndMs;
    const rawDuration = Math.max(0, Math.min(nextTimestamp, observedEndMs) - timestamp);
    if (index + 1 < postEvent.length && rawDuration > MAX_CONTIGUOUS_GAP_MS) gapCount += 1;
    const duration = Math.min(rawDuration, MAX_CONTIGUOUS_GAP_MS);
    if (duration <= 0) continue;
    coveredMs += duration;
    weightedGlucose += reading.value * duration;
    if (reading.value < targets.low) belowRangeMs += duration;
    else if (reading.value > targets.high) aboveRangeMs += duration;
  }

  const coveredMinutes = coveredMs / 60_000;
  const coveragePercent = expectedMinutes > 0
    ? Math.min(100, Math.round((coveredMinutes / expectedMinutes) * 100))
    : 0;
  const quality = postEvent.length < 2 || coveragePercent < 50
    ? "insufficient"
    : coveragePercent < 80 || gapCount > 0
      ? "partial"
      : "good";
  const belowPercent = coveredMs > 0 ? Math.round((belowRangeMs / coveredMs) * 100) : null;
  const abovePercent = coveredMs > 0 ? Math.round((aboveRangeMs / coveredMs) * 100) : null;
  const inRangePercent = belowPercent !== null && abovePercent !== null
    ? Math.max(0, 100 - belowPercent - abovePercent)
    : null;
  const baseline = baselineBeforeEvent(validReadings, occurredMs);
  const peak = postEvent.reduce<GlucoseReading | null>(
    (current, reading) => !current || reading.value > current.value ? reading : current,
    null,
  );
  const nadir = postEvent.reduce<GlucoseReading | null>(
    (current, reading) => !current || reading.value < current.value ? reading : current,
    null,
  );
  const atHour = (hours: number) => nearest(validReadings, occurredMs + hours * 60 * 60 * 1000)?.value ?? null;

  return {
    analysisVersion: EVENT_ANALYSIS_VERSION,
    window: {
      ...window,
      start: new Date(startMs).toISOString(),
      end: new Date(endMs).toISOString(),
    },
    complete: now.getTime() >= endMs,
    readingCount: validReadings.length,
    baselineGlucose: baseline?.value ?? null,
    peakGlucose: peak?.value ?? null,
    nadirGlucose: nadir?.value ?? null,
    glucoseDelta: baseline && peak ? peak.value - baseline.value : null,
    timeToPeakMinutes: peak
      ? Math.max(0, Math.round((new Date(peak.timestamp).getTime() - occurredMs) / 60_000))
      : null,
    glucose1h: atHour(1),
    glucose2h: atHour(2),
    glucose3h: atHour(3),
    glucose4h: window.afterMinutes >= 240 ? atHour(4) : null,
    averageGlucose: coveredMs > 0 ? Math.round(weightedGlucose / coveredMs) : null,
    timeInRange: inRangePercent,
    timeAboveRange: abovePercent,
    timeBelowRange: belowPercent,
    coveragePercent,
    coveredMinutes: Math.round(coveredMinutes),
    expectedMinutes: Math.round(expectedMinutes),
    gapCount,
    quality,
    targets,
  };
}
