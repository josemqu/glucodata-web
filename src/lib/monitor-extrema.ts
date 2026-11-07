type Reading = { time: number; value: number };

export type MonitorExtremum = Reading & {
  kind: "min" | "max";
  prominence: number;
};

// Visual filter for labels, in mg/dL.
const MIN_REVERSAL = 20;

/** Readings must be in chronological order and within the displayed window. */
export function findMonitorExtrema(readings: Reading[]): MonitorExtremum[] {
  if (!readings.length) return [];

  const minimum = readings.reduce((best, point) => point.value < best.value ? point : best);
  const maximum = readings.reduce((best, point) => point.value > best.value ? point : best);
  const absolute: MonitorExtremum[] = [
    { ...minimum, kind: "min", prominence: Infinity },
  ];
  if (minimum.value === maximum.value) return absolute;
  absolute.push({ ...maximum, kind: "max", prominence: Infinity });

  const turns: (Reading & { kind: MonitorExtremum["kind"] })[] = [];
  let low = readings[0];
  let high = readings[0];
  let direction: "up" | "down" | undefined;

  // A swing stays open until the series reverses far enough from its best reading.
  for (const point of readings) {
    if (direction === undefined) {
      if (point.value < low.value) low = point;
      if (point.value > high.value) high = point;
      if (high.value - low.value < MIN_REVERSAL) continue;

      direction = low.time < high.time ? "up" : "down";
      turns.push(direction === "up" ? { ...low, kind: "min" } : { ...high, kind: "max" });
    } else if (direction === "up") {
      if (point.value > high.value) high = point;
      if (high.value - point.value >= MIN_REVERSAL) {
        turns.push({ ...high, kind: "max" });
        low = point;
        direction = "down";
      }
    } else {
      if (point.value < low.value) low = point;
      if (point.value - low.value >= MIN_REVERSAL) {
        turns.push({ ...low, kind: "min" });
        high = point;
        direction = "up";
      }
    }
  }

  if (direction === undefined) return absolute;

  // The open swing can measure the outgoing leg of the last confirmed turn.
  turns.push(direction === "up" ? { ...high, kind: "max" } : { ...low, kind: "min" });
  const local = turns.slice(1, -1).flatMap((point, index) => {
    if (absolute.some(extreme => extreme.time === point.time)) return [];
    const prominence = Math.min(
      Math.abs(point.value - turns[index].value),
      Math.abs(point.value - turns[index + 2].value),
    );
    return [{ ...point, prominence }];
  });
  return [...absolute, ...local.sort((a, b) => b.prominence - a.prominence)];
}
