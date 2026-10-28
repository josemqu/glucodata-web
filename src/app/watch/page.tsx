"use client";
import { useState } from "react";
export default function WatchSetup() {
  const [token, setToken] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function change(method: "POST" | "DELETE") {
    setBusy(true); setToken(""); setMessage("");
    try {
      const response = await fetch("/api/wear/token", { method });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setToken(result.token ?? "");
      setMessage(method === "POST" ? "Clave creada. La anterior dejó de funcionar. Vence en un año." : "Reloj desvinculado.");
    } catch { setMessage("No se pudo completar. Iniciá sesión y volvé a intentar."); }
    finally { setBusy(false); }
  }
  return <main className="mx-auto max-w-lg space-y-6 p-8">
    <h1 className="text-2xl font-bold">Tu reloj</h1>
    <p>Configurá primero tus insulinas en gluco-web. Creá una clave exclusiva y cargala junto con la dirección de esta web en Configurar, dentro de la app del reloj.</p>
    <button className="rounded border p-3" disabled={busy} onClick={() => change("POST")}>Crear o renovar clave del reloj</button>
    {token && <><p>Guardá esta clave ahora. Solo se muestra esta vez.</p><textarea aria-label="Clave del reloj" className="w-full rounded border p-3" readOnly value={token} onFocus={event => event.target.select()} /></>}
    <p role="status">{message}</p>
    <button className="rounded border p-3" disabled={busy} onClick={() => change("DELETE")}>Desvincular reloj</button>
    <p>Los pendientes permanecen en el reloj. Sincronizalos antes de cambiar de cuenta.</p>
  </main>;
}
