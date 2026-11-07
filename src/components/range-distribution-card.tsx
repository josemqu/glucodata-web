import { Card, CardContent } from "@/components/ui/card";

type RangeValues = {
  veryHigh: number;
  high: number;
  inRange: number;
  low: number;
  veryLow: number;
};

const RANGES = [
  { key: "veryHigh", label: "Muy Alta", color: "bg-red-500", text: "text-red-500" },
  { key: "high", label: "Alta", color: "bg-amber-500", text: "text-amber-500" },
  { key: "inRange", label: "Objetivo", color: "bg-emerald-500", text: "text-emerald-500" },
  { key: "low", label: "Baja", color: "bg-amber-500", text: "text-amber-500" },
  { key: "veryLow", label: "Muy Baja", color: "bg-red-500", text: "text-red-500" },
] as const;

export function RangeDistributionCard({ values, loading = false }: { values: RangeValues; loading?: boolean }) {
  return (
    <Card className="border bg-card/30" aria-busy={loading}>
      <CardContent className="p-3.5 space-y-2">
        <p className="text-[8px] font-bold text-muted-foreground uppercase tracking-[0.2em]">Tiempo en rangos</p>
        <div className="space-y-1.5">
          {RANGES.map((range) => (
            <div key={range.key} className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[8px] font-bold text-muted-foreground uppercase tracking-[0.2em]">{range.label}</span>
                {loading ? <span className="h-3 w-8 animate-pulse rounded bg-muted/40" /> : (
                  <span className={`text-[10px] font-black tabular-nums font-numbers ${range.text}`}>{values[range.key]}%</span>
                )}
              </div>
              <div className="w-full bg-muted h-1 rounded-full overflow-hidden">
                <div className={`${range.color} h-full ${loading ? "animate-pulse" : ""}`} style={{ width: `${loading ? 100 : values[range.key]}%` }} />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
