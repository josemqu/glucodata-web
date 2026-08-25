"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion, useReducedMotion } from "framer-motion";
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
  Activity,
  Target,
  TrendingUp,
  Syringe,
  Plus,
  Trash2,
  Save,
  Apple,
  Utensils,
  Dumbbell,
  BookOpenText,
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
import { getHistoricalGlucoseAction } from "./actions";
import { AnalysisView } from "@/components/analysis-view";
import { EventCenter, type EventCenterHandle } from "@/components/event-center";
import type { GlucoEvent } from "@/lib/events";
import type { EventType } from "@/lib/events";
import {
  DEFAULT_PATIENT_INSULINS,
  INSULIN_TYPES,
  INSULIN_TYPE_LABELS,
  type PatientInsulin,
} from "@/lib/insulins";
import {
  CHART_SERIES_ANIMATION_DURATION_MS,
  CHART_SERIES_ANIMATION_EASING,
} from "@/lib/chart-motion";
import {
  CHART_TOOLTIP_OFFSET,
  CHART_TOOLTIP_WRAPPER_STYLE,
} from "@/lib/chart-tooltip";

function chartEventSymbol(type: GlucoEvent["type"]) {
  if (type === "insulin") return "💉";
  if (type === "exercise") return "●";
  if (type === "note") return "✎";
  if (type === "medication") return "✚";
  if (type === "sleep") return "☾";
  if (type === "health") return "♥";
  return "◆";
}

function chartEventColor(type: GlucoEvent["type"]) {
  return `var(--event-${type === "other" ? "other" : type})`;
}

function chartEventLabel(event: GlucoEvent) {
  const labels: Record<GlucoEvent["type"], string> = {
    meal: "Comida",
    insulin: "Insulina",
    exercise: "Ejercicio",
    medication: "Medicación",
    sleep: "Sueño",
    health: "Salud",
    note: "Nota",
    other: "Evento",
  };
  const type = labels[event.type];
  const time = new Date(event.occurred_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return `Abrir ${type.toLowerCase()}: ${event.title}, ${time}`;
}

function chartEventTypeLabel(type: GlucoEvent["type"]) {
  return ({
    meal: "Comida",
    insulin: "Insulina",
    exercise: "Ejercicio",
    medication: "Medicación",
    sleep: "Sueño",
    health: "Salud",
    note: "Nota",
    other: "Evento",
  } satisfies Record<GlucoEvent["type"], string>)[type];
}

function chartEventMeasurement(event: GlucoEvent) {
  if (event.type === "insulin" && typeof event.metadata.units === "number") {
    return `${event.metadata.units} U`;
  }
  if (event.type === "meal" && typeof event.metadata.carbs_g === "number") {
    return `${event.metadata.carbs_g} g CH`;
  }
  return null;
}

function EventChartMarker({ viewBox, event, onSelect, tooltipOpen, onTooltipVisibilityChange }: {
  viewBox?: { x?: number; y?: number };
  event: GlucoEvent;
  onSelect: (event: GlucoEvent) => void;
  tooltipOpen: boolean;
  onTooltipVisibilityChange: (open: boolean) => void;
}) {
  const x = viewBox?.x ?? 0;
  const y = 6;
  const color = chartEventColor(event.type);
  const tooltipX = x < 86 ? 16 : x > 300 ? -166 : -75;
  const eventTime = new Date(event.occurred_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const measurement = chartEventMeasurement(event);
  const activate = () => onSelect(event);
  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={chartEventLabel(event)}
      className="group cursor-pointer outline-none"
      transform={`translate(${x}, ${y})`}
      onClick={activate}
      onMouseEnter={() => onTooltipVisibilityChange(true)}
      onMouseLeave={() => onTooltipVisibilityChange(false)}
      onFocus={() => onTooltipVisibilityChange(true)}
      onBlur={() => onTooltipVisibilityChange(false)}
      onKeyDown={(keyboardEvent) => {
        if (keyboardEvent.key === "Enter" || keyboardEvent.key === " ") {
          keyboardEvent.preventDefault();
          activate();
        }
      }}
    >
      <rect x={-22} y={-4} width={44} height={44} fill="transparent" />
      <line x1={0} y1={22} x2={0} y2={36} stroke={color} strokeWidth={1} strokeDasharray="3 3" aria-hidden="true" />
      <circle cx={0} cy={10} r={12} fill="var(--card)" stroke={color} strokeWidth={2} className="transition-[stroke-width,filter] group-hover:[filter:drop-shadow(0_2px_4px_rgb(0_0_0_/_0.18))] group-focus:[filter:drop-shadow(0_0_3px_var(--ring))] group-focus:stroke-[3px]" />
      {event.type === "meal" ? (
        <Apple x={-7} y={3} width={14} height={14} stroke={color} strokeWidth={2.25} aria-hidden="true" />
      ) : (
        <text x={0} y={14} textAnchor="middle" fontSize={event.type === "exercise" ? 11 : 13} fill={color} aria-hidden="true">{chartEventSymbol(event.type)}</text>
      )}
      {tooltipOpen ? (
        <foreignObject x={tooltipX} y={28} width={150} height={58} overflow="visible" pointerEvents="none" aria-hidden="true">
          <div className="rounded-lg border border-border/60 bg-card/95 px-2.5 py-2 text-left shadow-lg backdrop-blur-md">
            <p className="truncate text-[11px] font-bold leading-tight text-foreground">{event.title}</p>
            <p className="mt-1 flex items-center justify-between gap-2 text-[9px] font-semibold text-muted-foreground">
              <span className="flex min-w-0 items-center gap-1 truncate">
                <span>{chartEventTypeLabel(event.type)}</span>
                {measurement ? <><span aria-hidden="true">·</span><strong className="font-numbers font-bold tabular-nums text-foreground/80">{measurement}</strong></> : null}
              </span>
              <span className="font-numbers tabular-nums">{eventTime}</span>
            </p>
          </div>
        </foreignObject>
      ) : null}
    </g>
  );
}

type ChartContextMenuState = {
  x: number;
  y: number;
  occurredAt: Date;
};

const chartContextChoices: Array<{ type: EventType; label: string; icon: typeof Utensils }> = [
  { type: "meal", label: "Comida", icon: Utensils },
  { type: "insulin", label: "Insulina", icon: Syringe },
  { type: "exercise", label: "Ejercicio", icon: Dumbbell },
  { type: "note", label: "Nota", icon: BookOpenText },
];

function ChartEventContextMenu({ menu, onClose, onSelect }: {
  menu: ChartContextMenuState;
  onClose: () => void;
  onSelect: (type: EventType) => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = () => onClose();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    menuRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [onClose]);

  const menuWidth = 224;
  const menuHeight = 246;
  const left = Math.max(8, Math.min(menu.x, window.innerWidth - menuWidth - 8));
  const top = Math.max(8, Math.min(menu.y, window.innerHeight - menuHeight - 8));
  const dateLabel = menu.occurredAt.toLocaleDateString([], { day: "2-digit", month: "short" });
  const timeLabel = menu.occurredAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label={`Registrar evento el ${dateLabel} a las ${timeLabel}`}
      className="fixed z-[60] w-56 overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-xl"
      style={{ left, top }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="border-b bg-muted/30 px-3 py-2.5">
        <p className="text-xs font-semibold">Registrar evento</p>
        <time className="mt-0.5 block font-numbers text-[11px] tabular-nums text-muted-foreground">
          {dateLabel} · {timeLabel}
        </time>
      </div>
      <div className="p-1.5">
        {chartContextChoices.map((choice) => {
          const Icon = choice.icon;
          return (
            <button
              key={choice.type}
              type="button"
              role="menuitem"
              className="flex min-h-10 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-sm font-medium outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground"
              onClick={() => onSelect(choice.type)}
            >
              <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              {choice.label}
            </button>
          );
        })}
      </div>
    </div>,
    document.body,
  );
}

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
  const [activeView, setActiveView] = useState<"dashboard" | "analysis" | "settings">(
    "dashboard",
  );
  const [historicalData, setHistoricalData] = useState<any[]>([]);
  const [analysisStats, setAnalysisStats] = useState<any>(null);
  const [analysisPercentiles, setAnalysisPercentiles] = useState<any[]>([]);
  const [analysisDays, setAnalysisDays] = useState(7);
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);
  const [events, setEvents] = useState<GlucoEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [hoveredChartEventId, setHoveredChartEventId] = useState<string | null>(null);
  const [chartContextMenu, setChartContextMenu] = useState<ChartContextMenuState | null>(null);
  const [insulins, setInsulins] = useState<PatientInsulin[]>(DEFAULT_PATIENT_INSULINS);
  const [insulinsLoading, setInsulinsLoading] = useState(false);
  const [insulinsSaving, setInsulinsSaving] = useState(false);
  const [insulinsMessage, setInsulinsMessage] = useState<string | null>(null);
  const eventCenterRef = useRef<EventCenterHandle>(null);

  const openChartContextMenu = useCallback((clientX: number, clientY: number, chartRect: DOMRect) => {
    const ratio = Math.max(0, Math.min(1, (clientX - chartRect.left) / chartRect.width));
    const occurredAtMs = chartWindowStartRef.current + ratio * (windowEndMs - chartWindowStartRef.current);
    const roundedToMinute = Math.round(occurredAtMs / 60_000) * 60_000;
    setHoveredChartEventId(null);
    setChartContextMenu({ x: clientX, y: clientY, occurredAt: new Date(roundedToMinute) });
  }, [windowEndMs]);

  const [session, setSession] = useState<any>(null);

  const loadEvents = useCallback(async () => {
    if (!session?.token || !session?.userId) return;
    setEventsLoading(true);
    setEventsError(null);
    try {
      const response = await fetch("/api/events", {
        headers: {
          Authorization: `Bearer ${session.token}`,
          "X-Libre-User-Id": session.userId,
          "X-Libre-Region": session.region ?? "",
        },
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "No se pudieron cargar los eventos.");
      setEvents(result.data ?? []);
    } catch (requestError) {
      setEventsError(requestError instanceof Error ? requestError.message : "No se pudieron cargar los eventos.");
    } finally {
      setEventsLoading(false);
    }
  }, [session]);

  const sessionHeaders = useCallback(() => ({
    "Content-Type": "application/json",
    Authorization: `Bearer ${session?.token ?? ""}`,
    "X-Libre-User-Id": session?.userId ?? "",
    "X-Libre-Region": session?.region ?? "",
  }), [session]);

  const loadInsulins = useCallback(async () => {
    if (!session?.token || !session?.userId) return;
    setInsulinsLoading(true);
    try {
      const response = await fetch("/api/patient/insulins", { headers: sessionHeaders() });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "No se pudo cargar la configuración de insulina.");
      if (result.data?.length) setInsulins(result.data);
    } catch (requestError) {
      setInsulinsMessage(requestError instanceof Error ? requestError.message : "No se pudo cargar la configuración de insulina.");
    } finally {
      setInsulinsLoading(false);
    }
  }, [session, sessionHeaders]);

  const saveInsulins = async () => {
    setInsulinsSaving(true);
    setInsulinsMessage(null);
    try {
      const response = await fetch("/api/patient/insulins", {
        method: "PUT",
        headers: sessionHeaders(),
        body: JSON.stringify(insulins),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "No se pudo guardar la configuración de insulina.");
      setInsulins(result.data);
      setInsulinsMessage("Configuración guardada para este paciente.");
    } catch (requestError) {
      setInsulinsMessage(requestError instanceof Error ? requestError.message : "No se pudo guardar la configuración de insulina.");
    } finally {
      setInsulinsSaving(false);
    }
  };

  useEffect(() => {
    if (!isLoggedIn || !session?.token) return;
    const timer = window.setTimeout(() => { void loadEvents(); void loadInsulins(); }, 0);
    return () => window.clearTimeout(timer);
  }, [isLoggedIn, session?.token, loadEvents, loadInsulins]);

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

  // Sync activeView with URL Hash
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace("#", "");
      if (hash === "monitor" || hash === "dashboard") {
        setActiveView("dashboard");
      } else if (hash === "analisis" || hash === "analysis") {
        setActiveView("analysis");
      } else if (hash === "settings") {
        setActiveView("settings");
      }
    };

    handleHashChange();
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  useEffect(() => {
    const currentHash = window.location.hash.replace("#", "");
    const expectedHash = activeView === "dashboard" ? "monitor" : activeView === "analysis" ? "analisis" : "settings";
    
    if (currentHash !== expectedHash) {
      window.history.replaceState(null, "", `#${expectedHash}`);
    }
  }, [activeView]);

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

        if (!result.data?.glucose && (!result.data?.graph || result.data.graph.length === 0)) {
          console.log("No glucose and no graph data received");
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
    setEvents([]);
    setCredentials({ email: "", password: "" });
    setActiveView("dashboard");
  };

  const fetchHistoricalData = async (days: number = analysisDays) => {
    setLoadingAnalysis(true);
    try {
      const result = await getHistoricalGlucoseAction(
        days,
        credentials.email,
        credentials.password,
        session,
        targetConfig
      );
      if (result.success && result.data) {
        setHistoricalData(result.data.history || []);
        setAnalysisStats(result.data.stats);
        setAnalysisPercentiles(result.data.percentileData || []);
      } else {
        console.error("Error fetching historical data:", result.error);
      }
    } catch (e) {
      console.error("Error fetching historical data:", e);
    } finally {
      setLoadingAnalysis(false);
    }
  };

  useEffect(() => {
    if (activeView === "analysis") {
      fetchHistoricalData();
    }
  }, [activeView, analysisDays]);

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
  const reduceMotion = useReducedMotion();

  const windowEnd = windowEndMs;
  const windowStart = windowEnd - timeRange * 60 * 60 * 1000;
  const [chartWindowStart, setChartWindowStart] = useState(windowStart);
  const chartWindowStartRef = useRef(windowStart);
  const rangeAnimationFrameRef = useRef<number | null>(null);
  const [isRangeTransitioning, setIsRangeTransitioning] = useState(false);
  const chartDataStart = Math.min(chartWindowStart, windowStart);

  useEffect(() => {
    if (rangeAnimationFrameRef.current !== null) {
      cancelAnimationFrame(rangeAnimationFrameRef.current);
      rangeAnimationFrameRef.current = null;
    }

    const from = chartWindowStartRef.current;
    const to = windowStart;

    if (reduceMotion || Math.abs(from - to) < 1) {
      chartWindowStartRef.current = to;
      setChartWindowStart(to);
      setIsRangeTransitioning(false);
      return;
    }

    const duration = 460;
    const startedAt = performance.now();
    setIsRangeTransitioning(true);

    const animateRange = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - Math.pow(1 - progress, 4);
      const nextStart = from + (to - from) * eased;

      chartWindowStartRef.current = nextStart;
      setChartWindowStart(nextStart);

      if (progress < 1) {
        rangeAnimationFrameRef.current = requestAnimationFrame(animateRange);
      } else {
        rangeAnimationFrameRef.current = null;
        setIsRangeTransitioning(false);
      }
    };

    rangeAnimationFrameRef.current = requestAnimationFrame(animateRange);

    return () => {
      if (rangeAnimationFrameRef.current !== null) {
        cancelAnimationFrame(rangeAnimationFrameRef.current);
        rangeAnimationFrameRef.current = null;
      }
    };
  }, [windowStart, reduceMotion]);

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
      .filter((p: any) => p.time >= chartDataStart && p.time <= windowEnd)
      .sort((a: any, b: any) => a.time - b.time)
      .filter(
        (p: any, idx: number, arr: any[]) =>
          idx === 0 || p.time !== arr[idx - 1].time,
      );

    const maxPoints = 1000;
    if (cleaned.length <= maxPoints) {
      return [
        ...cleaned,
        { time: chartDataStart, value: null },
        { time: windowEnd, value: null },
      ];
    }

    const start = cleaned[0]?.time;
    const end = cleaned[cleaned.length - 1]?.time;
    if (typeof start !== "number" || typeof end !== "number" || start >= end) {
      return [
        ...cleaned.slice(-maxPoints),
        { time: chartDataStart, value: null },
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
      { time: chartDataStart, value: null },
      { time: windowEnd, value: null },
    ];
  }, [graphPoints, chartDataStart, windowEnd]);

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

  const timeStats = useMemo(() => {
    if (filteredGraphWithValues.length === 0) return null;

    // Time-weighted statistics calculation
    // This provides accurate Time in Range (TIR) even with variable sampling rates
    const sorted = [...filteredGraphWithValues].sort((a: any, b: any) => a.time - b.time);
    
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

    return {
      avg: Math.round(
        sorted.reduce((acc: number, p: any) => acc + p.value, 0) / sorted.length
      ),
      max: Math.max(...sorted.map((p: any) => p.value)),
      min: Math.min(...sorted.map((p: any) => p.value)),
      inRangePct: toPct(dur.inRange),
      durations: dur,
      totalDuration,
      toPct
    };
  }, [filteredGraphWithValues, targetConfig]);

  const getGlucoseColor = (val: number) => {
    if (val === undefined || val === null) return "#94a3b8";
    if (val <= targetConfig.hypo) return "#dc2626";
    if (val < targetConfig.low) return "#f59e0b";
    if (val >= targetConfig.hyper) return "#dc2626";
    if (val > targetConfig.high) return "#f59e0b";
    return "#10b981";
  };

  if (isInitializing) {
    return (
      <main className="flex h-[100dvh] flex-col items-center justify-center overflow-hidden bg-background p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center gap-6"
        >
          <div className="relative">
            <div className="w-20 h-20 bg-primary/10 rounded-3xl flex items-center justify-center animate-pulse">
              <Droplets className="w-10 h-10 text-primary animate-smooth-float" />
            </div>
            <div className="absolute inset-0 border-4 border-primary/20 border-t-primary rounded-3xl animate-spin" />
          </div>
          <div className="text-center">
            <h2 className="text-2xl font-black tracking-tighter italic">
              GLUCOWEB
            </h2>
            <div className="flex items-center gap-2 justify-center mt-2">
              <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              <p className="text-muted-foreground text-[11px] uppercase tracking-[0.3em] font-bold">
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
      <main className="flex min-h-[100dvh] items-center justify-center bg-background p-4">
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
              <CardDescription className="text-[11px] uppercase tracking-widest font-bold">
                Med-Analytics Interface
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label
                    htmlFor="email"
                    className="text-[11px] uppercase font-bold tracking-widest text-muted-foreground"
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
                    className="text-[11px] uppercase font-bold tracking-widest text-muted-foreground"
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
                  <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-[11px] font-bold uppercase tracking-widest border border-destructive/20 flex items-center gap-2">
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
  const onlineThresholdMs = 5 * 60 * 1000;
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



  const stats = timeStats
    ? {
        avg: timeStats.avg,
        max: timeStats.max,
        min: timeStats.min,
        inRange: timeStats.inRangePct,
      }
    : null;

  const rangeStats = timeStats
    ? {
        total: timeStats.totalDuration,
        veryLow: {
          count: timeStats.durations.veryLow,
          pct: timeStats.toPct(timeStats.durations.veryLow),
        },
        low: {
          count: timeStats.durations.low,
          pct: timeStats.toPct(timeStats.durations.low),
        },
        inRange: {
          count: timeStats.durations.inRange,
          pct: timeStats.toPct(timeStats.durations.inRange),
        },
        high: {
          count: timeStats.durations.high,
          pct: timeStats.toPct(timeStats.durations.high),
        },
        veryHigh: {
          count: timeStats.durations.veryHigh,
          pct: timeStats.toPct(timeStats.durations.veryHigh),
        },
      }
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

  const localExtrema = (() => {
    const points = chartGraph.filter(
      (point: any) => typeof point?.time === "number" && typeof point?.value === "number",
    );
    if (points.length < 5) return [];

    type ExtremaCandidate = (typeof points)[number] & {
      extremum: "min" | "max";
      prominence: number;
      absolute: boolean;
    };
    const candidates: ExtremaCandidate[] = [];
    const radius = 2;
    for (let index = radius; index < points.length - radius; index += 1) {
      const point = points[index];
      const left = points.slice(index - radius, index);
      const right = points.slice(index + 1, index + radius + 1);
      const neighbors = [...left, ...right];
      const isMinimum = neighbors.every((neighbor) => point.value <= neighbor.value)
        && neighbors.some((neighbor) => point.value < neighbor.value);
      const isMaximum = neighbors.every((neighbor) => point.value >= neighbor.value)
        && neighbors.some((neighbor) => point.value > neighbor.value);

      if (isMinimum) {
        const prominence = Math.min(
          Math.max(...left.map((neighbor) => neighbor.value)) - point.value,
          Math.max(...right.map((neighbor) => neighbor.value)) - point.value,
        );
        if (prominence >= 6) candidates.push({ ...point, extremum: "min", prominence, absolute: false });
      } else if (isMaximum) {
        const prominence = Math.min(
          point.value - Math.min(...left.map((neighbor) => neighbor.value)),
          point.value - Math.min(...right.map((neighbor) => neighbor.value)),
        );
        if (prominence >= 6) candidates.push({ ...point, extremum: "max", prominence, absolute: false });
      }
    }

    const globalMin = points.reduce((best, point) => point.value < best.value ? point : best);
    const globalMax = points.reduce((best, point) => point.value > best.value ? point : best);
    const prioritized = [
      { ...globalMin, extremum: "min" as const, prominence: Number.POSITIVE_INFINITY, absolute: true },
      { ...globalMax, extremum: "max" as const, prominence: Number.POSITIVE_INFINITY, absolute: true },
      ...candidates.sort((first, second) => second.prominence - first.prominence),
    ];
    const minimumSeparationMs = Math.max(20 * 60_000, (windowEnd - chartDataStart) / 8);
    const eventClearanceMs = Math.max(20 * 60_000, (windowEnd - chartDataStart) * 0.04);
    const visibleEventTimes = events
      .map((event) => new Date(event.occurred_at).getTime())
      .filter((time) => time >= chartDataStart && time <= windowEnd);
    const chartRange = Math.max(1, yMax - yMin);
    const selected: ExtremaCandidate[] = [];
    for (const candidate of prioritized) {
      if (selected.some((item) => item.time === candidate.time)) continue;
      if (!candidate.absolute && selected.some((item) => Math.abs(item.time - candidate.time) < minimumSeparationMs)) continue;
      const isNearTopEdge = candidate.value >= yMax - chartRange * 0.12;
      if (!candidate.absolute && isNearTopEdge && visibleEventTimes.some((time) => Math.abs(time - candidate.time) < eventClearanceMs)) continue;
      selected.push(candidate);
      if (selected.length === 6) break;
    }
    return selected.sort((first, second) => first.time - second.time);
  })();

  const visibleEvents = events.filter((event) => {
    const occurredAt = new Date(event.occurred_at).getTime();
    const endedAt = event.ended_at ? new Date(event.ended_at).getTime() : occurredAt;
    return endedAt >= windowStart && occurredAt <= windowEnd;
  });

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
    const extremum = localExtrema.find((item) => item.time === payload.time);
    if (extremum) return <ExtremumMarker {...props} payload={extremum} />;
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

    const extremum = localExtrema.find((item) => item.time === payload.time);
    if (extremum) return <ExtremumMarker {...props} payload={extremum} />;
    if (!showDots) return null;

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

  const ExtremumMarker = (props: any) => {
    const { cx, cy, payload } = props;
    if (typeof cx !== "number" || typeof cy !== "number" || typeof payload?.value !== "number") return null;
    const color = getGlucoseColor(payload.value);
    const labelY = payload.extremum === "max" ? cy - 8 : cy + 13;
    return (
      <g aria-hidden="true" className="pointer-events-none">
        <circle cx={cx} cy={cy} r={3} fill={color} stroke="var(--background)" strokeWidth={1.5} />
        <text x={cx} y={labelY} textAnchor="middle" fill={color} fontSize={9} fontWeight={800} paintOrder="stroke" stroke="var(--background)" strokeWidth={3} strokeLinejoin="round">
          {Math.round(payload.value)}
        </text>
      </g>
    );
  };

  return (
    <main className="flex h-[100dvh] min-h-[100dvh] max-w-full flex-col overflow-hidden bg-background text-xs text-foreground transition-colors duration-300">
      {/* Header */}
      <header className="z-10 flex-none border-b bg-background/80 px-3 py-2 backdrop-blur-md sm:px-4">
        <div className="mx-auto flex max-w-[1100px] items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center shadow-lg shadow-primary/10">
              <Droplets className="w-5 h-5 text-primary-foreground" />
            </div>
            <div
              className="flex flex-col cursor-pointer"
              onClick={() => setActiveView("dashboard")}
            >
              <h1 className="hidden text-base font-black italic leading-none tracking-tighter min-[360px]:block">
                GLUCOWEB
              </h1>
              <span className="mt-0.5 hidden text-[11px] font-bold uppercase leading-none tracking-widest text-muted-foreground opacity-60 min-[380px]:block">
                PRO INTERFACE V2.5
              </span>
            </div>
          </div>

            <nav aria-label="Navegación principal" className="hidden items-center gap-1 rounded-lg border border-border/50 bg-muted/50 p-1 sm:flex">
              <button
                onClick={() => setActiveView("dashboard")}
                className={`min-h-11 flex-1 rounded-md px-3 py-1 text-[11px] font-bold uppercase tracking-widest transition-all sm:min-h-8 sm:flex-none ${
                  activeView === "dashboard" 
                    ? "bg-background shadow-sm text-primary" 
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Monitor
              </button>
              <button
                onClick={() => setActiveView("analysis")}
                className={`min-h-11 flex-1 rounded-md px-3 py-1 text-[11px] font-bold uppercase tracking-widest transition-all sm:min-h-8 sm:flex-none ${
                  activeView === "analysis" 
                    ? "bg-background shadow-sm text-primary" 
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Análisis
              </button>
            </nav>

          <div className="flex shrink-0 items-center gap-1 sm:gap-4">
            <div className="text-right hidden sm:block">
              <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-[0.2em] leading-none mb-1">
                Monitorización Activa
              </p>
              <p className="font-bold text-xs leading-none">
                {patient.firstName} {patient.lastName}
              </p>
            </div>
            <div className="flex items-center gap-1 border-l border-border/50 pl-1 sm:gap-2 sm:pl-4">
              {session?.token ? (
                <EventCenter
                  ref={eventCenterRef}
                  session={session}
                  events={events}
                  visibleFrom={windowStart}
                  visibleTo={windowEnd}
                  loading={eventsLoading}
                  error={eventsError}
                  onRefresh={loadEvents}
                  onChanged={loadEvents}
                  insulins={insulins}
                />
              ) : null}
              <ModeToggle />
              <Button
                variant="ghost"
                size="icon"
                className={`hidden h-8 w-8 rounded-md transition-colors sm:inline-flex ${
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
                className="h-11 w-11 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground sm:h-8 sm:w-8"
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
      <div className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden bg-muted/5 p-2.5 pb-[calc(5.25rem+env(safe-area-inset-bottom))] sm:p-3 md:p-4">
        <div className="mx-auto h-full min-w-0 max-w-[1100px]">
          {activeView === "analysis" ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex h-full flex-col gap-2"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-base font-black tracking-tight sm:text-lg">Análisis</h2>
                  <p className="hidden text-[11px] text-muted-foreground sm:block">Perfil diario y métricas del período</p>
                </div>
                <div className="grid shrink-0 grid-cols-4 gap-0.5 rounded-lg bg-muted/60 p-0.5" aria-label="Ventana de análisis">
                  {[7, 14, 30, 90].map((d) => (
                    <button
                      key={d}
                      onClick={() => setAnalysisDays(d)}
                      aria-pressed={analysisDays === d}
                      className={`min-h-9 rounded-md px-2 text-[10px] font-bold transition-colors sm:min-h-8 sm:px-3 ${
                        analysisDays === d 
                          ? "bg-background text-primary shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {d} d
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex-1 flex flex-col min-h-0">
                  <AnalysisView 
                    history={historicalData} 
                    targetConfig={targetConfig} 
                    days={analysisDays} 
                    preCalculatedStats={analysisStats}
                    preCalculatedPercentiles={analysisPercentiles}
                    loading={loadingAnalysis}
                  />
              </div>
            </motion.div>
          ) : activeView === "dashboard" ? (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex h-full flex-col gap-2"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-base font-black tracking-tight sm:text-lg">Monitor</h2>
                  <p className="hidden text-[11px] text-muted-foreground sm:block">Lecturas y distribución del período</p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <div className="grid grid-cols-5 gap-0.5 rounded-lg bg-muted/60 p-0.5" aria-label="Ventana del monitor">
                    {[1, 3, 6, 12, 24].map((h) => (
                      <button
                        key={h}
                        type="button"
                        onClick={() => setTimeRange(h)}
                        aria-pressed={timeRange === h}
                        className={`min-h-9 rounded-md px-1.5 text-[10px] font-bold transition-colors sm:min-h-8 sm:px-2.5 ${
                          timeRange === h
                            ? "bg-background text-primary shadow-sm"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {h} h
                      </button>
                    ))}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={`h-9 w-9 shrink-0 rounded-lg transition-colors sm:h-8 sm:w-8 ${
                      showLine
                        ? "bg-muted/60 text-primary"
                        : "text-muted-foreground hover:bg-muted"
                    }`}
                    onClick={() => setShowLine(!showLine)}
                    aria-label={showLine ? "Ocultar línea" : "Mostrar línea"}
                    aria-pressed={showLine}
                  >
                    {showLine ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 flex-1">
                {/* Left Column - Main View */}
                <div className="lg:col-span-9 flex flex-col gap-3 min-w-0 h-full">
                  {/* Top Metrics Bar */}
                  <div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-12">
                    <Card className="relative h-[104px] overflow-hidden rounded-xl border border-border/60 bg-card/45 shadow-sm md:col-span-3">
                      <div
                        className={`absolute top-0 left-0 bottom-0 w-1 ${
                          displayGlucose
                            ? status.label === "OBJETIVO"
                              ? "bg-emerald-500"
                              : status.badge
                            : "bg-muted-foreground/40"
                        }`}
                      />
                      <CardContent className="flex h-full flex-col justify-between gap-2 p-3 sm:p-3.5">
                        <div className="flex min-h-6 items-center justify-between gap-2">
                          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                            <Droplets className="h-3.5 w-3.5" />
                          </div>
                          <p className="min-w-0 truncate text-right text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                            Glucosa actual
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex min-w-0 items-baseline gap-1">
                            <motion.span
                              key={displayGlucose?.value ?? "no-data"}
                              initial={{ opacity: 0, scale: 0.9 }}
                              animate={{ opacity: 1, scale: 1 }}
                              className={`font-numbers text-4xl font-extrabold tabular-nums tracking-tighter sm:text-5xl ${status.color}`}
                            >
                              {displayGlucose ? displayGlucose.value : "--"}
                            </motion.span>
                            <span className="text-[8px] font-bold uppercase text-muted-foreground opacity-60 sm:text-[10px]">
                              {unit}
                            </span>
                          </div>
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted/70 text-foreground sm:h-10 sm:w-10">
                            {displayGlucose ? (
                              getTrendIcon(
                                calculatedTrend,
                                displayGlucose.value,
                              )
                            ) : (
                              <Clock className="h-6 w-6 text-muted-foreground" />
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="h-[104px] rounded-xl border border-border/60 bg-card/45 shadow-sm md:col-span-3">
                      <CardContent className="flex h-full flex-col justify-between p-3 sm:p-3.5">
                        <div className="flex min-h-6 items-center justify-between gap-2">
                          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-500">
                            <Target className="h-3.5 w-3.5" />
                          </div>
                          <p className="min-w-0 truncate text-right text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                            Tiempo en rango
                          </p>
                        </div>
                        <div className="flex items-baseline gap-1">
                          <span className="text-2xl font-black text-emerald-500 tabular-nums font-numbers">
                            {stats?.inRange}%
                          </span>
                          <span className="text-[8px] text-muted-foreground font-bold">
                            EN OBJETIVO
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

                    <Card className="h-[104px] rounded-xl border border-border/60 bg-card/45 shadow-sm md:col-span-3">
                      <CardContent className="flex h-full flex-col justify-between p-3 sm:p-3.5">
                        <div className="flex min-h-6 items-center justify-between gap-2">
                          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                            <Activity className="h-3.5 w-3.5" />
                          </div>
                          <p className="min-w-0 truncate text-right text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                            Glucosa media
                          </p>
                        </div>
                        <div className="flex items-baseline gap-1">
                          <span className="text-2xl font-black tabular-nums font-numbers">
                            {stats?.avg}
                          </span>
                          <span className="text-[8px] text-muted-foreground font-bold uppercase">
                            {unit}
                          </span>
                        </div>
                        <p className="text-[8px] font-bold text-muted-foreground">
                          Durante las últimas {timeRange} h
                        </p>
                      </CardContent>
                    </Card>

                    <Card className="h-[104px] rounded-xl border border-border/60 bg-card/45 shadow-sm md:col-span-3">
                      <CardContent className="flex h-full flex-col justify-between p-3 sm:p-3.5">
                        <div className="flex min-h-6 items-center justify-between gap-2">
                          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                            <TrendingUp className="h-3.5 w-3.5" />
                          </div>
                          <p className="min-w-0 truncate text-right text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                            Rango del período
                          </p>
                        </div>
                        <div className="flex items-baseline gap-1">
                          <span className="font-numbers text-2xl font-black tabular-nums">
                            {stats ? `${stats.min}–${stats.max}` : "--"}
                          </span>
                          <span className="text-[8px] font-bold uppercase text-muted-foreground">
                            {unit}
                          </span>
                        </div>
                        <p className="text-[8px] font-bold text-muted-foreground">Mínimo–máximo</p>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Chart Card */}
                  <Card className="shadow-sm border flex flex-col flex-1 min-h-[320px] overflow-hidden bg-card/20">
                    <CardHeader className="grid-cols-[minmax(0,1fr)_auto] border-b bg-muted/10 px-3 py-2.5 sm:px-4 sm:py-2">
                      <CardTitle className="text-[10px] font-bold uppercase tracking-[0.18em] opacity-75">
                        Historial Analítico
                      </CardTitle>
                      <span className="col-start-2 row-start-1 whitespace-nowrap text-[9px] font-semibold tabular-nums text-muted-foreground" aria-label={`Escala del gráfico hasta ${yMax} miligramos por decilitro`}>
                        Escala {yMax} mg/dL
                      </span>
                    </CardHeader>
                    <CardContent className="flex flex-1 flex-col p-0">
                      <div
                        className="glucose-chart-stage relative h-[clamp(300px,52dvh,460px)] min-h-0 min-w-0 flex-1 overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:min-h-[420px]"
                        tabIndex={0}
                        aria-label="Historial de glucosa. Usá el menú contextual para registrar un evento en un momento del gráfico."
                        onContextMenu={(event) => {
                          event.preventDefault();
                          openChartContextMenu(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect());
                        }}
                        onKeyDown={(event) => {
                          if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) return;
                          event.preventDefault();
                          const rect = event.currentTarget.getBoundingClientRect();
                          openChartContextMenu(rect.left + rect.width / 2, rect.top + rect.height / 2, rect);
                        }}
                      >
                        <ResponsiveContainer width="100%" height="100%">
                          <ComposedChart
                            data={chartGraph}
                            margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
                          >
                            {(() => {
                              const gradientId = `lineGluc-${timeRange}-${dataMin}-${dataMax}`;
                              return (
                                <>
                                  <defs>
                                    <linearGradient
                                      id={gradientId}
                                      x1="0"
                                      y1="1"
                                      x2="0"
                                      y2="0"
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
                                  {visibleEvents.flatMap((event) => {
                                    const occurredAt = new Date(event.occurred_at).getTime();
                                    const endedAt = event.ended_at ? new Date(event.ended_at).getTime() : null;
                                    const eventColor = chartEventColor(event.type);
                                    return [
                                      event.type === "exercise" && endedAt ? (
                                        <ReferenceArea
                                          key={`${event.id}-area`}
                                          x1={occurredAt}
                                          x2={endedAt}
                                          fill={eventColor}
                                          fillOpacity={0.08}
                                          stroke={eventColor}
                                          strokeOpacity={0.35}
                                          ifOverflow="hidden"
                                        />
                                      ) : null,
                                      <ReferenceLine
                                        key={`${event.id}-marker`}
                                        x={occurredAt}
                                        stroke={eventColor}
                                        strokeWidth={1}
                                        strokeDasharray="3 3"
                                        ifOverflow="hidden"
                                        label={<EventChartMarker event={event} onSelect={(selectedEvent) => eventCenterRef.current?.openEvent(selectedEvent)} tooltipOpen={hoveredChartEventId === event.id} onTooltipVisibilityChange={(open) => setHoveredChartEventId(open ? event.id : null)} />}
                                      />
                                    ];
                                  })}
                                  <XAxis
                                    dataKey="time"
                                    type="number"
                                    domain={[chartWindowStart, windowEnd]}
                                    allowDataOverflow={true}
                                    ticks={xTicks}
                                    interval={0}
                                    hide
                                    minTickGap={0}
                                  />
                                  <YAxis
                                    domain={[yMin, yMax]}
                                    ticks={yTicks}
                                    hide
                                  />
                                  <Tooltip
                                    offset={CHART_TOOLTIP_OFFSET}
                                    allowEscapeViewBox={{ x: false, y: true }}
                                    wrapperStyle={CHART_TOOLTIP_WRAPPER_STYLE}
                                    cursor={{
                                      stroke: "var(--muted-foreground)",
                                      strokeOpacity: 0.15,
                                      strokeWidth: 1.5,
                                      strokeDasharray: "4 4",
                                    }}
                                    content={({ active, payload, label }) => {
                                      if (hoveredChartEventId) return null;
                                      if (active && payload && payload.length) {
                                        const glucoseItem = payload.find(
                                          (p) => p.dataKey === "value" && p.name === "GLUCOSA",
                                        );
                                        if (
                                          !glucoseItem ||
                                          glucoseItem.value === null
                                        )
                                          return null;

                                        const val = Number(glucoseItem.value);
                                        const status = getGlucoseStatus(val);

                                        return (
                                          <div className="min-w-[124px] rounded-lg border border-border/50 bg-card/80 p-2 shadow-lg backdrop-blur-md">
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
                                    fill="#dc2626"
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
                                    fill="#dc2626"
                                    fillOpacity={0.03}
                                  />

                                  <ReferenceLine
                                    y={targetConfig.hyper}
                                    stroke="#dc2626"
                                    strokeDasharray="6 3"
                                    strokeWidth={1}
                                    opacity={0.6}
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
                                      stroke="#dc2626"
                                      strokeDasharray="3 2"
                                      strokeWidth={1}
                                      opacity={0.6}
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
                                        enableAnimation
                                          ? CHART_SERIES_ANIMATION_DURATION_MS
                                          : 0
                                      }
                                      animationEasing={CHART_SERIES_ANIMATION_EASING}
                                      isAnimationActive={
                                        enableAnimation &&
                                        !isRangeTransitioning &&
                                        !reduceMotion
                                      }
                                      connectNulls={true}
                                      dot={<CustomDot />}
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
                                      isAnimationActive={
                                        enableAnimation &&
                                        !isRangeTransitioning &&
                                        !reduceMotion
                                      }
                                      animationDuration={
                                        enableAnimation
                                          ? CHART_SERIES_ANIMATION_DURATION_MS
                                          : 0
                                      }
                                      animationEasing={CHART_SERIES_ANIMATION_EASING}
                                    />
                                  )}
                                </>
                              );
                            })()}
                          </ComposedChart>
                        </ResponsiveContainer>
                        <div className="pointer-events-none absolute inset-x-2 bottom-2 flex items-end justify-between text-[10px] font-bold tabular-nums text-foreground/70">
                          <span className="rounded-md bg-card/80 px-1.5 py-0.5 backdrop-blur-sm">
                            {new Date(chartWindowStart).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </span>
                          <span className="rounded-md bg-card/80 px-1.5 py-0.5 backdrop-blur-sm">
                            {new Date(windowEnd).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </div>
                        {chartContextMenu ? (
                          <ChartEventContextMenu
                            menu={chartContextMenu}
                            onClose={() => setChartContextMenu(null)}
                            onSelect={(eventType) => {
                              eventCenterRef.current?.openNewAt(chartContextMenu.occurredAt, eventType);
                              setChartContextMenu(null);
                            }}
                          />
                        ) : null}
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
                          Diagnóstico de salud
                        </p>

                        <div className="flex items-center justify-between">
                          <span className="max-w-[9rem] truncate text-[8px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                            Última sincronización
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
                            Sincronización
                          </span>
                          <span className="text-[10px] font-black tabular-nums font-numbers text-primary">
                            {secondsUntilRefresh}s
                          </span>
                        </div>

                        <Button
                          className="min-h-11 w-full text-[11px] font-bold uppercase tracking-wide shadow-sm transition-transform active:scale-95 sm:h-7 sm:min-h-0 sm:text-[8px] sm:tracking-[0.15em]"
                          onClick={() => fetchData()}
                          disabled={loading}
                          variant="secondary"
                        >
                          <RefreshCw
                            className={`w-3.5 h-3.5 mr-2 ${
                              loading ? "animate-spin" : ""
                            }`}
                          />
                          Sincronizar ahora
                        </Button>
                      </CardContent>
                    </Card>

                    <Card className="border bg-card/30">
                      <CardContent className="p-3.5 space-y-2">
                        <p className="text-[8px] font-bold text-muted-foreground uppercase tracking-[0.2em]">
                          Tiempo en rangos
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
                            Perfil clínico
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
                    CONFIGURACIÓN GENERAL
                  </h2>
                    <p className="max-w-[28rem] truncate text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                    Umbrales clínicos
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
                      <CardDescription className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                        Define los límites para alertas y análisis
                      </CardDescription>
                    </div>
                  </CardHeader>
                  <CardContent className="p-6 space-y-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <Label className="text-[11px] font-black uppercase tracking-widest text-red-500">
                            HIPO
                          </Label>
                          <Badge className="bg-red-500 h-4 text-[11px] font-black">
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
                        <p className="text-[11px] text-muted-foreground font-medium italic opacity-60">
                          Umbral hipoglucemia grave
                        </p>
                      </div>

                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <Label className="text-[11px] font-black uppercase tracking-widest text-amber-500">
                            Bajo
                          </Label>
                          <Badge className="bg-amber-500 h-4 text-[11px] font-black">
                            ATENCIÓN
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
                        <p className="text-[11px] text-muted-foreground font-medium italic opacity-60">
                          Inicio de rango objetivo
                        </p>
                      </div>

                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <Label className="text-[11px] font-black uppercase tracking-widest text-amber-500">
                            Alto
                          </Label>
                          <Badge className="bg-amber-500 h-4 text-[11px] font-black">
                            ATENCIÓN
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
                        <p className="text-[11px] text-muted-foreground font-medium italic opacity-60">
                          Fin de rango objetivo
                        </p>
                      </div>

                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <Label className="text-[11px] font-black uppercase tracking-widest text-red-500">
                            HIPER
                          </Label>
                          <Badge className="bg-red-500 h-4 text-[11px] font-black">
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
                        <p className="text-[11px] text-muted-foreground font-medium italic opacity-60">
                          Umbral hiperglucemia grave
                        </p>
                      </div>
                    </div>

                    <div className="p-4 rounded-lg bg-primary/5 border border-primary/10">
                      <div className="flex gap-3">
                        <AlertCircle className="w-5 h-5 text-primary shrink-0" />
                        <div className="space-y-1">
                          <p className="text-[11px] font-black uppercase tracking-widest text-primary">
                            Información de Sistema
                          </p>
                          <p className="text-[11px] text-muted-foreground leading-relaxed">
                            Estos valores afectan directamente a los cálculos de{" "}
                              <strong>Tiempo en rango</strong>, las alertas visuales
                            de colores y las líneas de referencia en el gráfico
                            analítico. Los cambios se guardan automáticamente en
                            tu sesión local.
                          </p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border bg-card/40 md:col-span-2">
                  <CardHeader className="flex flex-row items-center gap-4 px-4 pb-3 pt-5 sm:px-6 sm:pt-6">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Syringe className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <CardTitle className="text-sm font-black uppercase tracking-tight">Insulinas del paciente</CardTitle>
                      <CardDescription className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground sm:tracking-widest">Se muestran como acceso rápido al registrar una dosis</CardDescription>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3 p-4 pt-2 sm:p-6 sm:pt-3">
                    {insulins.map((insulin, index) => (
                      <div key={insulin.id ?? index} className="grid grid-cols-[minmax(0,1fr)_minmax(8rem,0.7fr)_2.75rem] gap-2">
                        <div className="space-y-1">
                          <Label htmlFor={`insulin-name-${index}`} className="sr-only">Nombre de insulina {index + 1}</Label>
                          <Input id={`insulin-name-${index}`} value={insulin.name} maxLength={80} placeholder="Nombre comercial" onChange={(event) => setInsulins((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item))} className="h-11" />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor={`insulin-type-${index}`} className="sr-only">Tipo de insulina {index + 1}</Label>
                          <select id={`insulin-type-${index}`} value={insulin.insulin_type} onChange={(event) => setInsulins((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, insulin_type: event.target.value as PatientInsulin["insulin_type"] } : item))} className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm">
                            {INSULIN_TYPES.map((type) => <option key={type} value={type}>{INSULIN_TYPE_LABELS[type]}</option>)}
                          </select>
                        </div>
                        <Button type="button" variant="ghost" size="icon" disabled={insulins.length === 1} onClick={() => setInsulins((current) => current.filter((_, itemIndex) => itemIndex !== index).map((item, itemIndex) => ({ ...item, sort_order: itemIndex })))} className="h-11 w-11 text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /><span className="sr-only">Quitar {insulin.name || `insulina ${index + 1}`}</span></Button>
                      </div>
                    ))}
                    <div className="flex flex-col gap-2 border-t pt-3 sm:flex-row sm:items-center sm:justify-between">
                      <Button type="button" variant="outline" disabled={insulins.length >= 6} onClick={() => setInsulins((current) => [...current, { name: "", insulin_type: "rapid", sort_order: current.length }])} className="min-h-11 gap-2"><Plus className="h-4 w-4" />Agregar insulina</Button>
                      <Button type="button" disabled={insulinsLoading || insulinsSaving || insulins.some((item) => !item.name.trim())} onClick={() => void saveInsulins()} className="min-h-11 gap-2"><Save className="h-4 w-4" />{insulinsSaving ? "Guardando…" : "Guardar insulinas"}</Button>
                    </div>
                    {insulinsMessage ? <p role="status" className="text-xs text-muted-foreground">{insulinsMessage}</p> : null}
                  </CardContent>
                </Card>

                <Card className="border bg-card/10 md:col-span-2">
                  <CardContent className="flex flex-col items-stretch gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-0.5">
                        Estado de Sincronización
                      </p>
                      <p className="text-[11px] font-black">
                        ALMACENAMIENTO LOCAL ACTIVO
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      className="min-h-11 w-full border-primary/20 text-[11px] font-black uppercase tracking-wide text-primary hover:bg-primary/10 sm:h-8 sm:min-h-0 sm:w-auto sm:tracking-widest"
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

      <nav
        aria-label="Navegación principal"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-background/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_rgba(0,0,0,0.08)] backdrop-blur-xl sm:hidden"
      >
        <div className="mx-auto grid max-w-md grid-cols-3 gap-1 px-2 pt-1.5">
          {([
            { view: "dashboard" as const, label: "Monitor", Icon: Droplets },
            { view: "analysis" as const, label: "Análisis", Icon: Activity },
            { view: "settings" as const, label: "Ajustes", Icon: Settings },
          ]).map(({ view, label, Icon }) => {
            const isActive = activeView === view;

            return (
              <button
                key={view}
                type="button"
                aria-current={isActive ? "page" : undefined}
                onClick={() => setActiveView(view)}
                className={`flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-xl px-2 py-1 text-[10px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:bg-muted ${
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground"
                }`}
              >
                <span
                  className={`flex h-7 min-w-10 items-center justify-center rounded-full transition-colors ${
                    isActive ? "bg-primary/12" : "bg-transparent"
                  }`}
                >
                  <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
                </span>
                <span>{label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Footer */}
      <footer className="z-10 hidden flex-none border-t bg-background px-4 py-1.5 sm:block">
        <div className="mx-auto flex max-w-[1100px] items-center justify-center text-muted-foreground sm:justify-between">
          <p className="hidden text-[11px] font-bold uppercase tracking-[0.4em] opacity-30 sm:block">
            GlucoWeb Biomedical Interface • Engine v2.5.0-Release
          </p>
          <div className="flex items-center gap-5">
            <div className="flex items-center gap-1.5 opacity-40">
              <div className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />
              <a
                href="https://github.com/josemqu"
                target="_blank"
                rel="noreferrer"
                className="text-[11px] font-bold tracking-[0.2em] uppercase text-emerald-500 hover:underline"
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
