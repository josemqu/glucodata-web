"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const TOOLTIP_EXIT_TIMEOUT_MS = 3000;

export function useChartTooltipTimeout() {
  const [tooltipsEnabled, setTooltipsEnabled] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelTimeout = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const resumeTooltips = useCallback(() => {
    cancelTimeout();
    setTooltipsEnabled(true);
  }, [cancelTimeout]);

  const scheduleDismissal = useCallback(() => {
    // Repeated exit/blur events must not extend the three-second deadline.
    if (timer.current !== null) return;
    timer.current = setTimeout(() => {
      timer.current = null;
      setTooltipsEnabled(false);
    }, TOOLTIP_EXIT_TIMEOUT_MS);
  }, []);

  useEffect(() => {
    const dismiss = () => {
      cancelTimeout();
      setTooltipsEnabled(false);
    };
    window.addEventListener("blur", dismiss);
    return () => {
      cancelTimeout();
      window.removeEventListener("blur", dismiss);
    };
  }, [cancelTimeout]);

  return { tooltipsEnabled, resumeTooltips, scheduleDismissal };
}
