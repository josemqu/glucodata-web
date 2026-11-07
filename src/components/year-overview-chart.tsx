"use client";

import { LoadingSpinner } from "@/components/loading-spinner";
import { useCallback, useMemo, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, RotateCw } from "lucide-react";
import { AnalysisResource, useAnalysisResource } from "@/lib/analysis-resource";
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
type ActiveDay = {
  date: string;
  day?: YearOverviewDay;
};

const EMPTY_DAYS: YearOverviewDay[] = [];
const TIR_BANDS = [
  { min: 0, label: "0–19%", color: "bg-emerald-100 dark:bg-emerald-950" },
  { min: 20, label: "20–39%", color: "bg-emerald-200 dark:bg-emerald-800" },
  { min: 40, label: "40–59%", color: "bg-emerald-400 dark:bg-emerald-600" },
  { min: 60, label: "60–79%", color: "bg-emerald-600 dark:bg-emerald-400" },
  { min: 80, label: "80–100%", color: "bg-emerald-800 dark:bg-emerald-200" },
];
const CELL_SIZE = 15;
const CELL_GAP = 3;
const WEEKDAY_LABELS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

function glucoseBands(targets: Targets) {
  const highMidpoint = Math.floor((targets.high + targets.hyper) / 2);
  const upperHigh = targets.hyper + 50;
  return [
    { min: -Infinity, label: `≤${targets.hypo}`, color: "bg-[#00090b] dark:bg-[#f3fbfd]" },
    { min: targets.hypo + 1, label: `${targets.hypo + 1}–${targets.low - 1}`, color: "bg-[#046f82] dark:bg-[#67d2e5]" },
    { min: targets.low, label: `${targets.low}–${targets.high}`, color: "bg-[#61be50]" },
    { min: targets.high + 1, label: `${targets.high + 1}–${highMidpoint - 1}`, color: "bg-[#f5b642]" },
    { min: highMidpoint, label: `${highMidpoint}–${targets.hyper - 1}`, color: "bg-[#f37e19]" },
    { min: targets.hyper, label: `${targets.hyper}–${upperHigh - 1}`, color: "bg-[#e34b3c]" },
    { min: upperHigh, label: `≥${upperHigh}`, color: "bg-[#a51c30]" },
  ].filter((band, index, bands) => index === bands.length - 1 || band.min < bands[index + 1].min);
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
  targets, resource, timeZone, year, onYearChange, onRefresh,
  onSelectDate,
}: {
  targets: Targets;
  resource: AnalysisResource<YearOverviewDay[]>;
  timeZone: string;
  onRefresh: () => void;
  year: number;
  onYearChange: (year: number) => void;
  onSelectDate: (date: string) => void;
}) {
  const [metric, setMetric] = useState<Metric>("average");
  const [activeDay, setActiveDay] = useState<ActiveDay | null>(null);
  const currentYear = new Date().getFullYear();
  const fetcher = useCallback((refresh = false) => getYearOverviewAction(year, timeZone, { low: targets.low, high: targets.high }, refresh), [year, timeZone, targets.low, targets.high]);
  const result = useAnalysisResource(resource, String(year), fetcher);
  const days = result.data ?? EMPTY_DAYS;
  const { loading, error } = result;
  const refresh = () => {
    onRefresh();
    void resource.load(String(year), () => getYearOverviewAction(year, timeZone, { low: targets.low, high: targets.high }, true), true);
  };

  const dismissDayLabel = () => setActiveDay(null);
  const showDayLabel = (date: string, day: YearOverviewDay | undefined) => {
    setActiveDay({ date, day });
  };

  const changeYear = (nextYear: number) => {
    dismissDayLabel();
    onYearChange(nextYear);
  };

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

  const averageBands = glucoseBands(targets);
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
  const getCellClass = (day?: YearOverviewDay) => {
    if (!day) return "border border-border/60 bg-muted/60";
    // Match the whole mg/dL value shown in the data label and range legend.
    if (metric === "average") return averageBands.findLast((band) => Math.round(day.average) >= band.min)!.color;
    if (day.timeInRangePercent == null) return "border border-border/60 bg-muted/60";
    const percent = Math.round(day.timeInRangePercent);
    return TIR_BANDS.findLast((band) => percent >= band.min)?.color ?? TIR_BANDS[0].color;
  };
  const getCellDescription = (day?: YearOverviewDay) => {
    if (metric === "average") return day ? `${Math.round(day.average)} mg/dL · ${day.count} lecturas` : "Sin datos";
    if (!day) return "Sin datos";
    return day.timeInRangePercent == null
      ? `${day.count} lecturas · sin cobertura válida de TIR`
      : `TIR ${Math.round(day.timeInRangePercent)}% · ${Math.round(day.coverageMinutes / 60 * 10) / 10} h de cobertura · ${day.count} lecturas`;
  };

  return (
    <Card className="min-h-0 gap-0 overflow-hidden border bg-card/20 shadow-sm">
      <CardHeader className="flex flex-col items-start justify-between gap-3 border-b bg-muted/10 px-3 py-2.5 pb-2.5! sm:px-4 sm:py-2 sm:pb-2! sm:flex-row sm:items-center">
        <div className="min-w-0">
          <CardTitle className="flex h-8 items-center text-[10px] font-bold uppercase tracking-[0.18em] opacity-75">Año en glucosa</CardTitle>
          <CardDescription className="text-[9px] font-semibold">
            {loading ? "Resumiendo lecturas…" : summary}
          </CardDescription>
        </div>
        <div className="flex w-full shrink-0 items-center gap-2 sm:w-auto">
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Actualizar análisis anual" onClick={refresh}><RotateCw className="h-4 w-4" /></Button>
          <label className="relative min-w-0 flex-1 sm:flex-none">
            <span className="sr-only">Métrica del mapa anual</span>
            <select
              value={metric}
              onChange={(event) => { setActiveDay(null); setMetric(event.target.value as Metric); }}
              className="h-9 w-full cursor-pointer appearance-none rounded-md border border-input bg-background py-2 pl-2.5 pr-10 text-xs font-medium shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-40"
            >
              <option value="average">Promedio de glucosa</option>
              <option value="timeInRange">Tiempo en rango</option>
            </select>
            <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          </label>
          <div className="flex shrink-0 items-center gap-1 rounded-lg bg-muted/60 p-0.5" aria-label="Año del resumen">
            <Button type="button" variant="ghost" size="icon-sm" className="h-8 w-8" onClick={() => changeYear(year - 1)} disabled={year <= 2000} aria-label="Año anterior">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-10 text-center font-numbers text-sm font-bold" aria-live="polite">{year}</span>
            <Button type="button" variant="ghost" size="icon-sm" className="h-8 w-8" onClick={() => changeYear(year + 1)} disabled={year >= currentYear} aria-label="Año siguiente">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-3 sm:p-4">
        {error && !loading ? (
          <div role="alert" className="flex min-h-44 flex-col items-center justify-center gap-3 text-center">
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button type="button" variant="outline" size="sm" onClick={() => { refresh(); }}>
              <RotateCw className="mr-2 h-3.5 w-3.5" /> Reintentar
            </Button>
          </div>
        ) : loading ? (
          <div className="flex min-h-44 items-center justify-center gap-2 text-sm text-muted-foreground" role="status">
            <LoadingSpinner className="text-primary" /> Cargando resumen anual
          </div>
        ) : days.length === 0 ? (
          <div className="flex min-h-44 items-center justify-center px-4 text-center text-sm text-muted-foreground">
            No hay lecturas guardadas para {year}. Los días sin datos quedan vacíos en el calendario.
          </div>
        ) : (
          <>
            <div className="mobile-scroll-hint w-full overflow-x-auto pb-2" aria-label={`Calendario de glucosa de ${year}`} onScroll={dismissDayLabel}>
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
                        onClick={() => { dismissDayLabel(); onSelectDate(date); }}
                        onMouseEnter={() => showDayLabel(date, day)}
                        onMouseLeave={dismissDayLabel}
                        onFocus={() => showDayLabel(date, day)}
                        onBlur={dismissDayLabel}
                        onKeyDown={(event) => { if (event.key === "Escape") dismissDayLabel(); }}
                        title=""
                        aria-label={`${formatDay(date)}: ${getCellDescription(day)}. Abrir en Monitor.`}
                        aria-describedby={activeDay?.date === date ? "year-overview-day-label" : undefined}
                        className={`h-[15px] w-[15px] rounded-[3px] ${metric === "timeInRange" ? "saturate-[0.9]" : "saturate-[0.72]"} outline-none ring-offset-1 transition-[filter] duration-150 hover:shadow-[inset_0_0_0_1px_white] hover:saturate-[1.08] focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-ring ${
                          getCellClass(day)
                        }`}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <div className="flex h-7 items-center justify-center gap-2 overflow-hidden text-[10px] leading-none text-muted-foreground" id="year-overview-day-label">
              {activeDay && (
                <>
                  <span className="truncate capitalize">{formatDay(activeDay.date)}</span>
                  <span aria-hidden="true">·</span>
                  <span className="shrink-0 font-numbers font-semibold text-foreground">
                    {!activeDay.day ? "Sin datos" : metric === "average"
                      ? `${Math.round(activeDay.day.average)} mg/dL`
                      : activeDay.day.timeInRangePercent == null
                        ? "Sin cobertura de TIR"
                        : `${Math.round(activeDay.day.timeInRangePercent)}% TIR`}
                  </span>
                </>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t pt-3 text-[10px] text-muted-foreground">
              <p>Seleccioná un día para abrirlo en Monitor.</p>
              {metric === "average" ? (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1" aria-label="Escala de glucemia por rangos">
                  {averageBands.map((band) => (
                    <span key={band.min} className="inline-flex items-center gap-1.5">
                      <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-[2px] saturate-[0.72] ${band.color}`} />
                      {band.label}
                    </span>
                  ))}
                  <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="h-2.5 w-2.5 rounded-[2px] border border-border bg-muted/60" /> Sin datos</span>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1" aria-label="Escala de tiempo en rango">
                  <span>{targets.low}–{targets.high} mg/dL</span>
                  {TIR_BANDS.map((band) => (
                    <span key={band.min} className="inline-flex items-center gap-1.5">
                      <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-[2px] saturate-[0.9] ${band.color}`} />
                      {band.label}
                    </span>
                  ))}
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
