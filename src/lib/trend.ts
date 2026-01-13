
export enum TrendState {
  DoubleDown = "DoubleDown", // < -3.5
  Down = "Down", // -3.5 to -2
  DownAngledLarge = "DownAngledLarge", // -2 to -1.5   (-60 deg)
  DownAngled = "DownAngled", // -1.5 to -1         (-45 deg)
  DownSlight = "DownSlight", // -1 to -0.5         (-30 deg)
  Flat = "Flat", // -0.5 to 0.5
  UpSlight = "UpSlight", // 0.5 to 1             (30 deg)
  UpAngled = "UpAngled", // 1 to 1.5             (45 deg)
  UpAngledLarge = "UpAngledLarge", // 1.5 to 2     (60 deg)
  Up = "Up", // 2 to 3.5
  DoubleUp = "DoubleUp", // > 3.5
}

export function calculateTrend(
  history: { time: number; value: number }[],
  windowMinutes: number = 30
): TrendState {
  if (!history || history.length < 2) return TrendState.Flat;

  // 1. Filter data within the window (e.g., last 30 minutes)
  const now = history[history.length - 1].time;
  const startTime = now - windowMinutes * 60 * 1000;
  
  // Get points in window
  const points = history.filter((p) => p.time >= startTime);

  if (points.length < 2) {
      // Fallback: try to use at least last 2 points even if outside ideal window, 
      // but if we are here it might be just noise.
      // Let's just return Flat if not enough data.
      return TrendState.Flat;
  }

  // 2. Calculate Slope using Linear Regression
  // x = time in minutes (relative to start), y = glucose
  const n = points.length;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;

  // Normalize time to minutes from the first point in the window to avoid huge numbers
  const t0 = points[0].time;

  for (const p of points) {
    const x = (p.time - t0) / 60000; // minutes
    const y = p.value;
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumXX += x * x;
  }

  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);

  // 3. Map Slope to State
  // Slopes are in mg/dL per minute
  
  if (slope <= -3.5) return TrendState.DoubleDown;
  if (slope <= -2.0) return TrendState.Down;
  if (slope <= -1.5) return TrendState.DownAngledLarge;
  if (slope <= -1.0) return TrendState.DownAngled;
  if (slope <= -0.5) return TrendState.DownSlight;
  if (slope <= 0.5) return TrendState.Flat;
  if (slope <= 1.0) return TrendState.UpSlight;
  if (slope <= 1.5) return TrendState.UpAngled;
  if (slope <= 2.0) return TrendState.UpAngledLarge;
  if (slope <= 3.5) return TrendState.Up;
  return TrendState.DoubleUp;
}

export function getTrendRotation(state: TrendState): number {
    switch (state) {
        case TrendState.DoubleDown: return 0; // Handled by icon
        case TrendState.Down: return 180;
        case TrendState.DownAngledLarge: return 150;
        case TrendState.DownAngled: return 135;
        case TrendState.DownSlight: return 120; // or 105
        case TrendState.Flat: return 90; // ArrowRight rotated 90? No, ArrowUp is 0. ArrowRight is 90.
                                         // Let's assume we use a single ArrowUp icon for all singles.
        case TrendState.UpSlight: return 60; // or 75
        case TrendState.UpAngled: return 45;
        case TrendState.UpAngledLarge: return 30;
        case TrendState.Up: return 0;
        case TrendState.DoubleUp: return 0; // Handled by icon
    }
    return 0;
}
