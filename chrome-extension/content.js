const ROOT_ID = "gluco-badge-root";

function ensureRoot() {
  let root = document.getElementById(ROOT_ID);
  if (root) return root;

  root = document.createElement("div");
  root.id = ROOT_ID;
  document.documentElement.appendChild(root);

  const style = document.createElement("style");
  style.textContent = `
    #${ROOT_ID} {
      position: fixed;
      right: 16px;
      bottom: 16px;
      z-index: 2147483647;
      font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji";
      --gluco-emerald: #10b981;
      --gluco-amber: #f59e0b;
      --gluco-red: #ef4444;
    }
    #${ROOT_ID} .gluco-card {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 10px;
      border-radius: 999px;
      background: rgba(20, 20, 20, 0.88);
      color: #fff;
      box-shadow: 0 10px 30px rgba(0,0,0,0.35);
      border: 1px solid rgba(255,255,255,0.10);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      cursor: default;
      user-select: none;
      transition: padding 0.2s ease-in-out;
    }
    #${ROOT_ID} .gluco-card.compact {
      padding: 6px 8px;
    }
    #${ROOT_ID} .gluco-card:hover {
      padding: 10px 12px;
    }
    #${ROOT_ID} .gluco-value {
      font-size: 18px;
      font-weight: 700;
      letter-spacing: 0.2px;
      line-height: 1;
      color: var(--gluco-emerald);
    }
    #${ROOT_ID} .gluco-unit {
      font-size: 11px;
      opacity: 0.8;
      margin-left: 4px;
      font-weight: 600;
    }
    #${ROOT_ID} .gluco-arrow {
      font-size: 18px;
      font-weight: 800;
      line-height: 1;
      min-width: 18px;
      text-align: center;
      color: #fff;
    }
    #${ROOT_ID} .gluco-details {
      display: none;
      align-items: center;
      gap: 10px;
    }
    #${ROOT_ID} .gluco-card:hover .gluco-details {
      display: flex;
    }
    #${ROOT_ID} .gluco-meta {
      display: flex;
      flex-direction: column;
      gap: 3px;
    }
    #${ROOT_ID} .gluco-sub {
      font-size: 10px;
      opacity: 0.75;
      line-height: 1;
      max-width: 220px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    #${ROOT_ID} .gluco-dot {
      width: 9px;
      height: 9px;
      border-radius: 50%;
      background: #9ca3af;
      box-shadow: 0 0 0 4px rgba(156,163,175,0.18);
      flex: 0 0 auto;
    }
    #${ROOT_ID} .gluco-dot.ok {
      background: #34d399;
      box-shadow: 0 0 0 4px rgba(52,211,153,0.18);
    }
    #${ROOT_ID} .gluco-dot.warn {
      background: #fb923c;
      box-shadow: 0 0 0 4px rgba(251,146,60,0.18);
    }
    #${ROOT_ID} .gluco-dot.err {
      background: #f87171;
      box-shadow: 0 0 0 4px rgba(248,113,113,0.18);
    }
    #${ROOT_ID} .gluco-btn {
      margin-left: 6px;
      padding: 6px 10px;
      border-radius: 10px;
      border: 1px solid rgba(255,255,255,0.14);
      background: rgba(255,255,255,0.10);
      color: #fff;
      font-size: 11px;
      font-weight: 700;
      cursor: pointer;
    }
    #${ROOT_ID} .gluco-btn:hover {
      background: rgba(255,255,255,0.18);
    }
  `;
  root.appendChild(style);

  const card = document.createElement("div");
  card.className = "gluco-card compact";

  const valueEl = document.createElement("span");
  valueEl.className = "gluco-value";
  valueEl.textContent = "--";

  const unitEl = document.createElement("span");
  unitEl.className = "gluco-unit";
  unitEl.textContent = "mg/dL";

  const arrowEl = document.createElement("span");
  arrowEl.className = "gluco-arrow";
  arrowEl.textContent = "";

  const details = document.createElement("div");
  details.className = "gluco-details";

  const dot = document.createElement("div");
  dot.className = "gluco-dot";

  const meta = document.createElement("div");
  meta.className = "gluco-meta";

  const sub = document.createElement("div");
  sub.className = "gluco-sub";
  sub.textContent = "Sin datos";

  meta.appendChild(sub);

  const refreshBtn = document.createElement("button");
  refreshBtn.className = "gluco-btn";
  refreshBtn.type = "button";
  refreshBtn.textContent = "Actualizar";
  refreshBtn.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "GLUCO_FORCE_REFRESH" }, () => {
      void chrome.runtime.lastError;
    });
  });

  details.appendChild(dot);
  details.appendChild(meta);
  details.appendChild(refreshBtn);

  card.appendChild(valueEl);
  card.appendChild(unitEl);
  card.appendChild(arrowEl);
  card.appendChild(details);
  root.appendChild(card);

  root.__gluco = { dot, valueEl, unitEl, arrowEl, sub };
  return root;
}

function setState(payload) {
  const root = ensureRoot();
  const { dot, valueEl, unitEl, arrowEl, sub } = root.__gluco;

  const setValueColor = (color) => {
    valueEl.style.color = color;
  };

  const setArrowColorByTrend = (trend) => {
    switch (Number(trend)) {
      case 5:
        arrowEl.style.color = "var(--gluco-red)";
        return;
      case 4:
        arrowEl.style.color = "#f97316";
        return;
      case 3:
        arrowEl.style.color = "var(--gluco-emerald)";
        return;
      case 2:
        arrowEl.style.color = "#fb923c";
        return;
      case 1:
        arrowEl.style.color = "#ea580c";
        return;
      default:
        arrowEl.style.color = "#fff";
    }
  };

  const formatUpdatedRelative = (ms) => {
    if (typeof ms !== "number" || Number.isNaN(ms)) return "";

    const diffMs = Date.now() - ms;
    if (!Number.isFinite(diffMs)) return "";

    const abs = Math.abs(diffMs);

    const rtf = new Intl.RelativeTimeFormat("es", { numeric: "always" });

    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;

    if (abs < minute) {
      const seconds = Math.round(diffMs / 1000);
      return rtf.format(-seconds, "second");
    }
    if (abs < hour) {
      const minutes = Math.round(diffMs / minute);
      return rtf.format(-minutes, "minute");
    }
    if (abs < day) {
      const hours = Math.round(diffMs / hour);
      return rtf.format(-hours, "hour");
    }

    const days = Math.round(diffMs / day);
    if (Math.abs(days) <= 7) {
      return rtf.format(-days, "day");
    }

    return new Intl.DateTimeFormat("es", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(ms));
  };

  if (!payload) {
    dot.className = "gluco-dot err";
    valueEl.textContent = "--";
    unitEl.textContent = "mg/dL";
    arrowEl.textContent = "";
    setValueColor("#fff");
    setArrowColorByTrend(null);
    sub.textContent = "Sin datos";
    root.querySelector(".gluco-card").classList.add("compact");
    return;
  }

  if (!payload.ok) {
    dot.className = "gluco-dot err";
    valueEl.textContent = "--";
    unitEl.textContent = "mg/dL";
    arrowEl.textContent = "";
    setValueColor("#fff");
    setArrowColorByTrend(null);
    sub.textContent = payload.error || "Error";
    root.querySelector(".gluco-card").classList.add("compact");
    return;
  }

  if (!payload.data) {
    dot.className = "gluco-dot warn";
    valueEl.textContent = "--";
    unitEl.textContent = "mg/dL";
    arrowEl.textContent = "";
    setValueColor("#fff");
    setArrowColorByTrend(null);
    sub.textContent = "No hay mediciones";
    root.querySelector(".gluco-card").classList.add("compact");
    return;
  }

  dot.className =
    payload.data.isLow || payload.data.isHigh
      ? "gluco-dot warn"
      : "gluco-dot ok";
  valueEl.textContent = String(payload.data.value);
  unitEl.textContent = payload.data.unit || "mg/dL";
  arrowEl.textContent = payload.data.arrow || "";

  const colorKey = payload.data?.status?.colorKey || null;
  if (colorKey === "critical") {
    setValueColor("var(--gluco-red)");
  } else if (colorKey === "warning") {
    setValueColor("var(--gluco-amber)");
  } else if (colorKey === "ok") {
    setValueColor("var(--gluco-emerald)");
  } else {
    setValueColor(
      payload.data.isLow || payload.data.isHigh
        ? "var(--gluco-amber)"
        : "var(--gluco-emerald)"
    );
  }
  setArrowColorByTrend(payload.data.trend);

  const ms =
    typeof payload.data.time === "number"
      ? payload.data.time
      : payload.data.timestamp
      ? new Date(payload.data.timestamp).getTime()
      : NaN;
  const rel = formatUpdatedRelative(ms);
  sub.textContent = rel ? `Actualizado ${rel}` : "Actualizado";

  root.querySelector(".gluco-card").classList.remove("compact");
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "GLUCO_UPDATE") {
    setState(msg.payload);
  }
});

// initial paint
chrome.runtime.sendMessage({ type: "GLUCO_GET_LATEST" }, (resp) => {
  if (chrome.runtime.lastError) {
    setState({
      ok: false,
      error: chrome.runtime.lastError.message,
      data: null,
    });
    return;
  }
  setState(resp?.lastResult || null);
});
