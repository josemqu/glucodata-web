"use client";

import { useMemo, useState, useEffect } from "react";
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
  calculatePercentiles, 
  calculateGMI, 
  calculateCV, 
  getTIRStatus, 
  getCVStatus 
} from "@/lib/metrics";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Info, 
  TrendingUp, 
  Activity, 
  Target, 
  Clock, 
  Calendar,
  ChevronRight,
  ChevronLeft
} from "lucide-react";

interface AnalysisViewProps {
  history: { value: number; time: number }[];
  targetConfig: { low: number; high: number; hypo: number; hyper: number };
  days: number;
}

export function AnalysisView({ history, targetConfig, days }: AnalysisViewProps) {
  const [selectedDays, setSelectedDays] = useState(days);

  const stats = useMemo(() => {
    if (history.length === 0) return null;

    const sorted = [...history].sort((a, b) => a.time - b.time);
    
    let totalDuration = 0;
    const dur = {
      veryLow: 0,
      low: 0,
      inRange: 0,
      high: 0,
      veryHigh: 0,
    };

    const MAX_VALIDITY = 15 * 60 * 1000; // Max 15 mins between points
    const DEFAULT_DURATION = 5 * 60 * 1000; // Default 5 mins for last point

    for (let i = 0; i < sorted.length; i++) {
      const p = sorted[i];
      const next = sorted[i + 1];
      
      let duration = 0;
      if (next) {
        duration = next.time - p.time;
      } else {
        duration = DEFAULT_DURATION;
      }

      // Cap gaps to avoid skewing data with offline periods
      if (duration > MAX_VALIDITY) duration = MAX_VALIDITY;
      if (duration < 0) duration = 0;

      totalDuration += duration;
      const val = p.value;

      if (val <= targetConfig.hypo) dur.veryLow += duration;
      else if (val < targetConfig.low) dur.low += duration;
      else if (val >= targetConfig.hyper) dur.veryHigh += duration;
      else if (val > targetConfig.high) dur.high += duration;
      else dur.inRange += duration;
    }

    const toPct = (ms: number) => totalDuration > 0 ? Math.round((ms / totalDuration) * 100) : 0;

    let pVeryLow = toPct(dur.veryLow);
    let pLow = toPct(dur.low);
    let pInRange = toPct(dur.inRange);
    let pHigh = toPct(dur.high);
    let pVeryHigh = toPct(dur.veryHigh);

    if (totalDuration > 0) {
      const sumPct = pVeryLow + pLow + pInRange + pHigh + pVeryHigh;
      if (sumPct !== 100) {
        const diff = 100 - sumPct;
        const valuesArr = [
          { key: 'pVeryLow', val: pVeryLow },
          { key: 'pLow', val: pLow },
          { key: 'pInRange', val: pInRange },
          { key: 'pHigh', val: pHigh },
          { key: 'pVeryHigh', val: pVeryHigh }
        ].sort((a, b) => b.val - a.val);

        if (valuesArr[0].key === 'pVeryLow') pVeryLow += diff;
        else if (valuesArr[0].key === 'pLow') pLow += diff;
        else if (valuesArr[0].key === 'pInRange') pInRange += diff;
        else if (valuesArr[0].key === 'pHigh') pHigh += diff;
        else if (valuesArr[0].key === 'pVeryHigh') pVeryHigh += diff;
      }
    }

    const values = history.map(h => h.value);
    const sum = values.reduce((a, b) => a + b, 0);
    const mean = sum / values.length;
    
    const stdDev = Math.sqrt(
      values.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / values.length
    );

    const gmi = calculateGMI(mean);
    const cv = calculateCV(mean, stdDev);

    return {
      mean: Math.round(mean),
      tir: pInRange,
      tbr: pLow + pVeryLow,
      tar: pHigh + pVeryHigh,
      veryLow: pVeryLow,
      low: pLow,
      high: pHigh,
      veryHigh: pVeryHigh,
      gmi: gmi.toFixed(1),
      cv: Math.round(cv),
      count: history.length
    };
  }, [history, targetConfig]);

  const percentileData = useMemo(() => {
    return calculatePercentiles(history);
  }, [history]);

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
    <div className="space-y-6 pb-12">
      {/* Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard
          title="TIR"
          value={`${stats?.tir}%`}
          description="Tiempo en Rango"
          status={getTIRStatus(stats?.tir || 0)}
          icon={<Target className="w-4 h-4" />}
          target="> 70%"
        />
        <MetricCard
          title="GMI"
          value={`${stats?.gmi}%`}
          description="A1c Estimada"
          status="info"
          icon={<Activity className="w-4 h-4" />}
          target="< 7.0%"
        />
        <MetricCard
          title="CV"
          value={`${stats?.cv}%`}
          description="Variabilidad"
          status={getCVStatus(stats?.cv || 0)}
          icon={<TrendingUp className="w-4 h-4" />}
          target="< 36%"
        />
        <MetricCard
          title="Promedio"
          value={stats?.mean || 0}
          unit="mg/dL"
          description="Glucosa Media"
          status="info"
          icon={<Clock className="w-4 h-4" />}
        />
      </div>

      {/* AGP Chart */}
      <Card className="border-border/40 bg-card/50 backdrop-blur-sm overflow-hidden">
        <CardHeader className="pt-6 pb-2">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg font-bold flex items-center gap-2">
                Perfil de Glucosa Ambulatorio (AGP)
                <Badge variant="outline" className="text-[10px] uppercase tracking-widest font-black">
                  {days} DÍAS
                </Badge>
              </CardTitle>
              <CardDescription className="text-xs uppercase tracking-tight">
                Superposición de datos por hora del día
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-4 pb-6">
          <div className="h-[350px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={percentileData}>
                <defs>
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
                  stroke="rgba(255,255,255,0.3)" 
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis 
                  stroke="rgba(255,255,255,0.3)" 
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  domain={[40, 300]}
                />
                <Tooltip 
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
                />

                {/* Target range (25th-75th percentile) */}
                <Area
                  type="monotone"
                  dataKey="rangeP25P75"
                  stroke="none"
                  fill="url(#colorP25P75)"
                  connectNulls
                />

                {/* Median line */}
                <Line
                  type="monotone"
                  dataKey="p50"
                  stroke="#10b981"
                  strokeWidth={3}
                  dot={false}
                  activeDot={{ r: 6, strokeWidth: 0 }}
                  connectNulls
                />

                {/* Reference Lines for Target Range */}
                <ReferenceLine y={targetConfig.high} stroke="#f59e0b" strokeDasharray="3 3" strokeOpacity={0.5} />
                <ReferenceLine y={targetConfig.low} stroke="#f59e0b" strokeDasharray="3 3" strokeOpacity={0.5} />
                <ReferenceLine y={targetConfig.hypo} stroke="#ef4444" strokeDasharray="5 5" strokeOpacity={0.5} />
                <ReferenceLine y={targetConfig.hyper} stroke="#ef4444" strokeDasharray="5 5" strokeOpacity={0.5} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <div className="flex items-center gap-6 mt-6 justify-center">
            <LegendItem color="#10b981" label="Mediana (50%)" />
            <LegendItem color="rgba(16, 185, 129, 0.3)" label="25% - 75%" />
            <LegendItem color="rgba(148, 163, 184, 0.1)" label="5% - 95%" />
          </div>
        </CardContent>
      </Card>

      {/* Range Distribution */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="border-border/40 bg-card/50 backdrop-blur-sm">
          <CardHeader className="pt-6">
            <CardTitle className="text-sm font-bold uppercase tracking-widest">Distribución por Rangos</CardTitle>
          </CardHeader>
          <CardContent className="pb-6">
            <div className="space-y-4">
              <RangeBar label="Muy Alta (>250)" value={stats?.veryHigh || 0} color="bg-red-600" />
              <RangeBar label="Alta (181-250)" value={stats?.high || 0} color="bg-amber-500" />
              <RangeBar label="En Rango (70-180)" value={stats?.tir || 0} color="bg-emerald-500" />
              <RangeBar label="Baja (54-69)" value={stats?.low || 0} color="bg-amber-500" />
              <RangeBar label="Muy Baja (<54)" value={stats?.veryLow || 0} color="bg-red-600" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/40 bg-card/50 backdrop-blur-sm">
          <CardHeader className="pt-6">
            <CardTitle className="text-sm font-bold uppercase tracking-widest italic">Análisis T1D</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pb-6">
            <p className="text-xs text-muted-foreground leading-relaxed">
              El análisis de los últimos <span className="text-foreground font-bold">{days} días</span> muestra un control 
              { (stats?.tir || 0) > 70 ? ' óptimo' : ' que requiere atención' } según el consenso internacional. 
              El GMI de <span className="text-foreground font-bold">{stats?.gmi}%</span> sugiere una hemoglobina glicosilada similar.
            </p>
            <div className="p-3 rounded-xl bg-primary/5 border border-primary/10 space-y-2">
              <div className="flex items-center gap-2">
                <Info className="w-3 h-3 text-primary" />
                <span className="text-[10px] font-bold uppercase tracking-tighter">Tip del Día</span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                { (stats?.cv || 0) > 36 
                  ? "La variabilidad es alta (>36%). Intenta identificar patrones en las comidas o el ejercicio para estabilizar las curvas."
                  : "Tu variabilidad está en el objetivo (<36%). ¡Excelente trabajo manteniendo la estabilidad glucémica!"
                }
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function MetricCard({ title, value, unit, description, status, icon, target }: any) {
  const colors = {
    success: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20",
    warning: "text-amber-500 bg-amber-500/10 border-amber-500/20",
    error: "text-red-500 bg-red-500/10 border-red-500/20",
    info: "text-primary bg-primary/10 border-primary/20",
  };

  return (
    <Card className="border-border/40 bg-card/50 backdrop-blur-sm">
      <CardContent className="p-4 pt-4">
        <div className="flex items-center justify-between mb-2">
          <div className={`p-1.5 rounded-lg ${colors[status as keyof typeof colors]}`}>
            {icon}
          </div>
          {target && (
            <span className="text-[8px] font-black tracking-widest text-muted-foreground/60 uppercase">
              Meta: {target}
            </span>
          )}
        </div>
        <div className="flex items-baseline gap-1">
          <span className="text-2xl font-black tracking-tighter">{value}</span>
          {unit && <span className="text-[10px] font-bold text-muted-foreground uppercase">{unit}</span>}
        </div>
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-1">
          {description}
        </p>
      </CardContent>
    </Card>
  );
}

function RangeBar({ label, value, color }: any) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[10px] font-bold uppercase tracking-tighter">
        <span>{label}</span>
        <span>{value}%</span>
      </div>
      <div className="h-2 w-full bg-muted/30 rounded-full overflow-hidden">
        <motion.div 
          initial={{ width: 0 }}
          animate={{ width: `${value}%` }}
          className={`h-full ${color}`} 
        />
      </div>
    </div>
  );
}

function LegendItem({ color, label }: any) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: color }} />
      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{label}</span>
    </div>
  );
}

function CustomTooltip({ active, payload }: any) {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-background/95 backdrop-blur-md border border-border p-3 rounded-xl shadow-2xl">
        <p className="text-[10px] font-black tracking-widest uppercase mb-2 border-b border-border pb-1">
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
      <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-tighter">{label}</span>
      <span className={`text-xs ${color}`}>{value} mg/dL</span>
    </div>
  );
}
