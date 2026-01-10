const ROOT_ID = "gluco-badge-root";

const DEFAULT_BOTTOM_PX = 16;
const VIEWPORT_PADDING_PX = 16;

function getSiteKey() {
  try {
    return String(location.origin);
  } catch (_e) {
    return "unknown";
  }
}

function getPositionStorageKey() {
  return `glucoBadgeBottom:${getSiteKey()}`;
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function isContextValid() {
  return !!(
    typeof chrome !== "undefined" &&
    chrome.runtime &&
    chrome.runtime.id
  );
}

async function isBlacklisted() {
  if (!isContextValid()) return true; // Fail safe
  try {
    const origin = location.origin;
    if (origin === "https://glucodata-web.vercel.app") return true;
    const res = await chrome.storage.sync.get({ blacklist: [], enabled: true });
    if (!res.enabled) return true;
    const blacklist = res.blacklist || [];
    return blacklist.some((item) => origin.includes(item));
  } catch (_e) {
    return false;
  }
}

function ensureRoot() {
  let root = document.getElementById(ROOT_ID);
  if (root) return root;

  root = document.createElement("div");
  root.id = ROOT_ID;
  document.documentElement.appendChild(root);

  const style = document.createElement("style");
  style.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&display=swap');

    #${ROOT_ID} {
      position: fixed;
      right: 16px;
      bottom: 16px;
      z-index: 2147483647;
      font-family: 'Outfit', ui-sans-serif, system-ui, -apple-system, sans-serif;
      --gluco-emerald: #10b981;
      --gluco-amber: #f59e0b;
      --gluco-red: #ef4444;
    }
    #${ROOT_ID} .gluco-card {
      display: flex;
      align-items: center;
      gap: 10px;
      justify-content: flex-end;
      padding: 8px 10px;
      border-radius: 999px;
      background: rgba(20, 20, 20, 0.65);
      color: #fff;
      box-shadow: 
        0 8px 25px rgba(0,0,0,0.3),
        inset 0 0.5px 0.5px rgba(255,255,255,0.08),
        inset 0 -0.5px 0.5px rgba(0,0,0,0.3);
      border: 0.5px solid rgba(255,255,255,0.05);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      cursor: grab;
      user-select: none;
      transition: background-color 700ms cubic-bezier(0.16, 1, 0.3, 1), box-shadow 700ms cubic-bezier(0.16, 1, 0.3, 1);
      will-change: background-color, box-shadow;
      position: relative;
      overflow: hidden;
    }
    #${ROOT_ID} .gluco-card::after {
      content: "";
      position: absolute;
      top: 0;
      left: -150%;
      width: 50px;
      height: 100%;
      background: linear-gradient(
        to right,
        transparent 0%,
        rgba(255, 255, 255, 0.12) 50%,
        transparent 100%
      );
      transform: skewX(-20deg);
      pointer-events: none;
      animation: gluco-shine 7s infinite ease-in-out;
      z-index: 10;
    }
    @keyframes gluco-shine {
      0%, 80% {
        left: -150%;
        border-color: rgba(255, 255, 255, 0.05);
        box-shadow: 
          0 8px 25px rgba(0,0,0,0.3),
          inset 0 0.5px 0.5px rgba(255,255,255,0.08),
          inset 0 -0.5px 0.5px rgba(0,0,0,0.3);
      }
      90% {
        border-color: rgba(255, 255, 255, 0.45);
        box-shadow: 
          0 8px 28px rgba(0,0,0,0.35),
          inset 0 0.5px 1.5px rgba(255,255,255,0.4),
          inset 0 -0.5px 0.5px rgba(0,0,0,0.3);
      }
      100% {
        left: 200%;
        border-color: rgba(255, 255, 255, 0.05);
        box-shadow: 
          0 8px 25px rgba(0,0,0,0.3),
          inset 0 0.5px 0.5px rgba(255,255,255,0.08),
          inset 0 -0.5px 0.5px rgba(0,0,0,0.3);
      }
    }
    #${ROOT_ID} .gluco-card.dragging {
      cursor: grabbing;
    }
    #${ROOT_ID} .gluco-card .gluco-btn {
      cursor: pointer;
    }
    #${ROOT_ID} .gluco-card.inactive {
      background: rgba(20, 20, 20, 0.35);
    }
    #${ROOT_ID} .gluco-card.compact {
      padding: 8px 10px;
    }
    #${ROOT_ID} .gluco-card:hover {
      padding: 8px 10px;
      box-shadow: 0 13px 36px rgba(0,0,0,0.38);
    }
    #${ROOT_ID} .gluco-value {
      font-size: 19px;
      font-weight: 800;
      letter-spacing: -0.6px;
      line-height: 1;
      color: var(--gluco-emerald);
      font-variant-numeric: tabular-nums;
      font-feature-settings: "tnum" 1;
      display: inline-block;
      width: 3ch;
      text-align: right;
    }
    #${ROOT_ID} .gluco-unit {
      font-size: 10px;
      opacity: 0.8;
      font-weight: 700;
      letter-spacing: -0.2px;
      margin-right: 4px;
      flex: 0 0 auto;
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
      display: flex;
      align-items: center;
      gap: 8px;
      order: -1;
      opacity: 0;
      max-width: 0;
      margin-right: -10px;
      overflow: hidden;
      pointer-events: none;
      transform: translateX(2px);
      transition: opacity 520ms cubic-bezier(0.16, 1, 0.3, 1), max-width 700ms cubic-bezier(0.16, 1, 0.3, 1), transform 520ms cubic-bezier(0.16, 1, 0.3, 1), margin-right 520ms cubic-bezier(0.16, 1, 0.3, 1);
    }
    #${ROOT_ID} .gluco-card:hover .gluco-details {
      opacity: 1;
      max-width: 500px;
      margin-right: 0;
      pointer-events: auto;
      transform: translateX(0);
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
      user-select: text;
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
      padding: 6px 10px;
      border-radius: 10px;
      border: 1px solid rgba(255,255,255,0.14);
      background: rgba(255,255,255,0.10);
      color: #fff;
      font-size: 11px;
      font-weight: 700;
    }
    #${ROOT_ID} .gluco-icon-btn {
      width: 30px;
      height: 30px;
      padding: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 10px;
      position: relative;
    }
    #${ROOT_ID} .gluco-icon-btn svg {
      width: 16px;
      height: 16px;
      stroke: currentColor;
    }
    #${ROOT_ID} .gluco-spinner {
      position: absolute;
      inset: 0;
      display: none;
      align-items: center;
      justify-content: center;
      pointer-events: none;
    }
    #${ROOT_ID} .gluco-spinner::before {
      content: "";
      width: 14px;
      height: 14px;
      border-radius: 999px;
      border: 2px solid rgba(255,255,255,0.35);
      border-top-color: rgba(255,255,255,0.95);
      animation: gluco-spin 700ms linear infinite;
    }
    #${ROOT_ID} .gluco-icon-btn.loading svg {
      opacity: 0.35;
    }
    #${ROOT_ID} .gluco-icon-btn.loading .gluco-spinner {
      display: inline-flex;
    }
    @keyframes gluco-spin {
      to {
        transform: rotate(360deg);
      }
    }
    #${ROOT_ID} .gluco-btn:hover {
      background: rgba(255,255,255,0.18);
    }
  `;
  root.appendChild(style);

  const applyClampedBottom = (requestedBottomPx) => {
    const cardEl = root.querySelector(".gluco-card");
    if (!cardEl) return;
    const rect = cardEl.getBoundingClientRect();
    const maxBottom = Math.max(
      VIEWPORT_PADDING_PX,
      window.innerHeight - VIEWPORT_PADDING_PX - rect.height
    );
    const bottom = clamp(
      Number(requestedBottomPx),
      VIEWPORT_PADDING_PX,
      maxBottom
    );
    root.style.bottom = `${bottom}px`;
  };

  const restoreBottom = () => {
    if (!isContextValid()) return;
    const key = getPositionStorageKey();
    chrome.storage.local.get([key], (res) => {
      if (!isContextValid()) return;
      void chrome.runtime.lastError;
      const stored = res?.[key];
      const bottom =
        typeof stored === "number" && Number.isFinite(stored)
          ? stored
          : DEFAULT_BOTTOM_PX;
      applyClampedBottom(bottom);
    });
  };

  const card = document.createElement("div");
  card.className = "gluco-card compact";

  const valueEl = document.createElement("span");
  valueEl.className = "gluco-value";
  valueEl.textContent = "--";

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
  refreshBtn.className = "gluco-btn gluco-icon-btn";
  refreshBtn.type = "button";
  refreshBtn.title = "Actualizar";
  refreshBtn.setAttribute("aria-label", "Actualizar");
  refreshBtn.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M21 12a9 9 0 1 1-2.64-6.36" />
      <path d="M21 3v6h-6" />
    </svg>
    <span class="gluco-spinner" aria-hidden="true"></span>
  `;
  refreshBtn.addEventListener("click", () => {
    if (!isContextValid()) {
      alert("La extensión se ha actualizado. Por favor, recarga la página.");
      return;
    }
    refreshBtn.classList.add("loading");
    refreshBtn.disabled = true;
    chrome.runtime.sendMessage({ type: "GLUCO_FORCE_REFRESH" }, () => {
      if (!isContextValid()) return;
      void chrome.runtime.lastError;
    });
  });

  const openAppBtn = document.createElement("button");
  openAppBtn.className = "gluco-btn gluco-icon-btn";
  openAppBtn.type = "button";
  openAppBtn.title = "Abrir GlucoData";
  openAppBtn.setAttribute("aria-label", "Abrir GlucoData");
  openAppBtn.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M14 3h7v7" />
      <path d="M10 14L21 3" />
      <path d="M21 14v7h-7" />
      <path d="M3 10V3h7" />
      <path d="M3 14v7h7" />
    </svg>
  `;
  openAppBtn.addEventListener("click", () => {
    if (!isContextValid()) {
      alert("La extensión se ha actualizado. Por favor, recarga la página.");
      return;
    }
    chrome.runtime.sendMessage({ type: "GLUCO_OPEN_DASHBOARD" });
  });

  const hideBtn = document.createElement("button");
  hideBtn.className = "gluco-btn gluco-icon-btn";
  hideBtn.type = "button";
  hideBtn.title = "Ocultar en este sitio";
  hideBtn.setAttribute("aria-label", "Ocultar en este sitio");
  hideBtn.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  `;
  hideBtn.addEventListener("click", () => {
    if (!isContextValid()) {
      root.remove();
      return;
    }
    const origin = location.origin;
    chrome.storage.sync.get({ blacklist: [] }, (res) => {
      if (!isContextValid()) {
        root.remove();
        return;
      }
      const blacklist = res.blacklist || [];
      if (!blacklist.includes(origin)) {
        blacklist.push(origin);
        chrome.storage.sync.set({ blacklist }, () => {
          root.remove();
        });
      } else {
        root.remove();
      }
    });
  });

  const copyBtn = document.createElement("button");
  copyBtn.className = "gluco-btn";
  copyBtn.type = "button";
  copyBtn.textContent = "Copiar";
  copyBtn.style.display = "none";

  details.appendChild(dot);
  details.appendChild(meta);
  details.appendChild(refreshBtn);
  details.appendChild(openAppBtn);
  details.appendChild(hideBtn);
  details.appendChild(copyBtn);

  card.appendChild(valueEl);
  card.appendChild(arrowEl);
  card.appendChild(details);
  root.appendChild(card);

  restoreBottom();

  window.addEventListener(
    "resize",
    () => {
      const current = Number.parseFloat(root.style.bottom || "");
      applyClampedBottom(
        Number.isFinite(current) ? current : DEFAULT_BOTTOM_PX
      );
    },
    { passive: true }
  );

  const persistBottom = () => {
    if (!isContextValid()) return;
    const key = getPositionStorageKey();
    const current = Number.parseFloat(root.style.bottom || "");
    const bottom = Number.isFinite(current) ? current : DEFAULT_BOTTOM_PX;
    chrome.storage.local.set({ [key]: bottom }, () => {
      if (!isContextValid()) return;
      void chrome.runtime.lastError;
    });
  };

  let dragStartClientY = null;
  let dragStartBottomPx = null;
  card.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    const target = e.target;
    if (target && target.closest && target.closest("button")) return;

    dragStartClientY = e.clientY;
    const current = Number.parseFloat(root.style.bottom || "");
    dragStartBottomPx = Number.isFinite(current) ? current : DEFAULT_BOTTOM_PX;

    try {
      card.setPointerCapture(e.pointerId);
    } catch (_err) {
      // ignore
    }

    card.classList.add("dragging");

    e.preventDefault();
  });

  card.addEventListener("pointermove", (e) => {
    if (dragStartClientY == null || dragStartBottomPx == null) return;
    const dy = e.clientY - dragStartClientY;
    const nextBottom = dragStartBottomPx - dy;
    applyClampedBottom(nextBottom);
  });

  const endDrag = () => {
    if (dragStartClientY == null || dragStartBottomPx == null) return;
    dragStartClientY = null;
    dragStartBottomPx = null;
    card.classList.remove("dragging");
    persistBottom();
  };

  card.addEventListener("pointerup", endDrag);
  card.addEventListener("pointercancel", endDrag);

  root.__gluco = { dot, valueEl, arrowEl, sub, copyBtn, refreshBtn };
  return root;
}

function setState(payload) {
  if (!isContextValid()) return;
  const root = ensureRoot();
  if (!root) return; // No renderizar en la propia app

  const { dot, valueEl, arrowEl, sub, copyBtn, refreshBtn } = root.__gluco;
  const card = root.querySelector(".gluco-card");

  if (refreshBtn) {
    refreshBtn.classList.remove("loading");
    refreshBtn.disabled = false;
  }

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
    arrowEl.textContent = "";
    setValueColor("#fff");
    setArrowColorByTrend(null);
    sub.textContent = "Sin datos";
    copyBtn.style.display = "none";
    copyBtn.onclick = null;
    card.classList.add("compact");
    card.classList.add("inactive");
    return;
  }

  if (!payload.ok) {
    dot.className = "gluco-dot err";
    valueEl.textContent = "--";
    arrowEl.textContent = "";
    setValueColor("#fff");
    setArrowColorByTrend(null);
    sub.textContent = payload.error ? String(payload.error) : "Error";
    copyBtn.style.display = "none";
    copyBtn.onclick = null;
    card.classList.add("compact");
    card.classList.add("inactive");
    return;
  }

  if (!payload.data) {
    dot.className = "gluco-dot warn";
    valueEl.textContent = "--";
    arrowEl.textContent = "";
    setValueColor("#fff");
    setArrowColorByTrend(null);
    sub.textContent = "Sin datos";
    copyBtn.style.display = "none";
    copyBtn.onclick = null;
    card.classList.add("compact");
    card.classList.add("inactive");
    return;
  }

  dot.className = "gluco-dot ok";
  valueEl.textContent = String(payload.data.value);
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

  copyBtn.style.display = "none";
  copyBtn.onclick = null;

  card.classList.remove("compact");
  card.classList.remove("inactive");
}

chrome.runtime.onMessage.addListener(async (msg) => {
  if (!isContextValid()) return;
  if (msg?.type === "GLUCO_UPDATE") {
    const settings = await chrome.storage.sync.get({ enabled: true });
    if (!isContextValid()) return;
    if (!settings.enabled || (await isBlacklisted())) {
      const root = document.getElementById(ROOT_ID);
      if (root) root.remove();
      return;
    }
    setState(msg.payload);
  }
});

// initial paint
if (isContextValid()) {
  chrome.runtime.sendMessage({ type: "GLUCO_GET_LATEST" }, async (resp) => {
    if (!isContextValid()) return;
    if (chrome.runtime.lastError) {
      setState({
        ok: false,
        error: chrome.runtime.lastError.message,
        data: null,
      });
      return;
    }
    if (await isBlacklisted()) return;
    setState(resp?.lastResult || null);
  });
}
