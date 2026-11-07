import { useId } from "react";
import { Droplets } from "lucide-react";
import { cn } from "@/lib/utils";
import styles from "./loading-spinner.module.css";

export function LoadingSpinner({ className, label }: { className?: string; label?: string }) {
  return (
    <svg
      viewBox="0 0 80 80"
      fill="none"
      className={cn("size-4 shrink-0 overflow-visible", className)}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <rect x="4" y="4" width="72" height="72" rx="20" stroke="currentColor" className={styles.track} />
      <rect x="4" y="4" width="72" height="72" rx="20" pathLength="100" stroke="currentColor" strokeLinecap="round" className={styles.light} />
    </svg>
  );
}

export function GlucoLoadingSpinner({ className }: { className?: string }) {
  const rimFilterId = useId();

  return (
    <div aria-hidden="true" className={cn("relative grid size-20 shrink-0 place-items-center text-primary [--spinner-stroke:4]", className)}>
      <div className="absolute inset-0 rounded-[30%] bg-primary/10 motion-safe:animate-pulse" />
      {/* Center the visible Lucide path, whose vertical midpoint is near 12.5. */}
      <Droplets viewBox="0 0.5 24 24" className="relative size-1/2" />
      <div className={cn(styles.reflection, "pointer-events-none absolute inset-0 grid place-items-center")}>
        <Droplets viewBox="0 0.5 24 24" className="size-1/2" filter={`url(#${rimFilterId})`}>
          <defs>
            <filter id={rimFilterId}>
              <feMorphology in="SourceAlpha" operator="erode" radius="0.35" result="interior" />
              <feComposite in="SourceGraphic" in2="interior" operator="out" />
            </filter>
          </defs>
        </Droplets>
      </div>
      <LoadingSpinner className="absolute inset-0 size-full" />
    </div>
  );
}
