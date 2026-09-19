import { NextRequest, NextResponse } from "next/server";

export function proxy(request: NextRequest) {
  const headers = {
    "Cache-Control": "private, no-store, max-age=0",
    "Referrer-Policy": "no-referrer",
  };
  if (process.env.GLUCO_MAINTENANCE === "true") {
    return new NextResponse("Estamos actualizando GlucoWeb. Volvé a intentar en unos minutos.", {
      status: 503,
      headers: { ...headers, "Content-Type": "text/plain; charset=utf-8", "Retry-After": "120" },
    });
  }
  // Never render a page containing credentials in its URL. This cannot erase
  // URLs already recorded by an upstream proxy or browser before this request.
  const sensitive = ["password", "email", "token", "access_token", "refresh_token"];
  if (sensitive.some(key => request.nextUrl.searchParams.has(key))) {
    const clean = request.nextUrl.clone();
    clean.search = "";
    return NextResponse.redirect(clean, { status: 303, headers });
  }
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    const origin = request.headers.get("origin");
    // Exact origin comparison rejects sibling subdomains too. Cookie-bearing
    // writes require browser provenance; integration APIs are read-only.
    if (origin !== request.nextUrl.origin || request.headers.get("sec-fetch-site") === "cross-site") {
      return NextResponse.json({ error: "Origen de la solicitud no permitido." }, { status: 403, headers });
    }
  }
  return NextResponse.next({ headers });
}

export const config = { matcher: ["/", "/api/:path*"] };
