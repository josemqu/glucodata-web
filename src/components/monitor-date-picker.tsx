"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";

const weekdays = ["L", "M", "M", "J", "V", "S", "D"];

function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateFromKey(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

function monthStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1, 12);
}

function sameMonth(first: Date, second: Date) {
  return first.getFullYear() === second.getFullYear() && first.getMonth() === second.getMonth();
}

interface MonitorDatePickerProps {
  value: string;
  onChange: (value: string) => void;
  loading?: boolean;
}

export function MonitorDatePicker({ value, onChange, loading = false }: MonitorDatePickerProps) {
  const today = dateKey(new Date());
  const selectedDate = dateFromKey(value);
  const [open, setOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(() => monthStart(selectedDate));
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const days = useMemo(() => {
    const mondayOffset = (visibleMonth.getDay() + 6) % 7;
    const gridStart = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1 - mondayOffset, 12);
    return Array.from({ length: 42 }, (_, index) => {
      const day = new Date(gridStart);
      day.setDate(gridStart.getDate() + index);
      return day;
    });
  }, [visibleMonth]);

  const triggerLabel = value === today
    ? "Hoy"
    : selectedDate.toLocaleDateString("es-AR", { day: "2-digit", month: "short" }).replace(".", "");
  const selectedLabel = selectedDate.toLocaleDateString("es-AR", { dateStyle: "long" });
  const monthLabel = visibleMonth.toLocaleDateString("es-AR", { month: "long", year: "numeric" });
  const nextMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 1, 12);
  const nextMonthDisabled = nextMonth > monthStart(new Date());

  const selectDate = (day: Date) => {
    const nextValue = dateKey(day);
    if (nextValue > today) return;
    setOpen(false);
    if (nextValue !== value) onChange(nextValue);
  };

  return (
    <div ref={rootRef} className="relative">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="min-w-[5.75rem] justify-start gap-1.5 rounded-lg bg-background px-2.5 text-xs font-semibold shadow-none"
        aria-label={`Fecha del gráfico: ${selectedLabel}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          if (!open) setVisibleMonth(monthStart(selectedDate));
          setOpen((current) => !current);
        }}
        disabled={loading}
      >
        <CalendarDays className="h-4 w-4 text-primary" />
        <span className="truncate capitalize">{loading ? "Cargando" : triggerLabel}</span>
      </Button>

      {open ? (
        <div
          role="dialog"
          aria-modal="false"
          aria-label="Elegir fecha del gráfico"
          className="absolute left-0 top-[calc(100%+0.5rem)] z-50 w-[19rem] max-w-[calc(100vw-1.5rem)] rounded-xl border bg-popover p-3 text-popover-foreground shadow-[0_12px_32px_rgba(0,0,0,0.18)]"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="pl-1 text-sm font-bold capitalize">{monthLabel}</p>
            <div className="flex items-center gap-0.5">
              <Button type="button" variant="ghost" size="icon-sm" className="rounded-lg" onClick={() => setVisibleMonth(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() - 1, 1, 12))} aria-label="Mes anterior">
                <ChevronLeft />
              </Button>
              <Button type="button" variant="ghost" size="icon-sm" className="rounded-lg" onClick={() => setVisibleMonth(nextMonth)} disabled={nextMonthDisabled} aria-label="Mes siguiente">
                <ChevronRight />
              </Button>
            </div>
          </div>

          <div className="mt-2 grid grid-cols-7" aria-hidden="true">
            {weekdays.map((weekday, index) => (
              <span key={`${weekday}-${index}`} className="flex h-8 items-center justify-center text-[10px] font-bold text-muted-foreground">{weekday}</span>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-y-0.5">
            {days.map((day) => {
              const key = dateKey(day);
              const selected = key === value;
              const currentDay = key === today;
              const outsideMonth = !sameMonth(day, visibleMonth);
              const disabled = key > today;
              return (
                <button
                  key={key}
                  type="button"
                  className={`mx-auto flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    selected
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : disabled
                        ? "cursor-not-allowed text-muted-foreground/30"
                        : outsideMonth
                          ? "text-muted-foreground/45 hover:bg-muted"
                          : "text-foreground hover:bg-muted"
                  } ${currentDay && !selected ? "ring-1 ring-primary/60" : ""}`}
                  disabled={disabled}
                  aria-label={day.toLocaleDateString("es-AR", { dateStyle: "full" })}
                  aria-pressed={selected}
                  onClick={() => selectDate(day)}
                >
                  {day.getDate()}
                </button>
              );
            })}
          </div>

          <div className="mt-2 flex items-center justify-between border-t pt-2">
            <span className="pl-1 text-[10px] font-medium text-muted-foreground">Sin fechas futuras</span>
            <Button type="button" variant="ghost" size="sm" className="text-primary" onClick={() => selectDate(new Date())}>Hoy</Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
