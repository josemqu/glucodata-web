const DEFAULTS = {
  apiUrl: "http://localhost:3000/api/latest",
  apiToken: "",
  refreshSeconds: 60,
  enabled: true,
  blacklist: [],
};

function $(id) {
  return document.getElementById(id);
}

function setStatus(text, kind) {
  const el = $("status");
  if (!text) {
    el.style.display = "none";
    return;
  }
  el.textContent = text;
  el.className = `status-msg ${kind || ""}`.trim();
  el.style.display = "block";
  
  if (kind === "ok") {
    setTimeout(() => {
      el.style.display = "none";
    }, 3000);
  }
}

async function load() {
  const settings = await chrome.storage.sync.get(DEFAULTS);
  $("apiUrl").value = settings.apiUrl || "";
  $("apiToken").value = settings.apiToken || "";
  $("refreshSeconds").value = String(settings.refreshSeconds || 60);
  $("enabled").checked = !!settings.enabled;
  $("blacklist").value = (settings.blacklist || []).join("\n");
}

async function save() {
  const apiUrl = $("apiUrl").value.trim();
  const apiToken = $("apiToken").value.trim();
  const refreshSeconds = Math.max(30, Number($("refreshSeconds").value || 60));
  const enabled = $("enabled").checked;
  const blacklist = $("blacklist")
    .value.split("\n")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  await chrome.storage.sync.set({
    apiUrl,
    apiToken,
    refreshSeconds,
    enabled,
    blacklist,
  });
  setStatus("¡Configuración guardada!", "ok");
}

async function test() {
  setStatus("Probando conexión...", "");
  const apiUrl = $("apiUrl").value.trim();
  const apiToken = $("apiToken").value.trim();

  if (!apiUrl || !apiToken) {
    setStatus("Falta URL o Token", "err");
    return;
  }

  try {
    const res = await fetch(apiUrl, {
      headers: { Authorization: `Bearer ${apiToken}` },
      cache: "no-store",
    });
    
    if (!res.ok) {
      const json = await res.json().catch(() => null);
      setStatus(json?.error || `Error HTTP ${res.status}`, "err");
      return;
    }
    
    const json = await res.json();
    const value = json?.data?.value;
    const trend = json?.data?.trend;
    
    if (typeof value === "number") {
      setStatus(`Conexión exitosa: ${value} mg/dL (tendencia ${trend})`, "ok");
    } else {
      setStatus("Conectado, pero el servidor no devolvió valores", "err");
    }
  } catch (e) {
    setStatus("Error de red: " + (e?.message || "Servidor no alcanzable"), "err");
  }
}

$("save").addEventListener("click", () => {
  save().catch((e) => setStatus(e?.message || "Error", "err"));
});

$("test").addEventListener("click", () => {
  test().catch((e) => setStatus(e?.message || "Error", "err"));
});

document.addEventListener("DOMContentLoaded", () => {
  load().catch((e) => setStatus(e?.message || "Error", "err"));
});
