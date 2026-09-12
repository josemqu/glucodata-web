"use client";

import { useYAxisScale } from "recharts";

export function GlucoseLineGradient({
  id,
  minimum,
  maximum,
  thresholds,
  getColor,
}: {
  id: string;
  minimum: number;
  maximum: number;
  thresholds: number[];
  getColor: (value: number) => string;
}) {
  const scale = useYAxisScale();
  if (!scale || maximum <= minimum) return null;

  // Anchor colors to the axis, not the path bounding box: that box changes
  // with offscreen readings, flat curves, and live series animations.
  const stops = [
    { value: minimum, color: getColor(minimum) },
    ...thresholds
      .filter((value) => value > minimum && value < maximum)
      .sort((a, b) => a - b)
      .flatMap((value) => [
        { value, color: getColor(value - 1) },
        { value, color: getColor(value + 1) },
      ]),
    { value: maximum, color: getColor(maximum) },
  ];

  return (
    <linearGradient
      id={id}
      gradientUnits="userSpaceOnUse"
      x1={0}
      x2={0}
      y1={scale(minimum)}
      y2={scale(maximum)}
    >
      {stops.map((stop, index) => (
        <stop
          key={index}
          offset={(stop.value - minimum) / (maximum - minimum)}
          stopColor={stop.color}
        />
      ))}
    </linearGradient>
  );
}
