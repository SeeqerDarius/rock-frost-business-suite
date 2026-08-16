import { describe, expect, it } from "vitest";
import { OPTIONS as activateOptions, POST as activatePost } from "@/app/api/desktop/activate/route";
import { OPTIONS as pushOptions, POST as pushPost } from "@/app/api/desktop/sync/push/route";
import { OPTIONS as pullOptions, GET as pullGet } from "@/app/api/desktop/sync/pull/route";
import { OPTIONS as resolveOptions, POST as resolvePost } from "@/app/api/desktop/sync/conflicts/[conflictId]/resolve/route";
import { OPTIONS as deactivateOptions, POST as deactivatePost } from "@/app/api/desktop/deactivate/route";

/**
 * The desktop client's WebView origin is cross-origin from
 * app.rockfrostgroup.com, so the browser preflights every request with
 * OPTIONS and then enforces Access-Control-Allow-Origin on the *response*
 * to both the preflight and the real request, matched exactly against the
 * request's own Origin header. A CSP fix alone is not enough, and neither
 * is a hardcoded Access-Control-Allow-Origin guess that doesn't match the
 * real Origin the app sends: either way the browser blocks the request
 * client-side and fetch() rejects with "Failed to fetch", indistinguishable
 * from a real outage. These tests exercise the route handlers directly (no
 * live server needed) and would fail against routes that never set the
 * header, or that echo back a fixed value instead of the real Origin.
 */
// Confirmed from a production Vercel log line (this file's own
// console.warn diagnostic) rather than assumed: the real desktop app
// sends plain HTTP, not HTTPS, despite Tauri's other helper origins
// (asset:, ipc:) using https in the CSP.
const REAL_DESKTOP_ORIGIN = "http://tauri.localhost";

function requestWithOrigin(url: string, origin: string | null, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (origin) headers.set("Origin", origin);
  return new Request(url, { ...init, headers });
}

describe("desktop API CORS", () => {
  it("reflects the real desktop app Origin on the preflight for every desktop sync-contract route", async () => {
    for (const options of [activateOptions, pushOptions, pullOptions, resolveOptions, deactivateOptions]) {
      const request = requestWithOrigin("https://app.rockfrostgroup.com/api/desktop/x", REAL_DESKTOP_ORIGIN);
      const response = await options(request);
      expect(response.status).toBe(204);
      expect(response.headers.get("Access-Control-Allow-Origin")).toBe(REAL_DESKTOP_ORIGIN);
      expect(response.headers.get("Access-Control-Allow-Methods")).toContain("POST");
      expect(response.headers.get("Access-Control-Allow-Headers")).toContain("Authorization");
    }
  });

  it("does not guess or hardcode a single allowed origin: both http and https desktop-shaped Origins are reflected", async () => {
    // Guards against the exact regression this test file previously missed
    // twice: first a hardcoded Access-Control-Allow-Origin that happened to
    // equal one guessed value (passed a naive test, broke the real app
    // anyway), then a pattern that only accepted https:// when the real app
    // actually sends http://tauri.localhost.
    for (const otherOrigin of ["https://rock-frost-desktop.localhost", "http://tauri.localhost", "https://tauri.localhost"]) {
      const response = await activateOptions(requestWithOrigin("https://app.rockfrostgroup.com/api/desktop/activate", otherOrigin));
      expect(response.headers.get("Access-Control-Allow-Origin")).toBe(otherOrigin);
    }
  });

  it("does not set Access-Control-Allow-Origin for a request Origin that does not look like the desktop app", async () => {
    const response = await activateOptions(requestWithOrigin("https://app.rockfrostgroup.com/api/desktop/activate", "https://evil.example.com"));
    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("sets Access-Control-Allow-Origin on activate's error responses, not only success", async () => {
    const invalidJson = await activatePost(requestWithOrigin("https://app.rockfrostgroup.com/api/desktop/activate", REAL_DESKTOP_ORIGIN, {
      method: "POST",
      body: "not json",
    }));
    expect(invalidJson.status).toBe(400);
    expect(invalidJson.headers.get("Access-Control-Allow-Origin")).toBe(REAL_DESKTOP_ORIGIN);

    const invalidBody = await activatePost(requestWithOrigin("https://app.rockfrostgroup.com/api/desktop/activate", REAL_DESKTOP_ORIGIN, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    }));
    expect(invalidBody.status).toBe(400);
    expect(invalidBody.headers.get("Access-Control-Allow-Origin")).toBe(REAL_DESKTOP_ORIGIN);
  });

  it("sets Access-Control-Allow-Origin on the 401 an unauthenticated device gets from every authenticated route", async () => {
    const pullResponse = await pullGet(requestWithOrigin("https://app.rockfrostgroup.com/api/desktop/sync/pull", REAL_DESKTOP_ORIGIN));
    expect(pullResponse.status).toBe(401);
    expect(pullResponse.headers.get("Access-Control-Allow-Origin")).toBe(REAL_DESKTOP_ORIGIN);

    const pushResponse = await pushPost(requestWithOrigin("https://app.rockfrostgroup.com/api/desktop/sync/push", REAL_DESKTOP_ORIGIN, { method: "POST" }));
    expect(pushResponse.status).toBe(401);
    expect(pushResponse.headers.get("Access-Control-Allow-Origin")).toBe(REAL_DESKTOP_ORIGIN);

    const deactivateResponse = await deactivatePost(requestWithOrigin("https://app.rockfrostgroup.com/api/desktop/deactivate", REAL_DESKTOP_ORIGIN, { method: "POST" }));
    expect(deactivateResponse.status).toBe(401);
    expect(deactivateResponse.headers.get("Access-Control-Allow-Origin")).toBe(REAL_DESKTOP_ORIGIN);

    const resolveResponse = await resolvePost(
      requestWithOrigin("https://app.rockfrostgroup.com/api/desktop/sync/conflicts/c1/resolve", REAL_DESKTOP_ORIGIN, { method: "POST" }),
      { params: Promise.resolve({ conflictId: "c1" }) },
    );
    expect(resolveResponse.status).toBe(401);
    expect(resolveResponse.headers.get("Access-Control-Allow-Origin")).toBe(REAL_DESKTOP_ORIGIN);
  });
});
