/**
 * Glucose Analysis Metrics for T1D (Type 1 Diabetes)
 * Based on International Consensus on Time in Range
 */

export interface GlucoseMetric {
  value: number;
  unit: string;
  label: string;
  description: string;
  status: "success" | "warning" | "error" | "info";
  target?: string;
}

export interface RangeDistribution {
  veryLow: number; // < 54 mg/dL
  low: number;     // 54-69 mg/dL
  inRange: number; // 70-180 mg/dL
  high: number;    // 181-250 mg/dL
  veryHigh: number; // > 250 mg/dL
}

export interface PercentilePoint {
  time: string; // HH:mm
  p5: number;
  p25: number;
  p50: number; // median
  p75: number;
  p95: number;
  rangeP5P95: [number, number];
  rangeP25P75: [number, number];
}

export function calculateGMI(meanGlucoseMgDl: number): number {
  // Formula: GMI (%) = 3.31 + 0.02392 x [mean glucose in mg/dL]
  return 3.31 + 0.02392 * meanGlucoseMgDl;
}

export function calculateCV(meanGlucose: number, stdDev: number): number {
  if (meanGlucose === 0) return 0;
  return (stdDev / meanGlucose) * 100;
}

export function getTIRStatus(inRangePct: number): "success" | "warning" | "error" {
  if (inRangePct >= 70) return "success";
  if (inRangePct >= 50) return "warning";
  return "error";
}

export function getCVStatus(cv: number): "success" | "warning" | "error" {
  if (cv <= 36) return "success";
  if (cv <= 40) return "warning";
  return "error";
}

export function calculatePercentiles(data: { value: number; time: number }[]): PercentilePoint[] {
  // Group by hour/minute buckets (e.g., 30-minute intervals)
  const buckets: Record<number, number[]> = {};
  const INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

  data.forEach((p) => {
    const date = new Date(p.time);
    const msSinceStartOfDay = (date.getHours() * 3600 + date.getMinutes() * 60 + date.getSeconds()) * 1000;
    const bucketIndex = Math.floor(msSinceStartOfDay / INTERVAL_MS);
    
    if (!buckets[bucketIndex]) buckets[bucketIndex] = [];
    buckets[bucketIndex].push(p.value);
  });

  const result: PercentilePoint[] = [];
  
  // Ensure we have all buckets (0 to 47 for 30min intervals)
  for (let i = 0; i < 48; i++) {
    const values = buckets[i] || [];
    if (values.length === 0) {
      // If bucket is empty, we might want to interpolate or just skip
      // For now, let's add nulls or skip
      continue;
    }

    values.sort((a, b) => a - b);
    
    const getPercentile = (p: number) => {
      const idx = Math.floor((p / 100) * (values.length - 1));
      return values[idx];
    };

    const totalSeconds = i * (INTERVAL_MS / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const timeStr = `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;

    const p5 = getPercentile(5);
    const p25 = getPercentile(25);
    const p50 = getPercentile(50);
    const p75 = getPercentile(75);
    const p95 = getPercentile(95);

    result.push({
      time: timeStr,
      p5,
      p25,
      p50,
      p75,
      p95,
      rangeP5P95: [p5, p95],
      rangeP25P75: [p25, p75],
    });
  }

  return result;
}
