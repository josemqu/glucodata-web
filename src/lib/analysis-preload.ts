/** Schedule server-backed cache loads between interactions, one at a time. */
export function preloadAnalysis(tasks: Array<() => Promise<void>>) {
  let cancelled = false;
  let cancelScheduled: (() => void) | undefined;
  let next = 0;

  const schedule = () => {
    if (cancelled || next >= tasks.length) return;
    const run = async () => {
      cancelScheduled = undefined;
      if (cancelled) return;
      const task = tasks[next++];
      try {
        await task();
      } catch {
        // Speculative loading must never interrupt Monitor. Foreground loads retry.
      }
      schedule();
    };
    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(() => { void run(); }, { timeout: 3000 });
      cancelScheduled = () => window.cancelIdleCallback(id);
    } else {
      const id = window.setTimeout(() => { void run(); }, 500);
      cancelScheduled = () => window.clearTimeout(id);
    }
  };

  schedule();
  return () => {
    cancelled = true;
    cancelScheduled?.();
  };
}
