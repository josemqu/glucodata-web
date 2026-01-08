const DEFAULTS = {
  apiUrl: "http://localhost:3000/api/latest",
  apiToken: "",
  refreshSeconds: 60,
  enabled: true,
};

function $(id) {
  return document.getElementById(id);
}

function setStatus(text, kind) {
  const el = $("status");
  el.textContent = text;
  el.className = `status ${kind || ""}`.trim();
}

async function load() {
  const settings = await chrome.storage.sync.get(DEFAULTS);
  $("apiUrl").value = settings.apiUrl || "";
  $("apiToken").value = settings.apiToken || "";
  $("refreshSeconds").value = String(settings.refreshSeconds || 60);
  $("enabled").checked = !!settings.enabled;
}

async function save() {
  const apiUrl = $("apiUrl").value.trim();
  const apiToken = $("apiToken").value.trim();
  const refreshSeconds = Math.max(30, Number($("refreshSeconds").value || 60));
  const enabled = $("enabled").checked;

  await chrome.storage.sync.set({ apiUrl, apiToken, refreshSeconds, enabled });
  setStatus("Guardado", "ok");
}

async function test() {
  setStatus("Probando...", "");
  const settings = await chrome.storage.sync.get(DEFAULTS);

  if (!settings.apiUrl || !settings.apiToken) {
    setStatus("Falta apiUrl o apiToken", "err");
    return;
  }

  try {
    const res = await fetch(settings.apiUrl, {
      headers: { Authorization: `Bearer ${settings.apiToken}` },
      cache: "no-store",
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      setStatus(json?.error || `HTTP ${res.status}`, "err");
      return;
    }
    const value = json?.data?.value;
    const trend = json?.data?.trend;
    setStatus(
      typeof value === "number"
        ? `OK: ${value} (trend ${trend})`
        : "OK: sin datos",
      "ok"
    );
  } catch (e) {
    setStatus(e?.message || "Error", "err");
  }
}

$("save").addEventListener("click", () => {
  save().catch((e) => setStatus(e?.message || "Error", "err"));
});

$("test").addEventListener("click", () => {
  test().catch((e) => setStatus(e?.message || "Error", "err"));
});

load().catch((e) => setStatus(e?.message || "Error", "err"));
