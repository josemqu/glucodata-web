const DEFAULTS = {
  apiUrl: "http://localhost:3000/api/latest",
  apiToken: "",
  refreshSeconds: 60,
  enabled: true,
  blacklist: [],
};

const ICONS = {
  loading: `<svg class="status-loading" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"></path></svg>`,
  success: `<svg class="status-success" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`,
  error: `<svg class="status-error" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`,
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

function updateValidationUI(id, state) {
  const el = $(id);
  if (!el) return;
  
  if (!state) {
    el.classList.remove("visible");
    el.innerHTML = "";
    return;
  }
  
  el.innerHTML = ICONS[state] || "";
  el.classList.add("visible");
}

let currentBlacklist = [];

function renderBlacklist() {
  const container = $("blacklistContainer");
  if (!container) return;
  container.innerHTML = "";
  
  currentBlacklist.forEach((url, index) => {
    const item = document.createElement("div");
    item.className = "blacklist-item";
    
    const span = document.createElement("span");
    span.textContent = url;
    
    const removeBtn = document.createElement("button");
    removeBtn.className = "btn-remove";
    removeBtn.innerHTML = "&times;";
    removeBtn.title = "Eliminar de la lista negra";
    removeBtn.onclick = async () => {
      currentBlacklist.splice(index, 1);
      renderBlacklist();
      // Persist immediately on delete
      await chrome.storage.sync.set({ blacklist: currentBlacklist });
    };
    
    item.appendChild(span);
    item.appendChild(removeBtn);
    container.appendChild(item);
  });
}

function addBlacklistEntry() {
  const input = $("newBlacklistUrl");
  const url = input.value.trim();
  if (url) {
    if (!currentBlacklist.includes(url)) {
      currentBlacklist.push(url);
      renderBlacklist();
      input.value = "";
      // Persist immediately on add
      chrome.storage.sync.set({ blacklist: currentBlacklist });
    } else {
      setStatus("La URL ya está en la lista", "err");
      setTimeout(() => setStatus(""), 3000);
    }
  }
}

let validationTimeout = null;
function debounceValidation() {
  const apiToken = $("apiToken").value.trim();
  const apiUrl = $("apiUrl").value.trim();
  
  if (!apiToken || !apiUrl) {
    updateValidationUI("tokenStatus", null);
    return;
  }
  
  updateValidationUI("tokenStatus", "loading");
  
  if (validationTimeout) clearTimeout(validationTimeout);
  validationTimeout = setTimeout(async () => {
    try {
      const res = await fetch(apiUrl, {
        headers: { Authorization: `Bearer ${apiToken}` },
        cache: "no-store",
      });
      
      if (res.ok) {
        updateValidationUI("tokenStatus", "success");
      } else {
        updateValidationUI("tokenStatus", "error");
      }
    } catch (e) {
      updateValidationUI("tokenStatus", "error");
    }
  }, 800);
}

async function load() {
  const settings = await chrome.storage.sync.get(DEFAULTS);
  $("apiUrl").value = settings.apiUrl || "";
  $("apiToken").value = settings.apiToken || "";
  $("refreshSeconds").value = String(settings.refreshSeconds || 60);
  $("enabled").checked = !!settings.enabled;
  
  currentBlacklist = settings.blacklist || [];
  renderBlacklist();
  
  if (settings.apiUrl && settings.apiToken) {
    debounceValidation();
  }
}

async function save() {
  const apiUrl = $("apiUrl").value.trim();
  const apiToken = $("apiToken").value.trim();
  const refreshSeconds = Math.max(30, Number($("refreshSeconds").value || 60));
  const enabled = $("enabled").checked;
  const blacklist = currentBlacklist;

  await chrome.storage.sync.set({
    apiUrl,
    apiToken,
    refreshSeconds,
    enabled,
    blacklist,
  });
  setStatus("¡Configuración guardada!", "ok");
  debounceValidation();
}

async function test() {
  setStatus("Probando conexión...", "");
  const apiUrl = $("apiUrl").value.trim();
  const apiToken = $("apiToken").value.trim();

  if (!apiUrl || !apiToken) {
    setStatus("Falta URL o Token", "err");
    updateValidationUI("tokenStatus", "error");
    return;
  }

  updateValidationUI("tokenStatus", "loading");
  try {
    const res = await fetch(apiUrl, {
      headers: { Authorization: `Bearer ${apiToken}` },
      cache: "no-store",
    });
    
    if (!res.ok) {
      const json = await res.json().catch(() => null);
      setStatus(json?.error || `Error HTTP ${res.status}`, "err");
      updateValidationUI("tokenStatus", "error");
      return;
    }
    
    const json = await res.json();
    const value = json?.data?.value;
    const trend = json?.data?.trend;
    
    if (typeof value === "number") {
      setStatus(`Conexión exitosa: ${value} mg/dL (tendencia ${trend})`, "ok");
      updateValidationUI("tokenStatus", "success");
    } else {
      setStatus("Conectado, pero el servidor no devolvió valores", "err");
      updateValidationUI("tokenStatus", "error");
    }
  } catch (e) {
    setStatus("Error de red: " + (e?.message || "Servidor no alcanzable"), "err");
    updateValidationUI("tokenStatus", "error");
  }
}

$("save").addEventListener("click", () => {
  save().catch((e) => setStatus(e?.message || "Error", "err"));
});

$("test").addEventListener("click", () => {
  test().catch((e) => setStatus(e?.message || "Error", "err"));
});

$("apiToken").addEventListener("input", debounceValidation);
$("apiUrl").addEventListener("input", debounceValidation);

$("addBlacklist").addEventListener("click", addBlacklistEntry);
$("newBlacklistUrl").addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    addBlacklistEntry();
  }
});

$("enabled").addEventListener("change", async () => {
  const enabled = $("enabled").checked;
  await chrome.storage.sync.set({ enabled });
  // Force a refresh to update all tabs immediately
  chrome.runtime.sendMessage({ type: "GLUCO_FORCE_REFRESH" });
});

document.addEventListener("DOMContentLoaded", () => {
  load().catch((e) => setStatus(e?.message || "Error", "err"));
});
