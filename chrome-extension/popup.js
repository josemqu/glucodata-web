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
    $("glucoseTrend").textContent = data.arrow || "";
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
    $("glucoseTrend").textContent = "";
    $("lastUpdate").textContent = lastResult.error || "Error de conexión";
    $("connectionStatus").textContent = "Error";
    $("connectionStatus").className = "status-badge status-err";
    $("glucoseValue").style.color = "#ef4444";
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

$("goHomeBtn").addEventListener("click", async () => {
  const { apiUrl } = await chrome.storage.sync.get({ apiUrl: "" });
  if (apiUrl) {
    try {
      const url = new URL(apiUrl);
      chrome.tabs.create({ url: url.origin });
    } catch (e) {
      chrome.tabs.create({ url: "https://glucodata-web.vercel.app" });
    }
  } else {
    chrome.tabs.create({ url: "https://glucodata-web.vercel.app" });
  }
});

// Sync UI on start
updateUI();

// Listen for updates from background
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "GLUCO_UPDATE") {
    updateUI();
  }
});
