"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, ChevronLeft, ChevronRight, LoaderCircle, RotateCw } from "lucide-react";
import { getYearOverviewAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type YearOverviewDay = {
  date: string;
  average: number;
  count: number;
  timeInRangePercent: number | null;
  coverageMinutes: number;
};
type Targets = { low: number; high: number; hypo: number; hyper: number };
type Metric = "average" | "timeInRange";
type HoverTooltip = {
  date: string;
  day?: YearOverviewDay;
  x: number;
  y: number;
  placement: "above" | "below";
};

const CELL_SIZE = 15;
const CELL_GAP = 3;
const WEEKDAY_LABELS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

function glucoseBand(value: number, targets: Targets) {
  if (value <= targets.hypo) return "very-low";
  if (value < targets.low) return "low";
  if (value <= targets.high) return "in-range";
  if (value < targets.hyper) return "high";
  return "very-high";
}

function bandClass(value: number, targets: Targets) {
  switch (glucoseBand(value, targets)) {
    case "very-low": return "bg-[#00090b] dark:bg-[#f3fbfd]";
    case "low": return "bg-[#046f82] dark:bg-[#67d2e5]";
    case "in-range": return "bg-[#61be50]";
    case "high": return "bg-[#f37e19]";
    case "very-high": return "bg-[#d73331]";
  }
}

function dateString(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function formatDay(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day, 12).toLocaleDateString("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function YearOverviewChart({
  targets,
  onSelectDate,
}: {
  targets: Targets;
  onSelectDate: (date: string) => void;
}) {
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [days, setDays] = useState<YearOverviewDay[]>([]);
  const [metric, setMetric] = useState<Metric>("average");
  const [hoverTooltip, setHoverTooltip] = useState<HoverTooltip | null>(null);
  const tooltipDismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const currentYear = new Date().getFullYear();
  const requestKey = `${year}:${targets.low}:${targets.high}:${reloadKey}`;
  const loading = loadedKey !== requestKey;

  const cancelTooltipDismiss = () => {
    if (tooltipDismissTimer.current) clearTimeout(tooltipDismissTimer.current);
    tooltipDismissTimer.current = null;
  };
  const dismissDayTooltip = () => {
    cancelTooltipDismiss();
    setHoverTooltip(null);
  };
  const scheduleTooltipDismiss = () => {
    cancelTooltipDismiss();
    tooltipDismissTimer.current = setTimeout(() => setHoverTooltip(null), 120);
  };

  const changeYear = (nextYear: number) => {
    dismissDayTooltip();
    setError(null);
    setYear(nextYear);
  };

  const showDayTooltip = (date: string, day: YearOverviewDay | undefined, element: HTMLButtonElement) => {
    cancelTooltipDismiss();
    const rect = element.getBoundingClientRect();
    const placement = rect.top > 120 ? "above" : "below";
    const horizontalPadding = 152;
    const x = Math.min(Math.max(rect.left + rect.width / 2, horizontalPadding), window.innerWidth - horizontalPadding);
    setHoverTooltip({ date, day, x, y: placement === "above" ? rect.top - 8 : rect.bottom + 8, placement });
  };

  useEffect(() => {
    let active = true;
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    void getYearOverviewAction(year, timeZone, { low: targets.low, high: targets.high }).then((result) => {
      if (!active) return;
      if (!result.success) {
        setError(result.error ?? "No se pudo cargar el resumen anual.");
        setDays([]);
        return;
      }
      setDays(result.data ?? []);
    }).catch(() => {
      if (active) {
        setError("No se pudo cargar el resumen anual.");
        setDays([]);
      }
    }).finally(() => {
      if (active) setLoadedKey(requestKey);
    });

    return () => { active = false; };
  }, [requestKey, year, reloadKey, targets.low, targets.high]);

  const calendar = useMemo(() => {
    const firstDay = new Date(Date.UTC(year, 0, 1)).getUTCDay();
    const numberOfDays = (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / 86_400_000;
    const weekCount = Math.ceil((firstDay + numberOfDays) / 7);
    const daysByDate = new Map(days.map((day) => [day.date, day]));
    const cells: Array<{ date: string; day?: YearOverviewDay }> = [];
    for (let index = 0; index < weekCount * 7; index++) {
      const dayOfYear = index - firstDay;
      if (dayOfYear < 0 || dayOfYear >= numberOfDays) {
        cells.push({ date: `blank-${index}` });
        continue;
      }
      const date = new Date(Date.UTC(year, 0, dayOfYear + 1));
      const key = dateString(year, date.getUTCMonth(), date.getUTCDate());
      cells.push({ date: key, day: daysByDate.get(key) });
    }

    const months = Array.from({ length: 12 }, (_, month) => {
      const dayOffset = Math.floor((firstDay + (Date.UTC(year, month, 1) - Date.UTC(year, 0, 1)) / 86_400_000) / 7);
      return {
        label: new Date(year, month, 1, 12).toLocaleDateString("es-AR", { month: "short" }),
        column: dayOffset + 1,
        month,
      };
    });
    return { cells, months, weekCount };
  }, [days, year]);

  const daysWithData = days.length;
  const mean = days.reduce((sum, day) => sum + day.average * day.count, 0) /
    (days.reduce((sum, day) => sum + day.count, 0) || 1);
  const totalCoverageMinutes = days.reduce((sum, day) => sum + day.coverageMinutes, 0);
  const meanTimeInRange = totalCoverageMinutes > 0
    ? days.reduce((sum, day) => sum + (day.timeInRangePercent ?? 0) * day.coverageMinutes, 0) / totalCoverageMinutes
    : null;
  const summary = metric === "average"
    ? `${daysWithData} días con datos · promedio ${days.length ? `${Math.round(mean)} mg/dL` : "—"}`
    : meanTimeInRange == null
      ? "Sin cobertura de TIR disponible"
      : `TIR promedio ${Math.round(meanTimeInRange)}% · ${Math.round(totalCoverageMinutes / 60)} h de cobertura`;
  const getCellStyle = (day?: YearOverviewDay) => {
    if (metric !== "timeInRange" || day?.timeInRangePercent == null) return undefined;
    const opacity = 0.16 + (day.timeInRangePercent / 100) * 0.72;
    return { backgroundColor: `rgb(var(--year-overview-tir-rgb) / ${opacity.toFixed(3)})` };
  };
  const getCellClass = (day?: YearOverviewDay) => {
    if (!day) return "border border-border/60 bg-muted/60";
    // Match the whole mg/dL value shown in the tooltip and range legend.
    if (metric === "average") return bandClass(Math.round(day.average), targets);
    return day.timeInRangePercent == null ? "border border-border/60 bg-muted/60" : "";
  };
  const getCellDescription = (day?: YearOverviewDay) => {
    if (metric === "average") return day ? `${Math.round(day.average)} mg/dL · ${day.count} lecturas` : "Sin datos";
    if (!day) return "Sin datos";
    return day.timeInRangePercent == null
      ? `${day.count} lecturas · sin cobertura válida de TIR`
      : `TIR ${Math.round(day.timeInRangePercent)}% · ${Math.round(day.coverageMinutes / 60 * 10) / 10} h de cobertura · ${day.count} lecturas`;
  };

  return (
    <Card className="min-h-0 gap-0 overflow-hidden border bg-card/40 shadow-sm">
      <CardHeader className="flex flex-col items-start justify-between gap-3 border-b bg-muted/20 px-4 py-3 sm:flex-row sm:items-center">
        <div className="min-w-0">
          <CardTitle className="text-sm font-bold">Año en glucosa</CardTitle>
          <CardDescription className="mt-1 text-xs">
            {loading ? "Resumiendo lecturas…" : summary}
          </CardDescription>
        </div>
        <div className="flex w-full shrink-0 items-center gap-2 sm:w-auto">
          <label className="relative min-w-0 flex-1 sm:flex-none">
            <span className="sr-only">Métrica del mapa anual</span>
            <select
              value={metric}
              onChange={(event) => { setHoverTooltip(null); setMetric(event.target.value as Metric); }}
              className="h-9 w-full cursor-pointer appearance-none rounded-md border border-input bg-background py-2 pl-2.5 pr-10 text-xs font-medium shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-40"
            >
              <option value="average">Promedio de glucosa</option>
              <option value="timeInRange">Tiempo en rango</option>
            </select>
            <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          </label>
          <div className="flex shrink-0 items-center gap-1 rounded-lg bg-muted/60 p-0.5" aria-label="Año del resumen">
            <Button type="button" variant="ghost" size="icon-sm" className="h-8 w-8" onClick={() => changeYear(year - 1)} disabled={loading} aria-label="Año anterior">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-10 text-center font-numbers text-sm font-bold" aria-live="polite">{year}</span>
            <Button type="button" variant="ghost" size="icon-sm" className="h-8 w-8" onClick={() => changeYear(year + 1)} disabled={loading || year >= currentYear} aria-label="Año siguiente">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-3 sm:p-4">
        {error && !loading ? (
          <div className="flex min-h-44 flex-col items-center justify-center gap-3 text-center">
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button type="button" variant="outline" size="sm" onClick={() => { setError(null); setReloadKey((value) => value + 1); }}>
              <RotateCw className="mr-2 h-3.5 w-3.5" /> Reintentar
            </Button>
          </div>
        ) : loading ? (
          <div className="flex min-h-44 items-center justify-center gap-2 text-sm text-muted-foreground" role="status">
            <LoaderCircle className="h-4 w-4 animate-spin" /> Cargando resumen anual
          </div>
        ) : days.length === 0 ? (
          <div className="flex min-h-44 items-center justify-center px-4 text-center text-sm text-muted-foreground">
            No hay lecturas guardadas para {year}. Los días sin datos quedan vacíos en el calendario.
          </div>
        ) : (
          <>
            <div className="mobile-scroll-hint w-full overflow-x-auto pb-2" aria-label={`Calendario de glucosa de ${year}`} onScroll={dismissDayTooltip}>
              <div className="mx-auto w-fit min-w-max">
                <div
                  className="mb-1 ml-10 grid h-5 items-end text-[10px] font-medium capitalize text-muted-foreground"
                  style={{ gridTemplateColumns: `repeat(${calendar.weekCount}, ${CELL_SIZE}px)`, columnGap: CELL_GAP }}
                  aria-hidden="true"
                >
                  {calendar.months.map((month) => (
                    <span key={month.month} style={{ gridColumn: month.column }} className="whitespace-nowrap">
                      {month.label}
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <div className="grid grid-rows-7 gap-[3px] pt-0.5 text-[9px] leading-[15px] text-muted-foreground" aria-hidden="true">
                    {WEEKDAY_LABELS.map((label, index) => (
                      <span key={label} className={index % 2 === 0 ? "w-8" : "invisible w-8"}>{label}</span>
                    ))}
                  </div>
                  <div
                    className="grid grid-flow-col grid-rows-7 gap-[3px]"
                    style={{ gridTemplateColumns: `repeat(${calendar.weekCount}, ${CELL_SIZE}px)` }}
                  >
                    {calendar.cells.map(({ date, day }) => date.startsWith("blank-") ? (
                      <span key={date} aria-hidden="true" className="h-[15px] w-[15px]" />
                    ) : (
                      <button
                        key={date}
                        type="button"
                        onClick={() => { dismissDayTooltip(); onSelectDate(date); }}
                        onMouseEnter={(event) => showDayTooltip(date, day, event.currentTarget)}
                        onMouseLeave={scheduleTooltipDismiss}
                        onFocus={(event) => showDayTooltip(date, day, event.currentTarget)}
                        onBlur={dismissDayTooltip}
                        onKeyDown={(event) => { if (event.key === "Escape") dismissDayTooltip(); }}
                        title=""
                        aria-label={`${formatDay(date)}: ${getCellDescription(day)}. Abrir en Monitor.`}
                        aria-describedby={hoverTooltip?.date === date ? "year-overview-day-tooltip" : undefined}
                        className={`h-[15px] w-[15px] rounded-[3px] ${metric === "timeInRange" ? "saturate-[0.9]" : "saturate-[0.72]"} outline-none ring-offset-1 transition-[filter,transform] duration-150 hover:z-10 hover:scale-125 hover:saturate-[1.08] focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-ring ${
                          getCellClass(day)
                        }`}
                        style={getCellStyle(day)}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
            {hoverTooltip && typeof document !== "undefined" && createPortal(
              <div
                id="year-overview-day-tooltip"
                role="tooltip"
                onMouseEnter={cancelTooltipDismiss}
                onMouseLeave={scheduleTooltipDismiss}
                className={`fixed z-[100] w-72 max-w-[calc(100vw-1.5rem)] -translate-x-1/2 rounded-xl border border-border/80 bg-popover px-3.5 py-3 text-popover-foreground shadow-xl shadow-black/20 ${
                  hoverTooltip.placement === "above" ? "-translate-y-full" : ""
                }`}
                style={{ left: hoverTooltip.x, top: hoverTooltip.y }}
              >
                <span
                  aria-hidden="true"
                  className={`absolute left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 border-border/80 bg-popover ${
                    hoverTooltip.placement === "above"
                      ? "-bottom-1 border-b border-r"
                      : "-top-1 border-l border-t"
                  }`}
                />
                <p className="relative text-[11px] font-semibold capitalize text-muted-foreground">{formatDay(hoverTooltip.date)}</p>
                {hoverTooltip.day ? (
                  <>
                    {metric === "average" ? (
                      <p className="mt-1 font-numbers text-lg font-bold leading-tight">
                        {Math.round(hoverTooltip.day.average)} <span className="text-xs font-medium text-muted-foreground">mg/dL promedio</span>
                      </p>
                    ) : (
                      <p className="mt-1 font-numbers text-lg font-bold leading-tight">
                        {hoverTooltip.day.timeInRangePercent == null ? "—" : `${Math.round(hoverTooltip.day.timeInRangePercent)}%`}
                        <span className="text-xs font-medium text-muted-foreground"> TIR</span>
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 border-t border-border/70 pt-2 text-[11px] text-muted-foreground">
                      <span>{hoverTooltip.day.count} lecturas</span>
                      {hoverTooltip.day.coverageMinutes > 0 && (
                        <span>{Math.round(hoverTooltip.day.coverageMinutes / 60 * 10) / 10} h de cobertura</span>
                      )}
                      {metric === "timeInRange" && hoverTooltip.day.timeInRangePercent == null && (
                        <span>Sin cobertura válida de TIR</span>
                      )}
                    </div>
                  </>
                ) : (
                  <p className="mt-1 text-sm font-medium">Sin lecturas este día</p>
                )}
              </div>,
              document.body,
            )}
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t pt-3 text-[10px] text-muted-foreground">
              <p>Seleccioná un día para abrirlo en Monitor.</p>
              {metric === "average" ? (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1" aria-label="Escala de glucemia por rangos">
                  <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="h-2.5 w-2.5 rounded-[2px] saturate-[0.72] bg-[#00090b] dark:bg-[#f3fbfd]" /> ≤{targets.hypo}</span>
                  <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="h-2.5 w-2.5 rounded-[2px] saturate-[0.72] bg-[#046f82] dark:bg-[#67d2e5]" /> {targets.hypo + 1}–{targets.low - 1}</span>
                  <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="h-2.5 w-2.5 rounded-[2px] saturate-[0.72] bg-[#61be50]" /> {targets.low}–{targets.high}</span>
                  <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="h-2.5 w-2.5 rounded-[2px] saturate-[0.72] bg-[#f37e19]" /> {targets.high + 1}–{targets.hyper - 1}</span>
                  <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="h-2.5 w-2.5 rounded-[2px] saturate-[0.72] bg-[#d73331]" /> ≥{targets.hyper}</span>
                  <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="h-2.5 w-2.5 rounded-[2px] border border-border bg-muted/60" /> Sin datos</span>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1" aria-label="Escala de tiempo en rango">
                  <span>{targets.low}–{targets.high} mg/dL</span>
                  <span>0%</span>
                  <span aria-hidden="true" className="h-2.5 w-28 rounded-[2px] border border-border/50 saturate-[0.9]" style={{ background: "linear-gradient(to right, rgb(var(--year-overview-tir-rgb) / 0.16), rgb(var(--year-overview-tir-rgb) / 0.88))" }} />
                  <span>100% TIR</span>
                  <span className="inline-flex items-center gap-1"><span aria-hidden="true" className="h-2.5 w-2.5 rounded-[2px] border border-border bg-muted/60" /> Sin cobertura</span>
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
