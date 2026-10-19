"use client";

import { useId, useMemo, useState } from "react";
import { usePlotArea, ZIndexLayer } from "recharts";
import { eventInsulinDoses, type GlucoEvent } from "@/lib/events";
import { INSULIN_TYPES, INSULIN_TYPE_LABELS, type InsulinType } from "@/lib/insulins";

const doseFormat = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 });
const STACK_GAP_PX = 2;
const insulinColors: Record<InsulinType, string> = {
  rapid: "var(--event-insulin)",
  short: "var(--event-medication)",
  intermediate: "var(--event-meal)",
  long: "var(--event-sleep)",
  ultra_long: "var(--event-note)",
  other: "var(--event-other)",
};
const insulinColor = (type: string) => insulinColors[type as InsulinType] ?? insulinColors.other;

export function useMonitorInsulinDoses(events: GlucoEvent[]) {
  return useMemo(() => events.flatMap(event => eventInsulinDoses(event).map((dose, index) => ({
    ...dose,
    id: `${event.id}-${index}`,
    event,
    time: new Date(event.occurred_at).getTime(),
  }))).filter(dose => Number.isFinite(dose.time)), [events]);
}

type Dose = ReturnType<typeof useMonitorInsulinDoses>[number];

export function MonitorInsulinLegend({ doses }: { doses: Dose[] }) {
  if (!doses.length) return null;
  const types = new Set(doses.map(dose => dose.insulin_type));
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-3 pb-2 pt-1 text-[11px] text-muted-foreground" aria-label="Tipos de insulina en el gráfico">
      <span className="font-semibold">Insulina (U)</span>
      {INSULIN_TYPES.filter(type => types.has(type)).map(type => (
        <span key={type} className="inline-flex items-center gap-1.5">
          <span className="h-3 w-2 rounded-sm border" style={{ backgroundColor: `color-mix(in oklab, ${insulinColor(type)} 25%, transparent)`, borderColor: insulinColor(type) }} aria-hidden="true" />
          {INSULIN_TYPE_LABELS[type]}
        </span>
      ))}
    </div>
  );
}

export function MonitorInsulinColumns({ doses, start, end, maximum, onSelect, onHoverChange }: {
  doses: Dose[];
  start: number;
  end: number;
  maximum: number;
  onSelect: (event: GlucoEvent) => void;
  onHoverChange: (id: string | null) => void;
}) {
  const plot = usePlotArea();
  const clipId = useId();
  const [activeId, setActiveId] = useState<string | null>(null);
  if (!plot || end <= start || !doses.length) return null;

  const baseline = plot.y + plot.height - 36;
  // A separate, zero-based dose scale leaves the glucose scale untouched.
  // Keep the same scale while panning through the loaded events.
  const doseHeight = Math.max(0, (plot.height - 36) * 0.45);
  const groups = new Map<number, Dose[]>();
  for (const dose of doses) {
    const group = groups.get(dose.time) ?? [];
    group.push(dose);
    groups.set(dose.time, group);
  }
  const columns = Array.from(groups, ([time, group]) => {
    const center = plot.x + (time - start) / (end - start) * plot.width;
    const width = Math.max(16, ...group.map(dose => doseFormat.format(dose.units).length * 6 + 6));
    const stackTop = baseline - group.reduce((total, dose) => total + dose.units, 0) / maximum * doseHeight - (group.length - 1) * STACK_GAP_PX;
    let accumulatedHeight = 0;
    let outsideLabels = 0;
    return [...group].sort((a, b) => INSULIN_TYPES.indexOf(a.insulin_type as InsulinType) - INSULIN_TYPES.indexOf(b.insulin_type as InsulinType)).map(dose => {
      const height = dose.units / maximum * doseHeight;
      const y = baseline - accumulatedHeight - height;
      accumulatedHeight += height + STACK_GAP_PX;
      const labelInside = height >= 18;
      // Short segments use separate rows above the whole stack, so their
      // labels never cover another dose or overlap one another.
      const labelY = labelInside ? y + height / 2 : stackTop - 7 - outsideLabels++ * 14;
      return { dose, width, x: center - width / 2, y, height, labelInside, labelY };
    });
  }).flat();
  const active = columns.find(column => column.dose.id === activeId);
  const tooltipWidth = Math.min(224, plot.width - 16);
  const setActive = (dose: Dose | null) => {
    setActiveId(dose?.id ?? null);
    onHoverChange(dose?.event.id ?? null);
  };

  return (
    <>
      <defs><clipPath id={clipId}><rect x={plot.x} y={plot.y} width={plot.width} height={plot.height} /></clipPath></defs>
      <ZIndexLayer zIndex={150}>
        <g clipPath={`url(#${clipId})`}>
          {columns.map(({ dose, x, y, width, height, labelInside, labelY }) => {
            const selected = dose.id === activeId;
            const color = insulinColor(dose.insulin_type);
            const type = INSULIN_TYPE_LABELS[dose.insulin_type as InsulinType];
            const time = new Date(dose.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
            return (
              <g key={dose.id} data-chart-event-marker="true" data-insulin-dose={dose.units} role="button" tabIndex={0}
                aria-label={`Abrir ${dose.name}, ${type}, ${doseFormat.format(dose.units)} U, ${time}`}
                className="cursor-pointer outline-none"
                onPointerDown={event => event.stopPropagation()}
                onClick={event => { event.stopPropagation(); onSelect(dose.event); }}
                onMouseEnter={() => setActive(dose)} onMouseLeave={() => setActive(null)}
                onFocus={() => setActive(dose)} onBlur={() => setActive(null)}
                onKeyDown={event => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault(); event.stopPropagation(); onSelect(dose.event);
                  }
                }}
              >
                <rect x={x - 2} y={y} width={width + 4} height={height} fill="transparent" />
                {!labelInside ? <rect x={x - 2} y={labelY - 11} width={width + 4} height={14} fill="transparent" /> : null}
                <rect x={x} y={y} width={width} height={height} rx={Math.min(3, height / 2)}
                  fill={color} fillOpacity={selected ? 0.4 : 0.22} stroke={color} strokeOpacity={selected ? 1 : 0.65} strokeWidth={selected ? 2 : 1} />
                <text x={x + width / 2} y={labelY} dominantBaseline={labelInside ? "central" : "auto"} textAnchor="middle" fill={color} fontSize={10} fontWeight={600} className="font-numbers" pointerEvents="none">
                  {doseFormat.format(dose.units)}
                </text>
              </g>
            );
          })}
        </g>
      </ZIndexLayer>
      {active ? (
        <ZIndexLayer zIndex={1000}>
          <foreignObject x={Math.max(plot.x + 8, Math.min(active.x - tooltipWidth / 2, plot.x + plot.width - tooltipWidth - 8))}
            y={Math.max(plot.y + 8, active.y - 100)} width={tooltipWidth} height={84} pointerEvents="none">
            <div role="tooltip" className="rounded-lg border border-border/60 bg-card/95 px-3 py-2 text-left shadow-lg backdrop-blur-md">
              <p className="truncate text-xs font-semibold text-foreground">{active.dose.name}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">{INSULIN_TYPE_LABELS[active.dose.insulin_type as InsulinType]}</p>
              <p className="mt-1 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                <strong className="font-numbers text-foreground">{doseFormat.format(active.dose.units)} U</strong>
                <span>{new Date(active.dose.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
              </p>
            </div>
          </foreignObject>
        </ZIndexLayer>
      ) : null}
    </>
  );
}
