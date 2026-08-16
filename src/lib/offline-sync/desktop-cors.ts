import { NextResponse } from "next/server";

/**
 * The Windows desktop client's WebView2 page origin (Tauri 2's default
 * custom-protocol origin on Windows; see apps/desktop/src-tauri/tauri.conf.json).
 * This is the only origin allowed to call the five desktop sync-contract
 * endpoints cross-origin: the website itself never calls them, since they
 * exist solely for the desktop app.
 */
export const DESKTOP_APP_ORIGIN = "https://tauri.localhost";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": DESKTOP_APP_ORIGIN,
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};

/** Applies the desktop client's CORS headers to an existing response. Every response a desktop route returns must go through this: the browser enforces CORS on error responses too, not only on success. */
export function withDesktopCors(response: NextResponse): NextResponse {
  for (const [key, value] of Object.entries(CORS_HEADERS)) response.headers.set(key, value);
  return response;
}

/** The browser's CORS preflight response for a desktop route. Without this, WebView2 blocks the real request before it is ever sent, regardless of what the route's own POST/GET handler does. */
export function desktopPreflightResponse(): NextResponse {
  return withDesktopCors(new NextResponse(null, { status: 204 }));
}
