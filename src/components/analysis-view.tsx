"use client";

import { useMemo, useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  CHART_SERIES_ANIMATION_DURATION_MS,
  CHART_SERIES_ANIMATION_EASING,
} from "@/lib/chart-motion";
import {
  CHART_TOOLTIP_OFFSET,
  CHART_TOOLTIP_WRAPPER_STYLE,
} from "@/lib/chart-tooltip";
import { 
  calculatePercentiles, 
  calculateGMI, 
  calculateCV, 
  getTIRStatus, 
  getCVStatus,
  calculateStats,
  type GlucoseStats,
  type PercentilePoint
} from "@/lib/metrics";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { 
  Info, 
  TrendingUp, 
  Activity, 
  Target, 
  Clock, 
  Calendar,
  ChevronRight,
  ChevronLeft,
  RefreshCw
} from "lucide-react";

interface AnalysisViewProps {
  history: { value: number; time: number }[];
  targetConfig: { low: number; high: number; hypo: number; hyper: number };
  days: number;
  preCalculatedStats?: GlucoseStats | null;
  preCalculatedPercentiles?: PercentilePoint[];
  loading?: boolean;
}

export function AnalysisView({ 
  history, 
  targetConfig, 
  days,
  preCalculatedStats,
  preCalculatedPercentiles,
  loading = false
}: AnalysisViewProps) {
  const [selectedDays, setSelectedDays] = useState(days);
  const reduceMotion = useReducedMotion();

  const stats = useMemo(() => {
    if (preCalculatedStats) return preCalculatedStats;
    return calculateStats(history, targetConfig);
  }, [history, targetConfig, preCalculatedStats]);

  const percentileData = useMemo(() => {
    if (preCalculatedPercentiles) return preCalculatedPercentiles;
    return calculatePercentiles(history);
  }, [history, preCalculatedPercentiles]);

  const { p50Min, p50Max } = useMemo(() => {
    if (!percentileData.length) return { p50Min: 0, p50Max: 300 };
    const p50s = percentileData.map(d => d.p50).filter(v => v !== null && v !== undefined) as number[];
    if (!p50s.length) return { p50Min: 0, p50Max: 300 };
    return {
      p50Min: Math.min(...p50s),
      p50Max: Math.max(...p50s)
    };
  }, [percentileData]);

  const getGlucoseColor = (val: number) => {
    if (val === undefined || val === null) return "#94a3b8";
    if (val <= targetConfig.hypo) return "#dc2626";
    if (val < targetConfig.low) return "#f59e0b";
    if (val >= targetConfig.hyper) return "#dc2626";
    if (val > targetConfig.high) return "#f59e0b";
    return "#10b981";
  };

  const breakPointPercentage = (value: number) => {
    if (p50Max === p50Min) return "0%";
    const percentage = ((value - p50Min) / (p50Max - p50Min)) * 100;
    return `${Math.max(0, Math.min(100, percentage))}%`;
  };

  if (history.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center space-y-4">
        <Activity className="w-12 h-12 text-muted-foreground animate-pulse" />
        <h3 className="text-lg font-bold">No hay suficientes datos</h3>
        <p className="text-sm text-muted-foreground max-w-xs">
          Sigue usando la app para acumular historial de glucosa y ver el análisis detallado.
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {/* Long-period metrics */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <MetricCard
          title="TIR"
          value={`${stats?.tir}%`}
          description="Tiempo en rango"
          status={getTIRStatus(stats?.tir || 0)}
          icon={<Target className="h-3.5 w-3.5" />}
          target="> 70%"
          loading={loading}
        />
        <MetricCard
          title="GMI"
          value={`${stats?.gmi}%`}
          description="Hemoglobina estimada"
          status="info"
          icon={<Activity className="h-3.5 w-3.5" />}
          target="< 7.0%"
          loading={loading}
        />
        <MetricCard
          title="CV"
          value={`${stats?.cv}%`}
          description="Variabilidad"
          status={getCVStatus(stats?.cv || 0)}
          icon={<TrendingUp className="h-3.5 w-3.5" />}
          target="< 36%"
          loading={loading}
        />
        <MetricCard
          title="Promedio"
          value={stats?.mean || 0}
          unit="mg/dL"
          description="Glucosa media"
          status="info"
          icon={<Clock className="h-3.5 w-3.5" />}
          loading={loading}
        />
      </div>

      {/* AGP Chart — primary analytical surface */}
      <Card className="flex min-h-[360px] flex-[2_1_480px] overflow-hidden border bg-card/20 shadow-sm sm:min-h-[440px]">
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between py-2 px-4 border-b bg-muted/20">
          <div className="flex flex-col w-full sm:w-auto">
            <CardTitle className="min-w-0 truncate text-[11px] font-bold uppercase tracking-[0.2em] opacity-80 flex items-center gap-2">
              Perfil glucémico (AGP)
              <span className="hidden sm:inline-flex text-[11px] px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
                {days} DÍAS
              </span>
              {loading && <RefreshCw className="w-3 h-3 text-primary animate-spin" />}
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="relative flex min-h-0 flex-1 flex-col p-0">
          <div className="glucose-chart-stage relative min-h-[250px] w-full flex-1 overflow-hidden">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={percentileData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorMedian" x1="0" y1="1" x2="0" y2="0">
                    <stop offset="0%" stopColor={getGlucoseColor(p50Min)} />

                    {targetConfig.hypo > p50Min && targetConfig.hypo < p50Max && (
                      <>
                        <stop offset={breakPointPercentage(targetConfig.hypo)} stopColor={getGlucoseColor(targetConfig.hypo - 1)} />
                        <stop offset={breakPointPercentage(targetConfig.hypo)} stopColor={getGlucoseColor(targetConfig.hypo + 1)} />
                      </>
                    )}

                    {targetConfig.low > p50Min && targetConfig.low < p50Max && (
                      <>
                        <stop offset={breakPointPercentage(targetConfig.low)} stopColor={getGlucoseColor(targetConfig.low - 1)} />
                        <stop offset={breakPointPercentage(targetConfig.low)} stopColor={getGlucoseColor(targetConfig.low + 1)} />
                      </>
                    )}

                    {targetConfig.high > p50Min && targetConfig.high < p50Max && (
                      <>
                        <stop offset={breakPointPercentage(targetConfig.high)} stopColor={getGlucoseColor(targetConfig.high - 1)} />
                        <stop offset={breakPointPercentage(targetConfig.high)} stopColor={getGlucoseColor(targetConfig.high + 1)} />
                      </>
                    )}

                    {targetConfig.hyper > p50Min && targetConfig.hyper < p50Max && (
                      <>
                        <stop offset={breakPointPercentage(targetConfig.hyper)} stopColor={getGlucoseColor(targetConfig.hyper - 1)} />
                        <stop offset={breakPointPercentage(targetConfig.hyper)} stopColor={getGlucoseColor(targetConfig.hyper + 1)} />
                      </>
                    )}

                    <stop offset="100%" stopColor={getGlucoseColor(p50Max)} />
                  </linearGradient>
                  <linearGradient id="colorP25P75" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.1}/>
                  </linearGradient>
                  <linearGradient id="colorP5P95" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#94a3b8" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#94a3b8" stopOpacity={0.05}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                <XAxis 
                  dataKey="time" 
                  hide
                />
                <YAxis 
                  domain={[0, 300]}
                  hide
                />
                <Tooltip 
                  offset={CHART_TOOLTIP_OFFSET}
                  allowEscapeViewBox={{ x: false, y: true }}
                  wrapperStyle={CHART_TOOLTIP_WRAPPER_STYLE}
                  content={<CustomTooltip />} 
                  cursor={{ stroke: 'rgba(255,255,255,0.1)', strokeWidth: 1 }}
                />
                
                {/* Outermost range (5th-95th percentile) */}
                <Area
                  type="monotone"
                  dataKey="rangeP5P95"
                  stroke="none"
                  fill="url(#colorP5P95)"
                  connectNulls
                  animationDuration={CHART_SERIES_ANIMATION_DURATION_MS}
                  animationEasing={CHART_SERIES_ANIMATION_EASING}
                  isAnimationActive={!reduceMotion}
                />

                {/* Target range (25th-75th percentile) */}
                <Area
                  type="monotone"
                  dataKey="rangeP25P75"
                  stroke="none"
                  fill="url(#colorP25P75)"
                  connectNulls
                  animationDuration={CHART_SERIES_ANIMATION_DURATION_MS}
                  animationEasing={CHART_SERIES_ANIMATION_EASING}
                  isAnimationActive={!reduceMotion}
                />

                {/* Median line */}
                <Line
                  type="monotone"
                  dataKey="p50"
                  stroke="url(#colorMedian)"
                  strokeWidth={3}
                  dot={false}
                  activeDot={{ r: 6, strokeWidth: 0 }}
                  connectNulls
                  animationDuration={CHART_SERIES_ANIMATION_DURATION_MS}
                  animationEasing={CHART_SERIES_ANIMATION_EASING}
                  isAnimationActive={!reduceMotion}
                />

                {/* Reference Lines for Target Range */}
                <ReferenceLine 
                  y={targetConfig.hyper} 
                  stroke="#dc2626" 
                  strokeDasharray="6 3" 
                  strokeOpacity={0.6} 
                  label={{
                    value: "HIPER",
                    position: "insideTopRight",
                    fill: "#dc2626",
                    fontSize: 9,
                    fontWeight: "900",
                    dy: -16,
                  }}
                />
                <ReferenceLine 
                  y={targetConfig.high} 
                  stroke="#f59e0b" 
                  strokeDasharray="6 3" 
                  strokeOpacity={0.6} 
                  label={{
                    value: "ALTA",
                    position: "insideTopRight",
                    fill: "#f59e0b",
                    fontSize: 9,
                    fontWeight: "900",
                    dy: -16,
                  }}
                />
                <ReferenceLine 
                  y={targetConfig.low} 
                  stroke="#f59e0b" 
                  strokeDasharray="6 3" 
                  strokeOpacity={0.6} 
                  label={{
                    value: "BAJA",
                    position: "insideTopRight",
                    fill: "#f59e0b",
                    fontSize: 9,
                    fontWeight: "900",
                    dy: -16,
                  }}
                />
                {targetConfig.hypo > 40 && (
                  <ReferenceLine 
                    y={targetConfig.hypo} 
                    stroke="#dc2626" 
                    strokeDasharray="3 2" 
                    strokeOpacity={0.6} 
                    label={{
                      value: "HIPO",
                      position: "insideBottomRight",
                      fill: "#dc2626",
                      fontSize: 9,
                      fontWeight: "900",
                      dy: 16,
                    }}
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-x-2 bottom-2 flex items-center justify-between text-[10px] font-bold text-foreground/70">
              <span className="rounded-md bg-card/80 px-1.5 py-0.5 backdrop-blur-sm">00 h</span>
              <span className="rounded-md bg-card/80 px-1.5 py-0.5 backdrop-blur-sm">12 h</span>
              <span className="rounded-md bg-card/80 px-1.5 py-0.5 backdrop-blur-sm">24 h</span>
            </div>
            <div className="pointer-events-none absolute left-2 top-2 rounded-md bg-card/80 px-1.5 py-0.5 text-[9px] font-bold text-muted-foreground backdrop-blur-sm">
              mg/dL · 0–300
            </div>
            <div className="pointer-events-none absolute right-2 top-2 flex flex-col items-end gap-1 rounded-md bg-card/80 px-2 py-1 text-[9px] font-semibold text-muted-foreground backdrop-blur-sm sm:flex-row sm:gap-3">
              <LegendItem color="#10b981" label="Mediana" />
              <LegendItem color="rgba(16, 185, 129, 0.3)" label="25–75%" />
              <LegendItem color="rgba(148, 163, 184, 0.2)" label="5–95%" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Secondary analysis */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <Card className="border bg-card/30 flex flex-col">
            <CardHeader className="p-4 pb-0">
              <CardTitle className="text-[11px] font-bold uppercase tracking-[0.2em] opacity-80">Distribución por Rangos</CardTitle>
            </CardHeader>
            <CardContent className="p-4 flex-1">
              <div className="space-y-3">
                <RangeBar label="Muy Alta (>250)" value={stats?.veryHigh || 0} color="bg-red-600" loading={loading} />
                <RangeBar label="Alta (181-250)" value={stats?.high || 0} color="bg-amber-500" loading={loading} />
                <RangeBar label="En Rango (70-180)" value={stats?.tir || 0} color="bg-emerald-500" loading={loading} />
                <RangeBar label="Baja (54-69)" value={stats?.low || 0} color="bg-amber-500" loading={loading} />
                <RangeBar label="Muy Baja (<54)" value={stats?.veryLow || 0} color="bg-red-600" loading={loading} />
              </div>
            </CardContent>
          </Card>

          <Card className="border bg-card/30 flex flex-col">
            <CardHeader className="p-4 pb-0">
              <CardTitle className="text-[11px] font-bold uppercase tracking-[0.2em] opacity-80 italic">Análisis T1D</CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-4 flex flex-col flex-1">
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                El análisis de los últimos <span className="text-foreground font-bold">{days} días</span> muestra un control 
                { (stats?.tir || 0) > 70 ? ' óptimo' : ' que requiere atención' }. 
                El GMI de <span className="text-foreground font-bold">{stats?.gmi}%</span> sugiere una hemoglobina glicosilada similar.
              </p>
              <div className="p-3 rounded-xl bg-primary/5 border border-primary/10 space-y-2 mt-auto">
                <div className="flex items-center gap-2">
                  <Info className="w-3 h-3 text-primary" />
                  <span className="text-[11px] font-bold uppercase tracking-tighter">Tip del Día</span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  { (stats?.cv || 0) > 36 
                    ? "La variabilidad es alta (>36%). Identifica patrones para estabilizar las curvas."
                    : "Tu variabilidad está en objetivo (<36%). ¡Excelente trabajo manteniendo la estabilidad!"
                  }
                </p>
              </div>
            </CardContent>
          </Card>
      </div>
    </div>
  );
}

function MetricCard({ title, value, unit, description, status, icon, target, loading }: any) {
  const colors = {
    success: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20",
    warning: "text-amber-500 bg-amber-500/10 border-amber-500/20",
    error: "text-red-500 bg-red-500/10 border-red-500/20",
    info: "text-primary bg-primary/10 border-primary/20",
  };

  return (
    <div className="flex h-[104px] min-w-0 flex-col rounded-xl border border-border/60 bg-card/45 p-3 shadow-sm sm:px-4">
        <div className="mb-1.5 flex min-h-6 items-center justify-between gap-2">
          <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${colors[status as keyof typeof colors]}`}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
          </div>
          {target && (
            <span className="truncate text-[10px] font-bold text-muted-foreground">
              Meta {target}
            </span>
          )}
        </div>
        <div className="flex h-6 items-center gap-1 leading-none">
          {loading ? (
            <div className="h-5 w-16 animate-pulse rounded bg-muted/40" />
          ) : (
            <span className="text-xl font-black tracking-tight">{value}</span>
          )}
          {unit && (
            <span className={`text-[10px] font-bold text-muted-foreground ${loading ? "invisible" : ""}`}>
              {unit}
            </span>
          )}
        </div>
        <p className="mt-1 min-h-4 truncate text-[10px] font-medium text-muted-foreground">
          {title} · {description}
        </p>
    </div>
  );
}

function RangeBar({ label, value, color, loading }: any) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[11px] font-bold uppercase tracking-tighter">
        <span>{label}</span>
        {loading ? (
          <div className="h-3 w-8 rounded bg-muted/40 animate-pulse" />
        ) : (
          <span>{value}%</span>
        )}
      </div>
      <div className="h-2 w-full bg-muted/30 rounded-full overflow-hidden">
        {loading ? (
          <div className="h-full w-full bg-muted/20 animate-pulse" />
        ) : (
          <motion.div 
            initial={{ width: 0 }}
            animate={{ width: `${value}%` }}
            className={`h-full ${color}`} 
          />
        )}
      </div>
    </div>
  );
}

function LegendItem({ color, label }: any) {
  return (
    <div className="flex items-center gap-1.5 whitespace-nowrap">
      <div className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
      <span>{label}</span>
    </div>
  );
}

function CustomTooltip({ active, payload }: any) {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="rounded-xl border border-border/60 bg-popover/80 p-2.5 shadow-lg backdrop-blur-md">
        <p className="text-[11px] font-black tracking-widest uppercase mb-2 border-b border-border pb-1">
          {data.time}
        </p>
        <div className="space-y-1">
          <TooltipRow label="Percentil 95" value={data.p95} color="text-muted-foreground" />
          <TooltipRow label="Percentil 75" value={data.p75} color="text-emerald-500/80" />
          <TooltipRow label="Mediana (50)" value={data.p50} color="text-emerald-500 font-black" />
          <TooltipRow label="Percentil 25" value={data.p25} color="text-emerald-500/80" />
          <TooltipRow label="Percentil 5" value={data.p5} color="text-muted-foreground" />
        </div>
      </div>
    );
  }
  return null;
}

function TooltipRow({ label, value, color }: any) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-[11px] text-muted-foreground font-bold uppercase tracking-tighter">{label}</span>
      <span className={`text-xs ${color}`}>{value} mg/dL</span>
    </div>
  );
}
