"use client";

import { useId, useSyncExternalStore } from "react";

const motionQuery = "(prefers-reduced-motion: reduce)";
function subscribeMotion(onChange: () => void) {
  const media = window.matchMedia(motionQuery);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}
const readMotion = () => window.matchMedia(motionQuery).matches;
const serverMotion = () => true;

// Original Lucide Droplets geometry, kept intact across the relief layers.
const droplets = "M7 16.3c2.2 0 4-1.83 4-4.05 0-1.16-.57-2.26-1.71-3.19S7.29 6.75 7 5.3c-.29 1.45-1.14 2.84-2.29 3.76S3 11.1 3 12.25c0 2.22 1.8 4.05 4 4.05z M12.56 6.6A10.97 10.97 0 0 0 14 3.02c.5 2.5 2 4.9 4 6.5s3 3.5 3 5.5a6.98 6.98 0 0 1-11.91 4.97";

export function StartupMark() {
  const id = useId().replace(/:/g, "");
  const reduceMotion = useSyncExternalStore(subscribeMotion, readMotion, serverMotion);
  const relief = `${id}-relief`;
  const recess = `${id}-recess`;

  function light() {
    return (
      <fePointLight x="-40" y="15" z="95">
        {reduceMotion === false ? <>
          <animate attributeName="x" values="-80;210;-80" dur="5s" repeatCount="indefinite" />
          <animate attributeName="y" values="10;70;10" dur="5s" repeatCount="indefinite" />
        </> : null}
      </fePointLight>
    );
  }

  return (
    <svg className="startup-seal" viewBox="0 0 144 144" fill="none" aria-hidden="true">
      <defs>
        {[{ name: relief, depth: 5 }, { name: recess, depth: -3 }].map(({ name, depth }) => (
          <filter key={name} id={name} x="-20%" y="-20%" width="140%" height="140%" colorInterpolationFilters="sRGB">
            <feGaussianBlur in="SourceAlpha" stdDeviation="1.3" result="height" />
            <feDiffuseLighting in="height" surfaceScale={depth} diffuseConstant="0.75" lightingColor="white" result="diffuse">
              {light()}
            </feDiffuseLighting>
            <feComposite in="diffuse" in2="SourceAlpha" operator="in" result="clippedLight" />
            <feBlend in="SourceGraphic" in2="clippedLight" mode="multiply" result="shaded" />
            <feSpecularLighting in="height" surfaceScale={depth} specularConstant="0.85" specularExponent="28" lightingColor="white" result="specular">
              {light()}
            </feSpecularLighting>
            <feComposite in="specular" in2="SourceAlpha" operator="in" result="clippedSpecular" />
            <feComposite in="clippedSpecular" in2="shaded" operator="arithmetic" k1="0" k2="0.8" k3="1" k4="0" />
          </filter>
        ))}
        <linearGradient id={`${id}-material`} x1="22" y1="16" x2="112" y2="132" gradientUnits="userSpaceOnUse">
          <stop stopColor="var(--startup-seal-light)" />
          <stop offset="0.48" stopColor="var(--primary)" />
          <stop offset="1" stopColor="var(--startup-seal-dark)" />
        </linearGradient>
      </defs>
      <rect x="16" y="14" width="112" height="112" rx="33" fill={`url(#${id}-material)`} filter={`url(#${relief})`} />
      <rect x="25" y="23" width="94" height="94" rx="25" fill="var(--primary)" filter={`url(#${recess})`} />
      <g transform="translate(30 25) scale(3.5)" strokeLinecap="round" strokeLinejoin="round">
        <path d={droplets} transform="translate(0 .65)" stroke="var(--startup-seal-dark)" strokeWidth="2.5" />
        <path d={droplets} stroke="var(--startup-seal-light)" strokeWidth="2.15" filter={`url(#${relief})`} />
      </g>
    </svg>
  );
}
