const DEFAULTS = {
  apiUrl: "http://localhost:3000/api/latest",
  apiToken: "",
  refreshSeconds: 60,
  enabled: true,
  blacklist: [],
};

async function getSettings() {
  const stored = await chrome.storage.sync.get(DEFAULTS);
  return { ...DEFAULTS, ...stored };
}

async function setLastResult(result) {
  await chrome.storage.local.set({
    lastResult: result,
    lastUpdatedAt: Date.now(),
  });
}

async function getLastResult() {
  const { lastResult, lastUpdatedAt } = await chrome.storage.local.get([
    "lastResult",
    "lastUpdatedAt",
  ]);
  return { lastResult, lastUpdatedAt };
}

function broadcastUpdate(payload) {
  chrome.tabs.query({}, (tabs) => {
    for (const tab of tabs) {
      if (!tab.id) continue;
      chrome.tabs.sendMessage(tab.id, { type: "GLUCO_UPDATE", payload }, () => {
        // ignore errors (e.g. no content script on chrome:// pages)
        void chrome.runtime.lastError;
      });
    }
  });
}

function normalizeTrendArrow(trend) {
  switch (Number(trend)) {
    case 5:
      return "↑";
    case 4:
      return "↗";
    case 3:
      return "→";
    case 2:
      return "↘";
    case 1:
      return "↓";
    default:
      return "";
  }
}

async function fetchLatest() {
  const settings = await getSettings();

  if (!settings.apiUrl || !settings.apiToken) {
    const payload = {
      ok: false,
      error: "Config incompleta: apiUrl o apiToken faltante",
      data: null,
      receivedAt: Date.now(),
    };
    await setLastResult(payload);
    broadcastUpdate(payload);
    return;
  }

  try {
    const res = await fetch(settings.apiUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${settings.apiToken}`,
      },
      cache: "no-store",
    });

    const json = await res.json().catch(() => null);

    if (res.ok && json && json.success === false) {
      const payload = {
        ok: false,
        error: json?.error || "Respuesta inválida del servidor",
        data: null,
        receivedAt: Date.now(),
      };
      await setLastResult(payload);
      broadcastUpdate(payload);
      return;
    }

    if (!res.ok) {
      const payload = {
        ok: false,
        error:
          json?.error || `HTTP ${res.status} al consultar ${settings.apiUrl}`,
        data: null,
        receivedAt: Date.now(),
      };
      await setLastResult(payload);
      broadcastUpdate(payload);
      return;
    }

    const data = json?.data || null;
    const valueRaw = data?.value;
    const valueNum =
      typeof valueRaw === "number"
        ? valueRaw
        : typeof valueRaw === "string"
          ? Number(valueRaw)
          : NaN;
    const payload = {
      ok: true,
      error: null,
      data:
        data && Number.isFinite(valueNum)
          ? {
              value: valueNum,
              unit: data.unit || "mg/dL",
              trend: data.trend,
              trendState: data.trendState, // Pass through new state
              arrow: normalizeTrendArrow(data.trend),
              timestamp: data.timestamp,
              time: data.time,
              isHigh: !!data.isHigh,
              isLow: !!data.isLow,
              targets: data.targets || null,
              status: data.status || null,
            }
          : null,
      receivedAt: Date.now(),
    };

    await setLastResult(payload);
    broadcastUpdate(payload);
  } catch (e) {
    const payload = {
      ok: false,
      error: e?.message || "Error de red",
      data: null,
      receivedAt: Date.now(),
    };
    await setLastResult(payload);
    broadcastUpdate(payload);
  }
}

async function ensureAlarm() {
  const settings = await getSettings();
  const refreshSecondsRaw = Number(settings.refreshSeconds);
  const refreshSeconds = Number.isFinite(refreshSecondsRaw)
    ? refreshSecondsRaw
    : DEFAULTS.refreshSeconds;
  const periodMinutes = Math.max(1, Math.round(refreshSeconds / 60));

  try {
    await chrome.alarms.create("gluco_refresh", {
      periodInMinutes: periodMinutes,
    });
  } catch (e) {
    console.error("[GlucoBadge] Failed to create alarm", {
      refreshSeconds: settings.refreshSeconds,
      periodMinutes,
      error: e?.message || String(e),
    });
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  const existing = await chrome.storage.sync.get(null);
  if (!existing || Object.keys(existing).length === 0) {
    await chrome.storage.sync.set(DEFAULTS);
  }
  await ensureAlarm();
  await fetchLatest();
});

chrome.runtime.onStartup.addListener(async () => {
  await ensureAlarm();
  await fetchLatest();
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm?.name === "gluco_refresh") {
    await fetchLatest();
  }
});

chrome.storage.onChanged.addListener(async (changes, areaName) => {
  if (areaName !== "sync") return;
  if (changes.refreshSeconds || changes.enabled) {
    await ensureAlarm();
  }
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "GLUCO_GET_LATEST") {
    getLastResult().then(({ lastResult }) => sendResponse({ lastResult }));
    return true;
  }
  if (msg?.type === "GLUCO_FORCE_REFRESH") {
    fetchLatest().then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg?.type === "GLUCO_OPEN_DASHBOARD") {
    getSettings().then((settings) => {
      let urlToOpen = "https://glucodata-web.vercel.app";
      if (settings.apiUrl) {
        try {
          const url = new URL(settings.apiUrl);
          urlToOpen = url.origin;
        } catch (e) {}
      }
      chrome.tabs.create({ url: urlToOpen, active: true });
    });
    return true;
  }
  if (msg?.type === "GLUCO_TOGGLE_BADGE") {
    getLastResult().then(({ lastResult }) => broadcastUpdate(lastResult));
    return true;
  }
});

// --- HOT RELOAD FOR DEVELOPMENT ---
// This snippet polls a local server to auto-reload the extension during development.
(function hotReload() {
  const CHECK_INTERVAL = 1000;
  const ENDPOINT = "http://localhost:8899/timestamp";
  let lastTimestamp = null;

  async function check() {
    try {
      const res = await fetch(ENDPOINT);
      const data = await res.json();
      if (lastTimestamp && data.timestamp > lastTimestamp) {
        console.log("[HotReload] Change detected, reloading...");
        chrome.runtime.reload();
      }
      lastTimestamp = data.timestamp;
    } catch (e) {
      // Watcher not running, ignore
    } finally {
      setTimeout(check, CHECK_INTERVAL);
    }
  }

  check();
})();
