"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { motion } from "framer-motion";
import {
  ArrowUp,
  ArrowUpRight,
  ArrowRight,
  ArrowDownRight,
  ArrowDown,
  AlertCircle,
  Clock,
  LogOut,
  RefreshCw,
  Droplets,
  User,
  Settings,
  ArrowLeft,
  ShieldCheck,
  Eye,
  EyeOff,
  ChevronsUp,
  ChevronsDown,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { getLatestGlucoseAction } from "./actions";
import Cookies from "js-cookie";
import { supabase } from "@/lib/supabase";
import {
  ComposedChart,
  Area,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceArea,
} from "recharts";
import { ModeToggle } from "@/components/mode-toggle";
import { calculateTrend, getTrendRotation, TrendState } from "@/lib/trend";

export default function GlucoPage() {
  const [isInitializing, setIsInitializing] = useState(true);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  const [graphPoints, setGraphPoints] = useState<any[]>([]);
  const [windowEndMs, setWindowEndMs] = useState<number>(() => Date.now());
  const [error, setError] = useState<string | null>(null);
  const [credentials, setCredentials] = useState({ email: "", password: "" });
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [lastFetch, setLastFetch] = useState<Date | null>(null);
  const [activeView, setActiveView] = useState<"dashboard" | "settings">(
    "dashboard",
  );

  const [session, setSession] = useState<any>(null);

  // Configuration state
  const [targetConfig, setTargetConfig] = useState({
    low: 70,
    high: 180,
    hypo: 60,
    hyper: 250,
  });

  const [secondsUntilRefresh, setSecondsUntilRefresh] = useState(60);

  const nextRefreshAtRef = useRef<number | null>(null);
  const inFlightRef = useRef(false);
  const credentialsRef = useRef(credentials);
  const sessionRef = useRef(session);
  const graphPointsRef = useRef<any[]>(graphPoints);

  useEffect(() => {
    credentialsRef.current = credentials;
  }, [credentials]);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    graphPointsRef.current = graphPoints;
  }, [graphPoints]);

  // Load session and config
  useEffect(() => {
    const savedSession = Cookies.get("gluco_session");
    const savedConfig = Cookies.get("gluco_config");

    if (savedConfig) {
      try {
        setTargetConfig(JSON.parse(savedConfig));
      } catch (e) {
        console.error("Error parsing config", e);
      }
    }

    if (savedSession) {
      try {
        const parsed = JSON.parse(savedSession);
        setSession(parsed);
        fetchData(undefined, parsed).finally(() => {
          setIsInitializing(false);
        });
        return;
      } catch (e) {
        Cookies.remove("gluco_session");
      }
    }
    setIsInitializing(false);
  }, []);

  const saveConfig = (newConfig: typeof targetConfig) => {
    setTargetConfig(newConfig);
    Cookies.set("gluco_config", JSON.stringify(newConfig), { expires: 365 });

    // Best-effort persist to Supabase for other clients (e.g., Chrome extension)
    supabase
      .from("glucose_target_config")
      .upsert(
        {
          id: "default",
          low: newConfig.low,
          high: newConfig.high,
          hypo: newConfig.hypo,
          hyper: newConfig.hyper,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" },
      )
      .then((result) => {
        const error = result?.error;
        if (error) console.error("Error saving config to Supabase", error);
      });
  };

  const fetchData = async (
    creds = credentialsRef.current,
    sessionData = sessionRef.current,
  ) => {
    setLoading(true);
    setError(null);
    try {
      const result = await getLatestGlucoseAction(
        creds.email,
        creds.password,
        sessionData,
      );
      if (result.success) {
        setData(result.data);
        setIsLoggedIn(true);
        setLastFetch(new Date());

        if (!result.data?.glucose) {
          setGraphPoints([]);
          setWindowEndMs(Date.now());
          return;
        }

        const incomingGraphRaw = Array.isArray(result.data?.graph)
          ? result.data.graph
          : [];

        const graphFallback =
          incomingGraphRaw.length > 0
            ? incomingGraphRaw
            : [result.data.glucose];

        const incomingGraph = graphFallback
          .map((p: any) => ({
            ...p,
            value:
              typeof p?.value === "number"
                ? p.value
                : typeof p?.ValueInMgPerDl === "number"
                  ? p.ValueInMgPerDl
                  : Number(p?.value ?? p?.ValueInMgPerDl),
            time:
              typeof p?.time === "number"
                ? p.time
                : typeof p?.time === "string"
                  ? new Date(p.time).getTime()
                  : Number(p.time),
          }))
          .filter(
            (p: any) =>
              p && typeof p.time === "number" && !Number.isNaN(p.time),
          )
          .sort((a: any, b: any) => a.time - b.time)
          .filter(
            (p: any, idx: number, arr: any[]) =>
              idx === 0 || p.time !== arr[idx - 1].time,
          );

        const prev = graphPointsRef.current;
        const prevLastTime = prev.length > 0 ? prev[prev.length - 1]?.time : -1;
        const newPoints =
          prev.length === 0
            ? incomingGraph
            : incomingGraph.filter((p: any) => p.time > prevLastTime);

        if (newPoints.length > 0) {
          setGraphPoints((current) => {
            const next =
              current.length === 0 ? newPoints : [...current, ...newPoints];
            const maxKeep = 5000;
            return next.length > maxKeep ? next.slice(-maxKeep) : next;
          });
          const nextWindowEnd = newPoints[newPoints.length - 1].time;
          setWindowEndMs((curr) =>
            nextWindowEnd > curr ? nextWindowEnd : curr,
          );
        }

        const newSession = result.data?.session;
        if (newSession && newSession.token) {
          setSession(newSession);
          Cookies.set("gluco_session", JSON.stringify(newSession), {
            expires: 7,
          });
        }
      } else {
        setError(result.error);
        if (isLoggedIn) {
          setIsLoggedIn(false);
          Cookies.remove("gluco_session");
        }
      }
    } catch (e: any) {
      setError(e?.message || "Error actualizando datos");
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setGraphPoints([]);
    setWindowEndMs(Date.now());
    fetchData().finally(() => {
      nextRefreshAtRef.current = Date.now() + 60000;
      setSecondsUntilRefresh(60);
    });
  };

  const handleLogout = () => {
    Cookies.remove("gluco_session");
    setIsLoggedIn(false);
    setData(null);
    setGraphPoints([]);
    setWindowEndMs(Date.now());
    setSession(null);
    setCredentials({ email: "", password: "" });
    setActiveView("dashboard");
  };

  useEffect(() => {
    let tick: ReturnType<typeof setInterval> | undefined;

    const triggerIfDue = () => {
      const nextAt = nextRefreshAtRef.current;
      if (!nextAt) return;
      if (Date.now() < nextAt) return;
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      fetchData().finally(() => {
        inFlightRef.current = false;
        nextRefreshAtRef.current = Date.now() + 60000;
        setSecondsUntilRefresh(60);
      });
    };

    if (isLoggedIn && activeView === "dashboard") {
      nextRefreshAtRef.current = Date.now() + 60000;
      setSecondsUntilRefresh(60);

      tick = setInterval(() => {
        const nextAt = nextRefreshAtRef.current;
        if (!nextAt) return;

        const remainingMs = nextAt - Date.now();
        const remainingSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
        setSecondsUntilRefresh(remainingSeconds);

        if (remainingMs <= 0 && !inFlightRef.current) {
          inFlightRef.current = true;
          fetchData().finally(() => {
            inFlightRef.current = false;
            nextRefreshAtRef.current = Date.now() + 60000;
            setSecondsUntilRefresh(60);
          });
        }
      }, 250);

      const handleVisibilityOrFocus = () => {
        if (
          typeof document !== "undefined" &&
          document.visibilityState !== "visible"
        ) {
          return;
        }
        triggerIfDue();
      };

      document.addEventListener("visibilitychange", handleVisibilityOrFocus);
      window.addEventListener("focus", handleVisibilityOrFocus);

      return () => {
        if (tick) clearInterval(tick);
        document.removeEventListener(
          "visibilitychange",
          handleVisibilityOrFocus,
        );
        window.removeEventListener("focus", handleVisibilityOrFocus);
      };
    }

    return () => {
      if (tick) clearInterval(tick);
    };
  }, [isLoggedIn, activeView]);

  const getTrendIcon = (trend: TrendState, val: number) => {
    const className = "w-6 h-6 transition-all duration-300";
    const rotation = getTrendRotation(trend);

    const getTrendColor = (s: TrendState, value: number) => {
      // 1. Determine direction
      const isUp =
        s === TrendState.UpSlight ||
        s === TrendState.UpAngled ||
        s === TrendState.UpAngledLarge ||
        s === TrendState.Up ||
        s === TrendState.DoubleUp;

      const isDown =
        s === TrendState.DownSlight ||
        s === TrendState.DownAngled ||
        s === TrendState.DownAngledLarge ||
        s === TrendState.Down ||
        s === TrendState.DoubleDown;

      // 2. Determine value status
      const isHigh = value > targetConfig.high;
      const isLow = value < targetConfig.low;
      const isTarget = !isHigh && !isLow;

      // 3. Logic:
      // If Target -> Green (usually).
      if (isTarget) return "text-emerald-500";

      // If High (Red/Orange) AND going Down -> Green (Improving)
      if (isHigh && isDown) return "text-emerald-500";

      // If Low (Red/Orange) AND going Up -> Green (Improving)
      if (isLow && isUp) return "text-emerald-500";

      // Otherwise, match the value color (Bad direction or Stable in bad zone)
      if (value <= targetConfig.hypo) return "text-red-500";
      if (value < targetConfig.low) return "text-amber-500"; // Low but not hypo
      if (value >= targetConfig.hyper) return "text-red-500";
      if (value > targetConfig.high) return "text-amber-500"; // High but not hyper

      return "text-muted-foreground"; // Fallback
    };

    const color = getTrendColor(trend, val);

    if (trend === TrendState.DoubleUp) {
      return <ChevronsUp className={`${className} ${color}`} />;
    }
    if (trend === TrendState.DoubleDown) {
      return <ChevronsDown className={`${className} ${color}`} />;
    }

    return (
      <ArrowUp
        className={`${className} ${color}`}
        style={{ transform: `rotate(${rotation}deg)` }}
      />
    );
  };

  const getGlucoseStatus = (val: number) => {
    if (val <= targetConfig.hypo)
      return {
        label: "HIPO",
        color: "text-red-500",
        badge: "bg-red-500",
        isCritical: true,
      };
    if (val < targetConfig.low)
      return {
        label: "BAJA",
        color: "text-amber-500",
        badge: "bg-amber-500",
        isCritical: false,
      };
    if (val >= targetConfig.hyper)
      return {
        label: "HIPER",
        color: "text-red-500",
        badge: "bg-red-500",
        isCritical: true,
      };
    if (val > targetConfig.high)
      return {
        label: "ALTA",
        color: "text-amber-500",
        badge: "bg-amber-500",
        isCritical: false,
      };
    return {
      label: "OBJETIVO",
      color: "text-emerald-500",
      badge: "text-emerald-500 border-emerald-500/20 bg-emerald-500/5",
      isCritical: false,
    };
  };

  const [timeRange, setTimeRange] = useState(24); // hours
  const [showLine, setShowLine] = useState(true);

  const windowEnd = windowEndMs;
  const windowStart = windowEnd - timeRange * 60 * 60 * 1000;

  const xTicks = useMemo(() => {
    const stepMs = 10 * 60 * 1000;
    const start = Math.ceil(windowStart / stepMs) * stepMs;

    const ticks: number[] = [];
    for (let t = start; t <= windowEnd; t += stepMs) {
      ticks.push(t);
    }
    return ticks;
  }, [windowStart, windowEnd]);

  const xHourTicks = useMemo(() => {
    const stepMs = 60 * 60 * 1000;
    const d = new Date(windowStart);
    d.setMinutes(0, 0, 0);
    let t = d.getTime();
    if (t < windowStart) t += stepMs;

    const ticks: number[] = [];
    for (; t <= windowEnd; t += stepMs) {
      ticks.push(t);
    }
    return ticks;
  }, [windowStart, windowEnd]);

  const filteredGraph = useMemo(() => {
    return graphPoints.filter((p: any) => {
      if (!p || typeof p.time !== "number" || Number.isNaN(p.time))
        return false;
      return p.time >= windowStart && p.time <= windowEnd;
    });
  }, [graphPoints, windowStart, windowEnd]);

  const filteredGraphWithValues = useMemo(() => {
    return filteredGraph.filter(
      (p: any) => p.value !== null && p.value !== undefined,
    );
  }, [filteredGraph]);

  const calculatedTrend = useMemo(() => {
    return calculateTrend(graphPoints, 60);
  }, [graphPoints]);

  const chartGraph = useMemo(() => {
    const cleaned = graphPoints
      .filter((p: any) => typeof p?.time === "number" && !Number.isNaN(p.time))
      .sort((a: any, b: any) => a.time - b.time)
      .filter(
        (p: any, idx: number, arr: any[]) =>
          idx === 0 || p.time !== arr[idx - 1].time,
      );

    const maxPoints = 1000;
    if (cleaned.length <= maxPoints) {
      return [
        ...cleaned,
        { time: windowStart, value: null },
        { time: windowEnd, value: null },
      ];
    }

    const start = cleaned[0]?.time;
    const end = cleaned[cleaned.length - 1]?.time;
    if (typeof start !== "number" || typeof end !== "number" || start >= end) {
      return [
        ...cleaned.slice(-maxPoints),
        { time: windowStart, value: null },
        { time: windowEnd, value: null },
      ];
    }

    const bucketMs = Math.max(1, Math.floor((end - start) / maxPoints));

    const sampled: any[] = [];
    let i = 0;
    while (i < cleaned.length) {
      const bucketStart = cleaned[i].time;
      const bucketEnd = bucketStart + bucketMs;

      let minP: any | null = null;
      let maxP: any | null = null;

      while (i < cleaned.length && cleaned[i].time < bucketEnd) {
        const p = cleaned[i];
        const v = p?.value;
        if (v !== null && v !== undefined) {
          if (!minP || v < minP.value) minP = p;
          if (!maxP || v > maxP.value) maxP = p;
        }
        i++;
      }

      if (minP && maxP) {
        if (minP.time <= maxP.time) {
          sampled.push(minP);
          if (maxP.time !== minP.time) sampled.push(maxP);
        } else {
          sampled.push(maxP);
          sampled.push(minP);
        }
      } else if (minP) {
        sampled.push(minP);
      } else if (maxP) {
        sampled.push(maxP);
      }

      if (i === cleaned.length) break;
    }

    const unique = sampled
      .filter((p) => typeof p?.time === "number" && !Number.isNaN(p.time))
      .sort((a, b) => a.time - b.time)
      .filter((p, idx, arr) => idx === 0 || p.time !== arr[idx - 1].time);

    return [
      ...unique,
      { time: windowStart, value: null },
      { time: windowEnd, value: null },
    ];
  }, [graphPoints, windowStart, windowEnd]);

  useEffect(() => {
    const saved = Cookies.get("gluco_chart_prefs");
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved);
      if (typeof parsed?.timeRange === "number") {
        setTimeRange(parsed.timeRange);
      }
      if (typeof parsed?.showLine === "boolean") {
        setShowLine(parsed.showLine);
      }
    } catch {
      Cookies.remove("gluco_chart_prefs");
    }
  }, []);

  useEffect(() => {
    Cookies.set("gluco_chart_prefs", JSON.stringify({ timeRange, showLine }), {
      expires: 365,
    });
  }, [timeRange, showLine]);

  // Calculate the actual range of values in the current visible data set
  const dataMin = useMemo(() => {
    if (filteredGraphWithValues.length === 0) return targetConfig.low;
    return Math.min(...filteredGraphWithValues.map((p: any) => p.value));
  }, [filteredGraphWithValues, targetConfig.low]);

  const dataMax = useMemo(() => {
    if (filteredGraphWithValues.length === 0) return targetConfig.high;
    return Math.max(...filteredGraphWithValues.map((p: any) => p.value));
  }, [filteredGraphWithValues, targetConfig.high]);

  const getGlucoseColor = (val: number) => {
    if (val === undefined || val === null) return "#94a3b8";
    if (val <= targetConfig.hypo) return "#ef4444";
    if (val < targetConfig.low) return "#f59e0b";
    if (val >= targetConfig.hyper) return "#ef4444";
    if (val > targetConfig.high) return "#f59e0b";
    return "#10b981";
  };

  if (isInitializing) {
    return (
      <main className="h-screen bg-background flex flex-col items-center justify-center p-4 overflow-hidden">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center gap-6"
        >
          <div className="relative">
            <div className="w-20 h-20 bg-primary/10 rounded-3xl flex items-center justify-center animate-pulse">
              <Droplets className="w-10 h-10 text-primary animate-bounce" />
            </div>
            <div className="absolute inset-0 border-4 border-primary/20 border-t-primary rounded-3xl animate-spin" />
          </div>
          <div className="text-center">
            <h2 className="text-2xl font-black tracking-tighter italic">
              GLUCOWEB
            </h2>
            <div className="flex items-center gap-2 justify-center mt-2">
              <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              <p className="text-muted-foreground text-[10px] uppercase tracking-[0.3em] font-bold">
                Sincronizando
              </p>
            </div>
          </div>
        </motion.div>
      </main>
    );
  }

  if (!isLoggedIn) {
    return (
      <main className="min-h-screen bg-background flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-sm"
        >
          <Card className="border-border shadow-lg">
            <CardHeader className="text-center pb-6">
              <div className="w-16 h-16 bg-primary rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-primary/20 rotate-3">
                <Droplets className="w-8 h-8 text-primary-foreground" />
              </div>
              <CardTitle className="text-3xl font-bold tracking-tight italic">
                GLUCOWEB
              </CardTitle>
              <CardDescription className="text-[10px] uppercase tracking-widest font-bold">
                Med-Analytics Interface
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label
                    htmlFor="email"
                    className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground"
                  >
                    Email
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="usuario@ejemplo.com"
                    className="bg-muted/30 border-muted-foreground/20"
                    value={credentials.email}
                    onChange={(e) =>
                      setCredentials({ ...credentials, email: e.target.value })
                    }
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label
                    htmlFor="password"
                    className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground"
                  >
                    Contraseña
                  </Label>
                  <Input
                    id="password"
                    type="password"
                    className="bg-muted/30 border-muted-foreground/20"
                    value={credentials.password}
                    onChange={(e) =>
                      setCredentials({
                        ...credentials,
                        password: e.target.value,
                      })
                    }
                    required
                  />
                </div>
                {error && (
                  <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-[10px] font-bold uppercase tracking-widest border border-destructive/20 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" />
                    {error}
                  </div>
                )}
                <Button
                  type="submit"
                  className="w-full font-bold h-11 text-xs tracking-[0.1em]"
                  disabled={loading}
                >
                  {loading ? (
                    <RefreshCw className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    "ACCEDER AL PANEL"
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        </motion.div>
      </main>
    );
  }

  if (!data) return null;

  const { glucose, patient } = data;
  const unit = glucose?.unit || "mg/dL";
  const onlineThresholdMs = 60 * 1000;
  const glucoseTime = typeof glucose?.time === "number" ? glucose.time : null;
  const isOnline =
    !!glucoseTime &&
    glucose?.isRealtime === true &&
    Date.now() - glucoseTime <= onlineThresholdMs;
  const lastGlucose = data?.lastGlucose ?? null;
  const lastGlucoseThresholdMs = 5 * 60 * 1000;
  const lastGlucoseTime =
    typeof lastGlucose?.time === "number" ? lastGlucose.time : null;
  const canUseLastGlucose =
    !isOnline &&
    !!lastGlucoseTime &&
    Number.isFinite(lastGlucoseTime) &&
    Date.now() - lastGlucoseTime <= lastGlucoseThresholdMs;
  const sensingGlucose = isOnline
    ? glucose
    : canUseLastGlucose
      ? lastGlucose
      : null;
  const displayGlucose = sensingGlucose;
  const status =
    typeof sensingGlucose?.value === "number"
      ? getGlucoseStatus(sensingGlucose.value)
      : getGlucoseStatus(targetConfig.low);

  const stats =
    filteredGraphWithValues.length > 0
      ? {
          avg: Math.round(
            filteredGraphWithValues.reduce(
              (acc: number, p: any) => acc + p.value,
              0,
            ) / filteredGraphWithValues.length,
          ),
          max: Math.max(...filteredGraphWithValues.map((p: any) => p.value)),
          min: Math.min(...filteredGraphWithValues.map((p: any) => p.value)),
          inRange: Math.round(
            (filteredGraphWithValues.filter(
              (p: any) =>
                p.value >= targetConfig.low && p.value <= targetConfig.high,
            ).length /
              filteredGraphWithValues.length) *
              100,
          ),
        }
      : null;

  const rangeStats =
    filteredGraphWithValues.length > 0
      ? (() => {
          const total = filteredGraphWithValues.length;
          const veryLow = filteredGraphWithValues.filter(
            (p: any) => p.value <= targetConfig.hypo,
          ).length;
          const low = filteredGraphWithValues.filter(
            (p: any) =>
              p.value > targetConfig.hypo && p.value < targetConfig.low,
          ).length;
          const inRange = filteredGraphWithValues.filter(
            (p: any) =>
              p.value >= targetConfig.low && p.value <= targetConfig.high,
          ).length;
          const high = filteredGraphWithValues.filter(
            (p: any) =>
              p.value > targetConfig.high && p.value < targetConfig.hyper,
          ).length;
          const veryHigh = filteredGraphWithValues.filter(
            (p: any) => p.value >= targetConfig.hyper,
          ).length;

          const toPct = (n: number) => Math.round((n / total) * 100);

          return {
            total,
            veryLow: { count: veryLow, pct: toPct(veryLow) },
            low: { count: low, pct: toPct(low) },
            inRange: { count: inRange, pct: toPct(inRange) },
            high: { count: high, pct: toPct(high) },
            veryHigh: { count: veryHigh, pct: toPct(veryHigh) },
          };
        })()
      : null;

  const yDomain = (() => {
    const thresholds = [
      targetConfig.hypo,
      targetConfig.low,
      targetConfig.high,
      targetConfig.hyper,
    ].filter((v) => typeof v === "number" && !Number.isNaN(v));

    const minCandidate =
      filteredGraphWithValues.length > 0
        ? Math.min(dataMin, ...thresholds)
        : Math.min(targetConfig.low, ...thresholds);
    const maxCandidate =
      filteredGraphWithValues.length > 0
        ? Math.max(dataMax, ...thresholds)
        : Math.max(targetConfig.high, ...thresholds);

    const pad = 15;
    const paddedMin = minCandidate - pad;
    const paddedMax = maxCandidate + pad;

    let min = Math.floor(paddedMin / 5) * 5;
    let max = Math.ceil(paddedMax / 5) * 5;

    if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max) {
      min = Math.floor((targetConfig.low - 30) / 5) * 5;
      max = Math.ceil((targetConfig.high + 30) / 5) * 5;
    }

    const minSpan = 40;
    if (max - min < minSpan) {
      const mid = (min + max) / 2;
      min = Math.floor((mid - minSpan / 2) / 5) * 5;
      max = Math.ceil((mid + minSpan / 2) / 5) * 5;
    }

    if (min < 0) min = 0;
    return { min, max };
  })();

  const yMin = 0;
  const yMax = yDomain.max;

  const yTicks = (() => {
    const candidates = [
      targetConfig.hypo,
      targetConfig.low,
      targetConfig.high,
      targetConfig.hyper,
      yMax,
    ];

    const uniqueSorted = Array.from(
      new Set(
        candidates
          .filter((v) => typeof v === "number" && Number.isFinite(v))
          .map((v) => Math.round(v))
          .filter((v) => v >= yMin && v <= yMax),
      ),
    ).sort((a, b) => a - b);

    return uniqueSorted.length > 0 ? uniqueSorted : undefined;
  })();

  const breakPointPercentage = (value: number) => {
    if (dataMax === dataMin) return "0%";
    const percentage = ((value - dataMin) / (dataMax - dataMin)) * 100;
    return `${Math.max(0, Math.min(100, percentage))}%`;
  };

  const showDots = chartGraph.length <= 220;
  const enableAnimation = chartGraph.length <= 900;

  const scatterDataRaw = chartGraph.filter(
    (p: any) => p?.value !== null && p?.value !== undefined,
  );

  const maxScatterPoints = 250;
  const scatterStep = Math.max(
    1,
    Math.ceil(scatterDataRaw.length / maxScatterPoints),
  );
  const scatterData =
    scatterStep === 1
      ? scatterDataRaw
      : scatterDataRaw.filter((_: any, idx: number) => idx % scatterStep === 0);

  const SimpleDot = (props: any) => {
    const { cx, cy, payload } = props;
    const val = payload?.value;
    if (
      cx === undefined ||
      cy === undefined ||
      val === undefined ||
      val === null
    )
      return null;
    return <circle cx={cx} cy={cy} r={2} fill={getGlucoseColor(val)} />;
  };

  const CustomDot = (props: any) => {
    const { cx, cy, payload, index } = props;
    const val = payload?.value;
    if (
      cx === undefined ||
      cy === undefined ||
      val === undefined ||
      val === null
    )
      return null;

    const dataLength = chartGraph.length;
    const isFirst = index === 0;
    const isLast = index === dataLength - 1;

    // Siempre mostrar el primer y último punto
    if (isFirst || isLast) {
      return <circle cx={cx} cy={cy} r={1.5} fill={getGlucoseColor(val)} />;
    }

    // Calcular densidad local
    const prev = chartGraph[index - 1];
    const next = chartGraph[index + 1];

    // Calcular distancia a los vecinos
    const timeDiffPrev = prev ? Math.abs(payload.time - prev.time) : Infinity;
    const timeDiffNext = next ? Math.abs(next.time - payload.time) : Infinity;
    const valueDiffPrev =
      prev?.value != null ? Math.abs(val - prev.value) : Infinity;
    const valueDiffNext =
      next?.value != null ? Math.abs(val - next.value) : Infinity;

    // Normalizar las diferencias
    const timeThreshold = 600000; // 10 minutos
    const valueThreshold = 20; // 20 mg/dL

    const normalizedTimePrev = timeDiffPrev / timeThreshold;
    const normalizedTimeNext = timeDiffNext / timeThreshold;
    const normalizedValuePrev = valueDiffPrev / valueThreshold;
    const normalizedValueNext = valueDiffNext / valueThreshold;

    // Distancia euclidiana normalizada
    const distPrev = Math.sqrt(
      normalizedTimePrev ** 2 + normalizedValuePrev ** 2,
    );
    const distNext = Math.sqrt(
      normalizedTimeNext ** 2 + normalizedValueNext ** 2,
    );
    const minDist = Math.min(distPrev, distNext);

    // Ocultar dots en áreas muy densas
    if (minDist < 0.25) {
      // Área muy densa - mostrar solo algunos dots usando muestreo
      const skipFactor = dataLength > 100 ? 5 : dataLength > 50 ? 4 : 3;
      if (index % skipFactor !== 0) return null;
    } else if (minDist < 0.5) {
      // Área moderadamente densa - mostrar más dots
      const skipFactor = dataLength > 100 ? 3 : 2;
      if (index % skipFactor !== 0) return null;
    }
    // Si minDist >= 0.5, mostrar todos los dots (área dispersa)

    return <circle cx={cx} cy={cy} r={1.5} fill={getGlucoseColor(val)} />;
  };

  return (
    <main className="h-screen flex flex-col bg-background text-foreground transition-colors duration-300 overflow-hidden text-xs">
      {/* Header */}
      <header className="flex-none px-4 py-2 border-b bg-background/80 backdrop-blur-md z-10">
        <div className="max-w-[1100px] mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center shadow-lg shadow-primary/10">
              <Droplets className="w-5 h-5 text-primary-foreground" />
            </div>
            <div
              className="flex flex-col cursor-pointer"
              onClick={() => setActiveView("dashboard")}
            >
              <h1 className="text-base font-black tracking-tighter leading-none italic">
                GLUCOWEB
              </h1>
              <span className="text-[8px] font-bold text-muted-foreground uppercase tracking-widest leading-none mt-0.5 opacity-60">
                PRO INTERFACE V2.5
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <p className="text-[8px] font-bold text-muted-foreground uppercase tracking-[0.2em] leading-none mb-1">
                Monitorización Activa
              </p>
              <p className="font-bold text-xs leading-none">
                {patient.firstName} {patient.lastName}
              </p>
            </div>
            <div className="flex items-center gap-2 border-l pl-4 border-border/50">
              <ModeToggle />
              <Button
                variant="ghost"
                size="icon"
                className={`w-8 h-8 rounded-md transition-colors ${
                  activeView === "settings"
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted"
                }`}
                onClick={() =>
                  setActiveView(
                    activeView === "dashboard" ? "settings" : "dashboard",
                  )
                }
              >
                <Settings className="w-4 h-4" />
                <span className="sr-only">Configuración</span>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="w-8 h-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted"
                onClick={handleLogout}
              >
                <LogOut className="w-4 h-4" />
                <span className="sr-only">Cerrar Sesión</span>
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-3 md:p-4 bg-muted/5">
        <div className="max-w-[1100px] mx-auto h-full">
          {activeView === "dashboard" ? (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="h-full flex flex-col space-y-3"
            >
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 flex-1">
                {/* Left Column - Main View */}
                <div className="lg:col-span-9 flex flex-col gap-3 min-w-0 h-full">
                  {/* Top Metrics Bar */}
                  <div className="grid grid-cols-2 md:grid-cols-12 gap-3">
                    <Card className="relative overflow-hidden border bg-card/50 shadow-sm col-span-2 md:col-span-4">
                      <div
                        className={`absolute top-0 left-0 bottom-0 w-1 ${
                          displayGlucose
                            ? status.label === "OBJETIVO"
                              ? "bg-emerald-500"
                              : status.badge
                            : "bg-muted-foreground/40"
                        }`}
                      />
                      <CardContent className="p-3.5 flex items-center justify-between">
                        <div>
                          <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-[0.2em]">
                            Sensing Real-Time
                          </p>
                          <div className="flex items-baseline gap-1.5">
                            <motion.span
                              key={displayGlucose?.value ?? "no-data"}
                              initial={{ opacity: 0, scale: 0.9 }}
                              animate={{ opacity: 1, scale: 1 }}
                              className={`text-5xl font-extrabold tabular-nums font-numbers tracking-tighter ${status.color}`}
                            >
                              {displayGlucose ? displayGlucose.value : "--"}
                            </motion.span>
                            <span className="text-[10px] font-bold text-muted-foreground opacity-60 uppercase">
                              {unit}
                            </span>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1.5">
                          <div className="flex gap-1.5">
                            <Badge
                              variant={
                                displayGlucose && status.label === "OBJETIVO"
                                  ? "outline"
                                  : "default"
                              }
                              className={`${
                                displayGlucose
                                  ? status.badge
                                  : "text-muted-foreground border-border/50 bg-muted/30"
                              } ${
                                displayGlucose && status.label !== "OBJETIVO"
                                  ? "text-white"
                                  : ""
                              } px-2 py-0.5 text-[8px] font-bold rounded-sm uppercase tracking-wider`}
                            >
                              {displayGlucose ? status.label : "SIN DATOS"}
                            </Badge>
                            <div className="p-1.5 bg-muted rounded-md border border-border/50">
                              {displayGlucose ? (
                                getTrendIcon(
                                  calculatedTrend,
                                  displayGlucose.value,
                                )
                              ) : (
                                <Clock className="w-6 h-6 text-muted-foreground" />
                              )}
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="border bg-card/30 col-span-1 md:col-span-4">
                      <CardContent className="p-3.5 space-y-1.5">
                        <p className="text-[8px] font-bold text-muted-foreground uppercase tracking-[0.2em]">
                          Time in Range
                        </p>
                        <div className="flex items-baseline gap-1">
                          <span className="text-2xl font-black text-emerald-500 tabular-nums font-numbers">
                            {stats?.inRange}%
                          </span>
                          <span className="text-[8px] text-muted-foreground font-bold">
                            OPTIMAL
                          </span>
                        </div>
                        <div className="w-full bg-muted h-1 rounded-full overflow-hidden">
                          <div
                            className="bg-emerald-500 h-full"
                            style={{ width: `${stats?.inRange}%` }}
                          />
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="border bg-card/30 col-span-1 md:col-span-4">
                      <CardContent className="p-3.5 space-y-1">
                        <p className="text-[8px] font-bold text-muted-foreground uppercase tracking-[0.2em]">
                          Avg Glucose
                        </p>
                        <div className="flex items-baseline gap-1">
                          <span className="text-2xl font-black tabular-nums font-numbers">
                            {stats?.avg}
                          </span>
                          <span className="text-[8px] text-muted-foreground font-bold uppercase">
                            {unit}
                          </span>
                        </div>
                        <div className="flex justify-between text-[8px] font-bold mt-1 text-muted-foreground opacity-60">
                          <span className="font-numbers">↓ {stats?.min}</span>
                          <span className="font-numbers">↑ {stats?.max}</span>
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Chart Card */}
                  <Card className="shadow-sm border flex flex-col flex-1 min-h-[320px] overflow-hidden bg-card/20">
                    <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between py-2 px-4 border-b bg-muted/20">
                      <div className="flex flex-col w-full sm:w-auto">
                        <CardTitle className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-80 flex items-center gap-2">
                          Historial Analítico
                          <span className="hidden sm:inline-flex text-[8px] px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
                            {timeRange}H Window
                          </span>
                        </CardTitle>
                      </div>

                      {/* Time Filters */}
                      <div className="flex flex-wrap items-center justify-start sm:justify-end gap-2 w-full sm:w-auto">
                        <div className="flex flex-wrap items-center bg-muted/50 p-0.5 rounded-lg border border-border/50">
                          {[1, 3, 6, 12, 24].map((h) => (
                            <button
                              key={h}
                              onClick={() => setTimeRange(h)}
                              className={`px-3 py-1 text-[9px] font-bold transition-all rounded-md ${
                                timeRange === h
                                  ? "bg-background text-primary shadow-sm"
                                  : "text-muted-foreground hover:text-foreground"
                              }`}
                            >
                              {h}H
                            </button>
                          ))}
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className={`h-7 w-7 border transition-all ${
                            showLine
                              ? "bg-primary/10 text-primary border-primary/20"
                              : "text-muted-foreground border-border/50 hover:bg-muted"
                          }`}
                          onClick={() => setShowLine(!showLine)}
                          aria-label={
                            showLine ? "Ocultar línea" : "Mostrar línea"
                          }
                        >
                          {showLine ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="flex-1 p-0 pt-2 flex flex-col">
                      <div className="flex-1 min-h-[360px] min-w-0">
                        <ResponsiveContainer width="100%" height={360}>
                          <ComposedChart
                            data={chartGraph}
                            margin={{ top: 5, right: 10, left: -15, bottom: 5 }}
                          >
                            {(() => {
                              const gradientId = `lineGluc-${timeRange}-${dataMin}-${dataMax}`;
                              return (
                                <>
                                  <defs>
                                    <linearGradient
                                      id={gradientId}
                                      x1="0%"
                                      y1="104%"
                                      x2="0%"
                                      y2="-2%"
                                    >
                                      <stop
                                        offset="0%"
                                        stopColor={getGlucoseColor(dataMin)}
                                      />

                                      {targetConfig.hypo > dataMin &&
                                        targetConfig.hypo < dataMax && (
                                          <>
                                            <stop
                                              offset={breakPointPercentage(
                                                targetConfig.hypo,
                                              )}
                                              stopColor={getGlucoseColor(
                                                targetConfig.hypo - 1,
                                              )}
                                            />
                                            <stop
                                              offset={breakPointPercentage(
                                                targetConfig.hypo,
                                              )}
                                              stopColor={getGlucoseColor(
                                                targetConfig.hypo + 1,
                                              )}
                                            />
                                          </>
                                        )}

                                      {targetConfig.low > dataMin &&
                                        targetConfig.low < dataMax && (
                                          <>
                                            <stop
                                              offset={breakPointPercentage(
                                                targetConfig.low,
                                              )}
                                              stopColor={getGlucoseColor(
                                                targetConfig.low - 1,
                                              )}
                                            />
                                            <stop
                                              offset={breakPointPercentage(
                                                targetConfig.low,
                                              )}
                                              stopColor={getGlucoseColor(
                                                targetConfig.low + 1,
                                              )}
                                            />
                                          </>
                                        )}

                                      {targetConfig.high > dataMin &&
                                        targetConfig.high < dataMax && (
                                          <>
                                            <stop
                                              offset={breakPointPercentage(
                                                targetConfig.high,
                                              )}
                                              stopColor={getGlucoseColor(
                                                targetConfig.high - 1,
                                              )}
                                            />
                                            <stop
                                              offset={breakPointPercentage(
                                                targetConfig.high,
                                              )}
                                              stopColor={getGlucoseColor(
                                                targetConfig.high + 1,
                                              )}
                                            />
                                          </>
                                        )}

                                      {targetConfig.hyper > dataMin &&
                                        targetConfig.hyper < dataMax && (
                                          <>
                                            <stop
                                              offset={breakPointPercentage(
                                                targetConfig.hyper,
                                              )}
                                              stopColor={getGlucoseColor(
                                                targetConfig.hyper - 1,
                                              )}
                                            />
                                            <stop
                                              offset={breakPointPercentage(
                                                targetConfig.hyper,
                                              )}
                                              stopColor={getGlucoseColor(
                                                targetConfig.hyper + 1,
                                              )}
                                            />
                                          </>
                                        )}

                                      <stop
                                        offset="100%"
                                        stopColor={getGlucoseColor(dataMax)}
                                      />
                                    </linearGradient>

                                    <linearGradient
                                      id="colorGluc"
                                      x1="0"
                                      y1="0"
                                      x2="0"
                                      y2="1"
                                    >
                                      <stop
                                        offset="5%"
                                        stopColor="var(--muted-foreground)"
                                        stopOpacity={0.1}
                                      />
                                      <stop
                                        offset="95%"
                                        stopColor="var(--muted-foreground)"
                                        stopOpacity={0}
                                      />
                                    </linearGradient>
                                  </defs>

                                  {/* ... rest of chart ... */}
                                  <CartesianGrid
                                    strokeDasharray="5 5"
                                    vertical={false}
                                    stroke="var(--muted)"
                                    opacity={0.15}
                                  />

                                  {xHourTicks.map((t) => (
                                    <ReferenceLine
                                      key={t}
                                      x={t}
                                      ifOverflow="extendDomain"
                                      stroke="var(--muted-foreground)"
                                      strokeOpacity={0.08}
                                      strokeWidth={1}
                                    />
                                  ))}
                                  <XAxis
                                    dataKey="time"
                                    type="number"
                                    domain={[windowStart, windowEnd]}
                                    allowDataOverflow={true}
                                    ticks={xTicks}
                                    interval={0}
                                    tickMargin={10}
                                    tickFormatter={(t) =>
                                      new Date(t).getMinutes() === 0
                                        ? new Date(t).toLocaleTimeString([], {
                                            hour: "2-digit",
                                          })
                                        : ""
                                    }
                                    stroke="var(--foreground)"
                                    fontSize={10}
                                    fontWeight="600"
                                    tickLine={{
                                      stroke: "var(--muted-foreground)",
                                      opacity: 0.6,
                                    }}
                                    axisLine={{
                                      stroke: "var(--muted-foreground)",
                                      opacity: 0.6,
                                      strokeWidth: 1,
                                    }}
                                    minTickGap={0}
                                  />
                                  <YAxis
                                    stroke="var(--foreground)"
                                    fontSize={10}
                                    fontWeight="600"
                                    interval={0}
                                    minTickGap={0}
                                    tickLine={false}
                                    axisLine={false}
                                    domain={[yMin, yMax]}
                                    ticks={yTicks}
                                    orientation="right"
                                    width={30}
                                  />
                                  <Tooltip
                                    cursor={{
                                      stroke: "var(--muted-foreground)",
                                      strokeOpacity: 0.15,
                                      strokeWidth: 1.5,
                                      strokeDasharray: "4 4",
                                    }}
                                    content={({ active, payload, label }) => {
                                      if (active && payload && payload.length) {
                                        const glucoseItem = payload.find(
                                          (p) => p.dataKey === "value",
                                        );
                                        if (
                                          !glucoseItem ||
                                          glucoseItem.value === null
                                        )
                                          return null;

                                        const val = Number(glucoseItem.value);
                                        const status = getGlucoseStatus(val);

                                        return (
                                          <div className="bg-card/95 border border-border/50 rounded-lg p-2 shadow-xl min-w-[130px] backdrop-blur-md ring-1 ring-white/10">
                                            <div className="flex flex-col gap-1.5">
                                              <div className="flex items-center justify-between border-b border-border/40 pb-1.5 px-1">
                                                <p className="text-[9px] font-black text-muted-foreground uppercase tracking-[0.1em]">
                                                  {label
                                                    ? new Date(
                                                        label as number,
                                                      ).toLocaleString([], {
                                                        hour: "2-digit",
                                                        minute: "2-digit",
                                                        day: "numeric",
                                                        month: "short",
                                                      })
                                                    : "--:--"}
                                                </p>
                                              </div>
                                              <div className="flex items-baseline justify-between gap-3 px-1">
                                                <div className="flex items-baseline gap-1">
                                                  <span
                                                    className={`text-xl font-black tabular-nums font-numbers tracking-tighter ${status.color}`}
                                                  >
                                                    {val}
                                                  </span>
                                                  <span className="text-[8px] font-black text-muted-foreground uppercase opacity-40">
                                                    {unit}
                                                  </span>
                                                </div>
                                                <span
                                                  className={`text-[12px] font-black uppercase tracking-wider ${status.color}`}
                                                >
                                                  {status.label}
                                                </span>
                                              </div>
                                            </div>
                                          </div>
                                        );
                                      }
                                      return null;
                                    }}
                                  />

                                  {/* Background Bands */}
                                  <ReferenceArea
                                    y1={targetConfig.hyper}
                                    y2={yMax}
                                    fill="#ef4444"
                                    fillOpacity={0.03}
                                  />
                                  <ReferenceArea
                                    y1={targetConfig.high}
                                    y2={targetConfig.hyper}
                                    fill="#f59e0b"
                                    fillOpacity={0.02}
                                  />
                                  <ReferenceArea
                                    y1={targetConfig.low}
                                    y2={targetConfig.high}
                                    fill="#10b981"
                                    fillOpacity={0.05}
                                  />
                                  <ReferenceArea
                                    y1={targetConfig.hypo}
                                    y2={targetConfig.low}
                                    fill="#f59e0b"
                                    fillOpacity={0.02}
                                  />
                                  <ReferenceArea
                                    y1={yMin}
                                    y2={targetConfig.hypo}
                                    fill="#ef4444"
                                    fillOpacity={0.03}
                                  />

                                  <ReferenceLine
                                    y={targetConfig.hyper}
                                    stroke="#ef4444"
                                    strokeDasharray="6 3"
                                    strokeWidth={1}
                                    opacity={0.6}
                                    label={{
                                      value: "HIPER",
                                      position: "insideTopRight",
                                      fill: "#ef4444",
                                      fontSize: 9,
                                      fontWeight: "900",
                                      dy: -16,
                                    }}
                                  />
                                  <ReferenceLine
                                    y={targetConfig.high}
                                    stroke="#f59e0b"
                                    strokeDasharray="6 3"
                                    strokeWidth={1}
                                    opacity={0.6}
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
                                    strokeWidth={1}
                                    opacity={0.6}
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
                                      stroke="#ef4444"
                                      strokeDasharray="3 2"
                                      strokeWidth={1}
                                      opacity={0.6}
                                      label={{
                                        value: "HIPO",
                                        position: "insideBottomRight",
                                        fill: "#ef4444",
                                        fontSize: 9,
                                        fontWeight: "900",
                                        dy: 16,
                                      }}
                                    />
                                  )}

                                  {showLine ? (
                                    <Area
                                      type="monotone"
                                      dataKey="value"
                                      name="GLUCOSA"
                                      stroke={`url(#${gradientId})`}
                                      strokeWidth={3}
                                      fill="url(#colorGluc)"
                                      baseValue={yMin}
                                      animationDuration={
                                        enableAnimation ? 500 : 0
                                      }
                                      animationEasing="ease-in-out"
                                      isAnimationActive={enableAnimation}
                                      connectNulls={true}
                                      dot={showDots ? <CustomDot /> : false}
                                      activeDot={
                                        showDots
                                          ? {
                                              r: 4,
                                              strokeWidth: 2,
                                              fill: "#94a3b8",
                                              stroke: "var(--background)",
                                            }
                                          : false
                                      }
                                    />
                                  ) : (
                                    <Scatter
                                      data={scatterData}
                                      dataKey="value"
                                      name="GLUCOSA"
                                      shape={<SimpleDot />}
                                      isAnimationActive={enableAnimation}
                                      animationDuration={
                                        enableAnimation ? 500 : 0
                                      }
                                      animationEasing="ease-in-out"
                                    />
                                  )}
                                </>
                              );
                            })()}
                          </ComposedChart>
                        </ResponsiveContainer>
                      </div>

                      <div className="px-4 py-2 border-t bg-muted/5 flex items-center justify-between text-[8px] font-bold text-muted-foreground uppercase tracking-widest">
                        <div className="flex items-center gap-4">
                          <span className="flex items-center gap-1.5">
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />{" "}
                            Target Zone ({targetConfig.low}-{targetConfig.high})
                          </span>
                          <span className="flex items-center gap-1.5 opacity-50">
                            <div className="w-4 h-[1px] bg-muted-foreground border-t border-dashed" />{" "}
                            Reference Limits
                          </span>
                        </div>
                        <div className="flex gap-4 opacity-50">
                          <span>Telemetry Pts: {filteredGraph.length}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Right Column - Sidemenu */}
                <div className="lg:col-span-3 flex flex-col gap-3">
                  <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
                    <Card className="border bg-card/30">
                      <CardContent className="py-3.5 space-y-2">
                        <p className="text-[8px] font-bold text-muted-foreground uppercase tracking-[0.2em]">
                          Health Diagnostics
                        </p>

                        <div className="flex items-center justify-between">
                          <span className="text-[8px] font-bold text-muted-foreground uppercase tracking-[0.2em]">
                            Last sync
                          </span>
                          <span className="text-[10px] font-black tabular-nums font-numbers">
                            {displayGlucose
                              ? new Date(
                                  displayGlucose.time,
                                ).toLocaleTimeString([], {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })
                              : "--:--"}
                          </span>
                        </div>

                        <div className="flex items-center justify-between">
                          <span className="text-[8px] font-bold text-muted-foreground uppercase tracking-[0.2em]">
                            Auto-sync
                          </span>
                          <span className="text-[10px] font-black tabular-nums font-numbers text-primary">
                            {secondsUntilRefresh}s
                          </span>
                        </div>

                        <Button
                          className="w-full h-7 text-[8px] font-bold uppercase tracking-[0.15em] shadow-sm active:scale-95 transition-transform"
                          onClick={() => fetchData()}
                          disabled={loading}
                          variant="secondary"
                        >
                          <RefreshCw
                            className={`w-3.5 h-3.5 mr-2 ${
                              loading ? "animate-spin" : ""
                            }`}
                          />
                          Sync Manual
                        </Button>
                      </CardContent>
                    </Card>

                    <Card className="border bg-card/30">
                      <CardContent className="p-3.5 space-y-2">
                        <p className="text-[8px] font-bold text-muted-foreground uppercase tracking-[0.2em]">
                          Time in Ranges
                        </p>
                        <div className="space-y-1.5">
                          {(
                            [
                              {
                                key: "veryHigh",
                                label: "Muy Alta",
                                color: "bg-red-500",
                                text: "text-red-500",
                              },
                              {
                                key: "high",
                                label: "Alta",
                                color: "bg-amber-500",
                                text: "text-amber-500",
                              },
                              {
                                key: "inRange",
                                label: "Objetivo",
                                color: "bg-emerald-500",
                                text: "text-emerald-500",
                              },
                              {
                                key: "low",
                                label: "Baja",
                                color: "bg-amber-500",
                                text: "text-amber-500",
                              },
                              {
                                key: "veryLow",
                                label: "Muy Baja",
                                color: "bg-red-500",
                                text: "text-red-500",
                              },
                            ] as const
                          ).map((r) => (
                            <div key={r.key} className="space-y-1">
                              <div className="flex items-center justify-between">
                                <span className="text-[8px] font-bold text-muted-foreground uppercase tracking-[0.2em]">
                                  {r.label}
                                </span>
                                <span
                                  className={`text-[10px] font-black tabular-nums font-numbers ${r.text}`}
                                >
                                  {rangeStats?.[r.key]?.pct ?? 0}%
                                </span>
                              </div>
                              <div className="w-full bg-muted h-1 rounded-full overflow-hidden">
                                <div
                                  className={`${r.color} h-full`}
                                  style={{
                                    width: `${rangeStats?.[r.key]?.pct ?? 0}%`,
                                  }}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Patient Profile Snapshot */}
                  <Card className="border shadow-none mt-auto bg-muted/10">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-background flex items-center justify-center border shadow-sm">
                          <User className="w-5 h-5 text-muted-foreground" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[7px] font-bold text-muted-foreground uppercase tracking-wider mb-0.5">
                            Clinical Profile
                          </p>
                          <p className="text-[11px] font-black truncate uppercase tracking-tight">
                            {patient.firstName} {patient.lastName}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="max-w-2xl mx-auto py-4"
            >
              <div className="flex items-center gap-3 mb-6">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setActiveView("dashboard")}
                  className="rounded-full"
                >
                  <ArrowLeft className="w-4 h-4" />
                </Button>
                <div>
                  <h2 className="text-xl font-black italic tracking-tight">
                    CONFIGURACIÓN DE RANGOS
                  </h2>
                  <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">
                    Ajuste de umbrales clínicos personalizados
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card className="border bg-card/40 md:col-span-2">
                  <CardHeader className="pb-3 px-6 pt-6 flex flex-row items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                      <ShieldCheck className="w-6 h-6" />
                    </div>
                    <div>
                      <CardTitle className="text-sm font-black uppercase tracking-tight">
                        Umbrales de Control
                      </CardTitle>
                      <CardDescription className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
                        Define los límites para alertas y análisis
                      </CardDescription>
                    </div>
                  </CardHeader>
                  <CardContent className="p-6 space-y-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <Label className="text-[10px] font-black uppercase tracking-widest text-red-500">
                            HIPO
                          </Label>
                          <Badge className="bg-red-500 h-4 text-[8px] font-black">
                            CRÍTICO
                          </Badge>
                        </div>
                        <Input
                          type="number"
                          value={targetConfig.hypo}
                          onChange={(e) =>
                            saveConfig({
                              ...targetConfig,
                              hypo: parseInt(e.target.value),
                            })
                          }
                          className="bg-muted/50 font-black tabular-nums font-numbers h-12 text-lg"
                        />
                        <p className="text-[7px] text-muted-foreground font-medium italic opacity-60">
                          Umbral hipoglucemia grave
                        </p>
                      </div>

                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <Label className="text-[10px] font-black uppercase tracking-widest text-amber-500">
                            Bajo
                          </Label>
                          <Badge className="bg-amber-500 h-4 text-[8px] font-black">
                            WARNING
                          </Badge>
                        </div>
                        <Input
                          type="number"
                          value={targetConfig.low}
                          onChange={(e) =>
                            saveConfig({
                              ...targetConfig,
                              low: parseInt(e.target.value),
                            })
                          }
                          className="bg-muted/50 font-black tabular-nums font-numbers h-12 text-lg"
                        />
                        <p className="text-[7px] text-muted-foreground font-medium italic opacity-60">
                          Inicio de rango objetivo
                        </p>
                      </div>

                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <Label className="text-[10px] font-black uppercase tracking-widest text-amber-500">
                            Alto
                          </Label>
                          <Badge className="bg-amber-500 h-4 text-[8px] font-black">
                            WARNING
                          </Badge>
                        </div>
                        <Input
                          type="number"
                          value={targetConfig.high}
                          onChange={(e) =>
                            saveConfig({
                              ...targetConfig,
                              high: parseInt(e.target.value),
                            })
                          }
                          className="bg-muted/50 font-black tabular-nums font-numbers h-12 text-lg"
                        />
                        <p className="text-[7px] text-muted-foreground font-medium italic opacity-60">
                          Fin de rango objetivo
                        </p>
                      </div>

                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <Label className="text-[10px] font-black uppercase tracking-widest text-red-500">
                            HIPER
                          </Label>
                          <Badge className="bg-red-500 h-4 text-[8px] font-black">
                            CRÍTICO
                          </Badge>
                        </div>
                        <Input
                          type="number"
                          value={targetConfig.hyper}
                          onChange={(e) =>
                            saveConfig({
                              ...targetConfig,
                              hyper: parseInt(e.target.value),
                            })
                          }
                          className="bg-muted/50 font-black tabular-nums font-numbers h-12 text-lg"
                        />
                        <p className="text-[7px] text-muted-foreground font-medium italic opacity-60">
                          Umbral hiperglucemia grave
                        </p>
                      </div>
                    </div>

                    <div className="p-4 rounded-lg bg-primary/5 border border-primary/10">
                      <div className="flex gap-3">
                        <AlertCircle className="w-5 h-5 text-primary shrink-0" />
                        <div className="space-y-1">
                          <p className="text-[10px] font-black uppercase tracking-widest text-primary">
                            Información de Sistema
                          </p>
                          <p className="text-[9px] text-muted-foreground leading-relaxed">
                            Estos valores afectan directamente a los cálculos de{" "}
                            <strong>Time in Range</strong>, las alertas visuales
                            de colores y las líneas de referencia en el gráfico
                            analítico. Los cambios se guardan automáticamente en
                            tu sesión local.
                          </p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border bg-card/10 md:col-span-2">
                  <CardContent className="p-4 flex items-center justify-between">
                    <div>
                      <p className="text-[8px] font-bold text-muted-foreground uppercase tracking-widest mb-0.5">
                        Estado de Sincronización
                      </p>
                      <p className="text-[10px] font-black">
                        ALMACENAMIENTO LOCAL ACTIVO
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      className="h-8 text-[9px] font-black uppercase tracking-widest border-primary/20 text-primary hover:bg-primary/10"
                      onClick={() => setActiveView("dashboard")}
                    >
                      Volver al Panel
                      <ArrowRight className="ml-2 w-3.5 h-3.5" />
                    </Button>
                  </CardContent>
                </Card>
              </div>
            </motion.div>
          )}
        </div>
      </div>

      {/* Footer */}
      <footer className="flex-none px-4 py-1.5 border-t bg-background z-10">
        <div className="max-w-[1100px] mx-auto flex justify-between items-center text-muted-foreground">
          <p className="text-[7px] font-bold tracking-[0.4em] uppercase opacity-30">
            GlucoWeb Biomedical Interface • Engine v2.5.0-Release
          </p>
          <div className="flex items-center gap-5">
            <div className="flex items-center gap-1.5 opacity-40">
              <div className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />
              <a
                href="https://github.com/josemqu"
                target="_blank"
                rel="noreferrer"
                className="text-[7px] font-bold tracking-[0.2em] uppercase text-emerald-500 hover:underline"
              >
                Hecho con ♥ por josemqu
              </a>
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
}
