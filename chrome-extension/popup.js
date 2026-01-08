function $(id) {
  return document.getElementById(id);
}

function formatTime(timestamp) {
  if (!timestamp) return "Nunca";
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

async function updateUI() {
  const { lastResult } = await chrome.storage.local.get("lastResult");
  const settings = await chrome.storage.sync.get({ enabled: true, apiUrl: "" });

  if (!settings.enabled) {
    $("connectionStatus").textContent = "Desactivado";
    $("connectionStatus").className = "status-badge status-err";
    $("glucoseValue").textContent = "--";
    $("glucoseTrend").textContent = "";
    $("lastUpdate").textContent = "La extensión está deshabilitada";
    return;
  }

  if (!lastResult) {
    $("glucoseValue").textContent = "--";
    $("lastUpdate").textContent = "No hay datos";
    return;
  }

  if (lastResult.ok && lastResult.data) {
    const data = lastResult.data;
    $("glucoseValue").textContent = data.value;
    // Style trend arrow
    const trend = Number(data.trend);
    const trendEl = $("glucoseTrend");
    
    const getTrendSVG = (t) => {
      const base = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">`;
      switch (t) {
        case 5: return `${base}<path d="M12 19V5M5 12l7-7 7 7"/></svg>`; // ArrowUp
        case 4: return `${base}<path d="M7 17L17 7M7 7h10v10"/></svg>`; // ArrowUpRight
        case 3: return `${base}<path d="M5 12h14M12 5l7 7-7 7"/></svg>`; // ArrowRight
        case 2: return `${base}<path d="M7 7l10 10M17 7v10H7"/></svg>`; // ArrowDownRight
        case 1: return `${base}<path d="M12 5v14M19 12l-7 7-7-7"/></svg>`; // ArrowDown
        default: return "";
      }
    };

    trendEl.innerHTML = getTrendSVG(trend);
    
    // Set trend color matching web app
    if (trend === 5) {
      trendEl.style.color = "#ef4444"; // destructive
    } else if (trend === 4) {
      trendEl.style.color = "#f97316"; // orange-500
    } else if (trend === 3) {
      trendEl.style.color = "#10b981"; // emerald-500
    } else if (trend === 2) {
      trendEl.style.color = "#fb923c"; // orange-400
    } else if (trend === 1) {
      trendEl.style.color = "#ea580c"; // orange-600
    } else {
      trendEl.style.color = "var(--text-dim)";
    }

    $("glucoseUnit").textContent = data.unit || "mg/dL";
    $("lastUpdate").textContent = "Hace un momento: " + formatTime(data.timestamp || lastResult.receivedAt);
    $("connectionStatus").textContent = "En línea";
    $("connectionStatus").className = "status-badge status-ok";

    // Color code based on status colorKey if available
    const status = data.status || {};
    const colorKey = status.colorKey || null;
    
    if (colorKey === "critical") {
      $("glucoseValue").style.color = "#ef4444"; // Error/Red
    } else if (colorKey === "warning") {
      $("glucoseValue").style.color = "#f59e0b"; // Amber/Warning
    } else if (colorKey === "ok") {
      $("glucoseValue").style.color = "#10b981"; // Emerald/OK
    } else {
      // Fallback to basic high/low
      if (data.isLow || data.isHigh) $("glucoseValue").style.color = "#f59e0b";
      else $("glucoseValue").style.color = "#10b981";
    }
  } else {
    $("glucoseValue").textContent = "!!";
    $("glucoseValue").style.color = "#ef4444";
    $("glucoseTrend").textContent = "";
    $("lastUpdate").textContent = lastResult.error || "Error de conexión";
    $("connectionStatus").textContent = "Error";
    $("connectionStatus").className = "status-badge status-err";
  }
}

$("refreshBtn").addEventListener("click", async () => {
  $("refreshBtn").classList.add("refreshing");
  chrome.runtime.sendMessage({ type: "GLUCO_FORCE_REFRESH" }, (response) => {
    setTimeout(() => {
      $("refreshBtn").classList.remove("refreshing");
      updateUI();
    }, 500);
  });
});

$("optionsBtn").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

$("goHomeBtn").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "GLUCO_OPEN_DASHBOARD" });
});

// Sync UI on start
updateUI();

// Listen for updates from background
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "GLUCO_UPDATE") {
    updateUI();
  }
});
