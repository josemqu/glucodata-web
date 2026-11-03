"use client";

import { useEffect, useRef } from "react";
import { usePlotArea } from "recharts";

/** Reveals the percentile strokes near the pointer without rerendering the chart. */
export function AgpHoverMask({ id }: { id: string }) {
  const plot = usePlotArea();
  const gradientRef = useRef<SVGLinearGradientElement>(null);
  const revealRef = useRef<SVGRectElement>(null);
  const { x = 0, y = 0, width = 0, height = 0 } = plot ?? {};

  useEffect(() => {
    const gradient = gradientRef.current;
    const reveal = revealRef.current;
    const svg = gradient?.ownerSVGElement;
    if (!svg || !gradient || !reveal) return;

    const hide = () => reveal.setAttribute("opacity", "0");
    const move = (event: PointerEvent) => {
      const matrix = svg.getScreenCTM();
      if (event.pointerType === "touch" || !matrix) return hide();
      const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
      if (point.x < x || point.x > x + width || point.y < y || point.y > y + height) {
        return hide();
      }
      gradient.setAttribute("gradientTransform", `translate(${point.x} 0)`);
      reveal.setAttribute("opacity", "1");
    };

    svg.addEventListener("pointermove", move, { passive: true });
    svg.addEventListener("pointerleave", hide);
    svg.addEventListener("pointercancel", hide);
    window.addEventListener("blur", hide);
    return () => {
      hide();
      svg.removeEventListener("pointermove", move);
      svg.removeEventListener("pointerleave", hide);
      svg.removeEventListener("pointercancel", hide);
      window.removeEventListener("blur", hide);
    };
  }, [x, y, width, height]);

  const radius = Math.min(100, width * 0.2);
  return (
    <defs>
      <linearGradient ref={gradientRef} id={`${id}-gradient`} gradientUnits="userSpaceOnUse" x1={-radius} x2={radius} y1={0} y2={0}>
        <stop offset="0%" stopColor="white" stopOpacity={0} />
        <stop offset="25%" stopColor="white" stopOpacity={0.3} />
        <stop offset="50%" stopColor="white" />
        <stop offset="75%" stopColor="white" stopOpacity={0.3} />
        <stop offset="100%" stopColor="white" stopOpacity={0} />
      </linearGradient>
      <mask id={id} maskUnits="userSpaceOnUse" maskContentUnits="userSpaceOnUse" x={x} y={y} width={width} height={height}>
        <rect ref={revealRef} x={x} y={y} width={width} height={height} fill={`url(#${id}-gradient)`} opacity={0} />
      </mask>
    </defs>
  );
}
