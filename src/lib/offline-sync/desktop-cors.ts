import { NextResponse } from "next/server";

/**
 * Tauri 2's WebView2 apps load their content from a `<scheme>://<host>.localhost`
 * style custom-protocol origin, never from the API's own origin. The real
 * origin, confirmed from a production Vercel log line this route's own
 * console.warn below produced, is exactly `http://tauri.localhost` - plain
 * HTTP, not HTTPS, despite Tauri's asset: and ipc: helper origins (see the
 * CSP in apps/desktop/src-tauri/tauri.conf.json) using https. A hardcoded
 * guess at the exact origin is fragile and, worse, the browser's CORS check
 * requires Access-Control-Allow-Origin to exactly equal the request's real
 * Origin header - a guessed constant that doesn't match still gets silently
 * rejected client-side with "Failed to fetch", indistinguishable from every
 * other cause of that message. This matches the general shape instead and
 * echoes back the real Origin that was actually sent. No public website can
 * forge this Origin: getting the browser to send "Origin: <scheme>://X.localhost"
 * requires the request to genuinely originate from something already
 * running on the local machine under that hostname, which is exactly the
 * desktop app and nothing an internet-hosted page can spoof.
 */
const DESKTOP_ORIGIN_PATTERN = /^https?:\/\/[a-z0-9-]+\.localhost$/i;

function resolveAllowedOrigin(request: Request): string | null {
  const origin = request.headers.get("origin");
  return origin && DESKTOP_ORIGIN_PATTERN.test(origin) ? origin : null;
}

/** Applies the desktop client's CORS headers to an existing response. Every response a desktop route returns must go through this: the browser enforces CORS on error responses too, not only on success. */
export function withDesktopCors(response: NextResponse, request: Request): NextResponse {
  const allowedOrigin = resolveAllowedOrigin(request);
  if (allowedOrigin) {
    response.headers.set("Access-Control-Allow-Origin", allowedOrigin);
    response.headers.set("Vary", "Origin");
  } else {
    const origin = request.headers.get("origin");
    if (origin) console.warn("Desktop CORS: Origin did not match the expected desktop app pattern", { origin });
  }
  response.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  response.headers.set("Access-Control-Max-Age", "86400");
  return response;
}

/** The browser's CORS preflight response for a desktop route. Without this, WebView2 blocks the real request before it is ever sent, regardless of what the route's own POST/GET handler does. */
export function desktopPreflightResponse(request: Request): NextResponse {
  return withDesktopCors(new NextResponse(null, { status: 204 }), request);
}
