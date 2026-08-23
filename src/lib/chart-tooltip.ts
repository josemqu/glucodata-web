import type { CSSProperties } from "react";

export const CHART_TOOLTIP_OFFSET = 22;

export const CHART_TOOLTIP_WRAPPER_STYLE: CSSProperties = {
  outline: "none",
  pointerEvents: "none",
};

export const CHART_TOOLTIP_CONTENT_STYLE: CSSProperties = {
  borderRadius: 10,
  border: "1px solid color-mix(in oklab, var(--border) 65%, transparent)",
  background: "color-mix(in oklab, var(--popover) 80%, transparent)",
  boxShadow: "0 8px 24px rgb(0 0 0 / 0.16)",
  backdropFilter: "blur(10px) saturate(1.1)",
  fontSize: 12,
};
