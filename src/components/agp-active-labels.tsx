"use client";

import { useActiveTooltipDataPoints, useIsTooltipActive, usePlotArea, useXAxisScale, useYAxisScale, ZIndexLayer } from "recharts";
import type { PercentilePoint } from "@/lib/metrics";
import styles from "./agp-active-dot.module.css";

const PERCENTILES = ["p95", "p75", "p50", "p25", "p5"] as const;
const LABEL_GAP = 22;

export function AgpActiveLabels({ medianColor }: { medianColor: (value: number) => string }) {
  const data = useActiveTooltipDataPoints<PercentilePoint>()?.[0];
  const active = useIsTooltipActive();
  const plot = usePlotArea();
  const xScale = useXAxisScale();
  const yScale = useYAxisScale();
  if (!active || !data?.count || !plot || !xScale || !yScale) return null;
  const x = xScale(data.timeMinutes);
  if (x === undefined) return null;

  const nodes = PERCENTILES.flatMap((key) => {
    const value = data[key];
    const y = value === null ? undefined : yScale(value);
    return value !== null && Number.isFinite(value) && y !== undefined && Number.isFinite(y)
      ? [{ key, value, y: Math.max(plot.y + 6, Math.min(plot.y + plot.height - 6, y)), outside: y < plot.y ? "↑" : y > plot.y + plot.height ? "↓" : "" }]
      : [];
  });
  if (!nodes.length) return null;

  const top = plot.y + 32;
  const bottom = plot.y + plot.height - 30;
  const clamp = (y: number) => Math.max(top, Math.min(bottom, y));
  const labelPositions = new Map<string, number>();
  const upper = nodes[0];
  const lower = nodes[nodes.length - 1];
  labelPositions.set(upper.key, clamp(upper.y));
  if (upper !== lower) {
    // Reserve room for both extremes before considering the inner percentiles.
    const upperY = Math.min(clamp(upper.y), bottom - LABEL_GAP);
    labelPositions.set(upper.key, upperY);
    labelPositions.set(lower.key, Math.max(clamp(lower.y), upperY + LABEL_GAP));
  }
  for (const key of ["p50", "p75", "p25"] as const) {
    const node = nodes.find((item) => item.key === key);
    if (!node || labelPositions.has(key)) continue;
    const y = clamp(node.y);
    if ([...labelPositions.values()].every((otherY) => Math.abs(otherY - y) >= LABEL_GAP)) {
      labelPositions.set(key, y);
    }
  }

  const leftSide = x + 100 > plot.x + plot.width;
  const labelX = leftSide ? -12 : 12;
  return (
    <ZIndexLayer zIndex={2000}>
      <g pointerEvents="none" className={styles.labels} role="group" aria-label={`${data.time}. ${nodes.map(({ key, value }) => `${key.toUpperCase()}: ${Math.round(value)} mg/dL`).join(". ")}`}>
        {nodes.map(({ key, value, y, outside }) => {
          const labelY = labelPositions.get(key);
          const color = key === "p50" ? medianColor(value) : key === "p75" || key === "p25" ? "#10b981" : "var(--muted-foreground)";
          return (
            <g key={key} aria-hidden="true">
              <g className={styles.dot} style={{ transform: `translate(${x}px, ${y}px)` }}>
                <circle r={key === "p50" ? 6 : 4} fill={color} stroke={key === "p50" ? "none" : "var(--background)"} strokeWidth={2} />
              </g>
              {labelY !== undefined && (
                <g className={`${styles.dot} ${styles.label}`} style={{ transform: `translate(${x + labelX}px, ${labelY}px)` }}>
                  {Math.abs(labelY - y) > 3 && <path d={`M 0 0 L ${-labelX / 2} ${y - labelY}`} stroke={color} strokeOpacity={0.5} fill="none" />}
                  <text textAnchor={leftSide ? "end" : "start"} dominantBaseline="central" fill={color} className={styles.value}>
                    <tspan className={styles.percentile}>{key.toUpperCase()} </tspan>{Math.round(value)}{outside ? ` ${outside}` : ""}
                  </text>
                </g>
              )}
            </g>
          );
        })}
        <g className={styles.dot} style={{ transform: `translate(${Math.max(plot.x + 48, Math.min(plot.x + plot.width - 48, x))}px, ${plot.y + plot.height - 3}px)` }}>
          <text textAnchor="middle" className={styles.time}>{data.time}</text>
        </g>
      </g>
    </ZIndexLayer>
  );
}
