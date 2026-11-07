import { usePlotArea, useXAxisScale, useYAxisScale, ZIndexLayer } from "recharts";
import type { MonitorExtremum } from "@/lib/monitor-extrema";

const CLUSTER_WIDTH_PX = 64;
const CLUSTER_HEIGHT_PX = 80;

export function MonitorExtremaLabels({ extrema, getColor }: {
  extrema: MonitorExtremum[];
  getColor: (value: number) => string;
}) {
  const plot = usePlotArea();
  const xScale = useXAxisScale();
  const yScale = useYAxisScale();
  if (!plot || !xScale || !yScale) return null;

  const labels: {
    x: number;
    y: number;
    cx: number;
    cy: number;
    halfWidth: number;
    text: string;
    point: MonitorExtremum;
  }[] = [];
  for (const point of extrema) {
    const cx = xScale(point.time);
    const cy = yScale(point.value);
    if (cx === undefined || cy === undefined) continue;

    // Extrema arrive in priority order. Reserve space around the marker itself
    // so moving a label above or below it cannot bypass the density filter.
    if (point.prominence !== Infinity && labels.some(label =>
      Math.abs(cx - label.cx) < CLUSTER_WIDTH_PX &&
      Math.abs(cy - label.cy) < CLUSTER_HEIGHT_PX
    )) continue;

    const text = String(Math.round(point.value));
    const halfWidth = text.length * 3.5 + 4;
    const x = Math.max(plot.x + halfWidth, Math.min(cx, plot.x + plot.width - halfWidth));
    const offsets = point.kind === "max" ? [-8, 13] : [13, -8];
    const positions = offsets.map(offset => Math.max(
      plot.y + 11,
      Math.min(cy + offset, plot.y + plot.height - 4),
    ));
    const fits = (y: number) => labels.every(label =>
      Math.abs(x - label.x) >= halfWidth + label.halfWidth ||
      Math.abs(y - label.y) >= 15,
    );
    // Absolute extrema get first pick and may move farther from the marker.
    const y = positions.find(fits) ?? (point.prominence === Infinity
      ? [plot.y + 11, plot.y + plot.height - 4].find(fits)
      : undefined);
    if (y === undefined) continue;
    labels.push({ x, y, cx, cy, halfWidth, text, point });
  }

  return (
    <ZIndexLayer zIndex={1000}>
      <g aria-hidden="true" className="pointer-events-none">
        {labels.map(({ x, y, cx, cy, text, point }) => {
          const color = getColor(point.value);
          return (
            <g key={point.time}>
              <circle cx={cx} cy={cy} r={3} fill={color} stroke="var(--background)" strokeWidth={1.5} />
              <text x={x} y={y} textAnchor="middle" fill={color} fontSize={9} fontWeight={800} paintOrder="stroke" stroke="var(--background)" strokeWidth={3} strokeLinejoin="round">
                {text}
              </text>
            </g>
          );
        })}
      </g>
    </ZIndexLayer>
  );
}
