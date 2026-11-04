"use client";

import { useActiveTooltipDataPoints, useIsTooltipActive, usePlotArea, useXAxisScale, useYAxisScale, ZIndexLayer } from "recharts";
import styles from "./chart-active-label.module.css";

type MonitorPoint = { time: number; value: number | null };

export function MonitorActiveLabel({ enabled, getColor }: { enabled: boolean; getColor: (value: number) => string }) {
  const data = useActiveTooltipDataPoints<MonitorPoint>()?.find((point) => point.value !== null && Number.isFinite(point.value) && Number.isFinite(point.time));
  const active = useIsTooltipActive();
  const plot = usePlotArea();
  const xScale = useXAxisScale();
  const yScale = useYAxisScale();
  if (!enabled || !active || !data || data.value === null || !plot || !xScale || !yScale) return null;
  const x = xScale(data.time);
  const y = yScale(data.value);
  if (x === undefined || y === undefined || x < plot.x || x > plot.x + plot.width || y < plot.y || y > plot.y + plot.height) return null;

  const color = getColor(data.value);
  const leftSide = x + 60 > plot.x + plot.width;
  const labelX = x + (leftSide ? -12 : 12);
  const labelY = Math.max(plot.y + 16, Math.min(plot.y + plot.height - 62, y));
  const timeX = Math.max(plot.x + 65, Math.min(plot.x + plot.width - 65, x));
  const time = new Date(data.time).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  return (
    <ZIndexLayer zIndex={2000}>
      <g className={styles.labels} pointerEvents="none" role="group" aria-label={`${time}. ${Math.round(data.value)} mg/dL`}>
        <g className={styles.dot} style={{ transform: `translate(${x}px, ${y}px)` }} aria-hidden="true">
          <circle r={6} fill={color} stroke="var(--background)" strokeWidth={2} />
        </g>
        <g className={`${styles.dot} ${styles.label}`} style={{ transform: `translate(${labelX}px, ${labelY}px)` }} aria-hidden="true">
          <text textAnchor={leftSide ? "end" : "start"} dominantBaseline="central" fill={color} className={styles.value}>{Math.round(data.value)}</text>
        </g>
        <g className={styles.dot} style={{ transform: `translate(${timeX}px, ${plot.y + plot.height - 42}px)` }} aria-hidden="true">
          <text textAnchor="middle" className={styles.time}>{time}</text>
        </g>
      </g>
    </ZIndexLayer>
  );
}
