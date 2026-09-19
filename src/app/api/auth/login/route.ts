// Safe native-form fallback before hydration or when JavaScript is disabled.
// Do not parse, echo, log or redirect the submitted credentials.
export async function POST() {
  return new Response("Activá JavaScript y volvé al inicio para iniciar sesión.", {
    status: 400,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "private, no-store" },
  });
}
