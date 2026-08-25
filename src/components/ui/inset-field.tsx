import type { ChangeEvent, ReactNode } from "react";
import { Minus, Plus } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export const insetControlClass = "h-12 bg-background px-3 pb-1 pt-5";
export const insetSelectClass = "h-12 w-full rounded-md border border-input bg-background px-3 pb-1 pt-5 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50";
export const insetTextareaClass = "min-h-20 w-full resize-none rounded-md border border-input bg-background px-3 pb-2 pt-6 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50";

export function InsetField({ id, label, optional = false, className, children }: {
  id: string;
  label: string;
  optional?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("relative min-w-0", className)}>
      <Label htmlFor={id} className="pointer-events-none absolute left-3 top-1.5 z-10 text-[10px] font-medium leading-none text-muted-foreground">
        {label}{optional ? " · opcional" : ""}
      </Label>
      {children}
    </div>
  );
}

export function InsetNumberStepper({
  id,
  label,
  value,
  onValueChange,
  step = 1,
  min = 0,
  max,
  unit,
  readOnly = false,
  required = false,
}: {
  id: string;
  label: string;
  value: string | number;
  onValueChange: (value: string) => void;
  step?: number;
  min?: number;
  max?: number;
  unit?: string;
  readOnly?: boolean;
  required?: boolean;
}) {
  const numericValue = Number(value);
  const adjust = (direction: -1 | 1) => {
    const base = Number.isFinite(numericValue) && value !== "" ? numericValue : min;
    const bounded = Math.max(min, Math.min(max ?? Number.POSITIVE_INFINITY, base + direction * step));
    onValueChange(String(Math.round(bounded * 1000) / 1000));
  };

  return (
    <InsetField id={id} label={label}>
      <Input
        id={id}
        className={`${insetControlClass} appearance-none pr-28 font-numbers [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`}
        type="number"
        inputMode="decimal"
        min={min}
        max={max}
        step="any"
        value={value}
        onChange={(event: ChangeEvent<HTMLInputElement>) => onValueChange(event.target.value)}
        readOnly={readOnly}
        required={required}
      />
      {unit ? <span aria-hidden="true" className="pointer-events-none absolute bottom-2 right-[5.5rem] text-xs text-muted-foreground">{unit}</span> : null}
      <button type="button" className="absolute inset-y-0 right-10 flex w-10 items-center justify-center border-l text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:z-20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-35" onClick={() => adjust(-1)} disabled={readOnly || (Number.isFinite(numericValue) && numericValue <= min)} aria-label={`Disminuir ${label.toLowerCase()}`}><Minus className="h-4 w-4" /></button>
      <button type="button" className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-md border-l text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:z-20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-35" onClick={() => adjust(1)} disabled={readOnly || (max != null && Number.isFinite(numericValue) && numericValue >= max)} aria-label={`Aumentar ${label.toLowerCase()}`}><Plus className="h-4 w-4" /></button>
    </InsetField>
  );
}
