"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, LoaderCircle, RotateCw } from "lucide-react";
import { getYearOverviewAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type YearOverviewDay = { date: string; average: number; count: number };
type Targets = { low: number; high: number; hypo: number; hyper: number };

const CELL_SIZE = 13;
const CELL_GAP = 3;
const WEEKDAY_LABELS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

function dateString(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function glucoseBand(value: number, targets: Targets) {
  if (value <= targets.hypo || value >= targets.hyper) return "very-out";
  if (value < targets.low || value > targets.high) return "out";
  return "in";
}

function bandClass(value: number, targets: Targets) {
  const band = glucoseBand(value, targets);
  if (band === "very-out") return "bg-rose-700 dark:bg-rose-500";
  if (band === "out") return value < targets.low ? "bg-amber-400 dark:bg-amber-500" : "bg-orange-500 dark:bg-orange-400";
  return "bg-emerald-500 dark:bg-emerald-400";
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const currentYear = new Date().getFullYear();

  const changeYear = (nextYear: number) => {
    setLoading(true);
    setError(null);
    setYear(nextYear);
  };

  useEffect(() => {
    let active = true;
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    void getYearOverviewAction(year, timeZone).then((result) => {
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
      if (active) setLoading(false);
    });

    return () => { active = false; };
  }, [year, reloadKey]);

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

  return (
    <Card className="min-h-0 overflow-hidden border bg-card/40 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between gap-3 border-b bg-muted/20 px-4 py-3">
        <div className="min-w-0">
          <CardTitle className="text-sm font-bold">Año en glucosa</CardTitle>
          <CardDescription className="mt-1 text-xs">
            {loading ? "Resumiendo lecturas…" : `${daysWithData} días con datos · promedio ${days.length ? `${Math.round(mean)} mg/dL` : "—"}`}
          </CardDescription>
        </div>
        <div className="flex shrink-0 items-center gap-1 rounded-lg bg-muted/60 p-0.5" aria-label="Año del resumen">
          <Button type="button" variant="ghost" size="icon-sm" className="h-8 w-8" onClick={() => changeYear(year - 1)} disabled={loading} aria-label="Año anterior">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-10 text-center font-numbers text-sm font-bold" aria-live="polite">{year}</span>
          <Button type="button" variant="ghost" size="icon-sm" className="h-8 w-8" onClick={() => changeYear(year + 1)} disabled={loading || year >= currentYear} aria-label="Año siguiente">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-3 sm:p-4">
        {error ? (
          <div className="flex min-h-44 flex-col items-center justify-center gap-3 text-center">
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button type="button" variant="outline" size="sm" onClick={() => { setLoading(true); setError(null); setReloadKey((value) => value + 1); }}>
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
            <div className="mobile-scroll-hint overflow-x-auto pb-3" aria-label={`Calendario de glucosa de ${year}`}>
              <div className="min-w-max">
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
                  <div className="grid grid-rows-7 gap-[3px] pt-0.5 text-[9px] leading-[13px] text-muted-foreground" aria-hidden="true">
                    {WEEKDAY_LABELS.map((label, index) => (
                      <span key={label} className={index % 2 === 0 ? "w-8" : "invisible w-8"}>{label}</span>
                    ))}
                  </div>
                  <div
                    className="grid grid-flow-col grid-rows-7 gap-[3px]"
                    style={{ gridTemplateColumns: `repeat(${calendar.weekCount}, ${CELL_SIZE}px)` }}
                  >
                    {calendar.cells.map(({ date, day }) => date.startsWith("blank-") ? (
                      <span key={date} aria-hidden="true" className="h-[13px] w-[13px]" />
                    ) : (
                      <button
                        key={date}
                        type="button"
                        onClick={() => onSelectDate(date)}
                        aria-label={day
                          ? `${formatDay(date)}: promedio ${Math.round(day.average)} mg/dL, ${day.count} lecturas. Abrir en Monitor.`
                          : `${formatDay(date)}: sin datos. Abrir en Monitor.`}
                        title={day
                          ? `${formatDay(date)} · ${Math.round(day.average)} mg/dL · ${day.count} lecturas`
                          : `${formatDay(date)} · Sin datos`}
                        className={`h-[13px] w-[13px] rounded-[3px] saturate-[0.55] outline-none ring-offset-1 transition-[filter,transform] duration-150 hover:z-10 hover:scale-125 hover:saturate-[1.08] focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-ring ${
                          day ? bandClass(day.average, targets) : "border border-border/60 bg-muted/60"
                        }`}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t pt-3 text-[10px] text-muted-foreground">
              <p>Seleccioná un día para abrirlo en Monitor.</p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1" aria-label="Leyenda del promedio diario">
                <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="h-2.5 w-2.5 rounded-[2px] saturate-[0.55] bg-rose-700 dark:bg-rose-500" /> ≤{targets.hypo} o ≥{targets.hyper}</span>
                <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="h-2.5 w-2.5 rounded-[2px] saturate-[0.55] bg-amber-400 dark:bg-amber-500" /> Bajo</span>
                <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="h-2.5 w-2.5 rounded-[2px] saturate-[0.55] bg-emerald-500 dark:bg-emerald-400" /> En rango</span>
                <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="h-2.5 w-2.5 rounded-[2px] saturate-[0.55] bg-orange-500 dark:bg-orange-400" /> Alto</span>
                <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="h-2.5 w-2.5 rounded-[2px] border border-border bg-muted/60" /> Sin datos</span>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
