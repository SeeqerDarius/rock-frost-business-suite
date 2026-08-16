import { describe, expect, it } from "vitest";
import { DESKTOP_APP_ORIGIN } from "@/lib/offline-sync/desktop-cors";
import { OPTIONS as activateOptions, POST as activatePost } from "@/app/api/desktop/activate/route";
import { OPTIONS as pushOptions, POST as pushPost } from "@/app/api/desktop/sync/push/route";
import { OPTIONS as pullOptions, GET as pullGet } from "@/app/api/desktop/sync/pull/route";
import { OPTIONS as resolveOptions, POST as resolvePost } from "@/app/api/desktop/sync/conflicts/[conflictId]/resolve/route";
import { OPTIONS as deactivateOptions, POST as deactivatePost } from "@/app/api/desktop/deactivate/route";

/**
 * The desktop client's WebView origin is cross-origin from
 * app.rockfrostgroup.com, so the browser preflights every request with
 * OPTIONS and then enforces Access-Control-Allow-Origin on the *response*
 * to both the preflight and the real request. A CSP fix alone (allowing
 * connect-src) is not enough: without these headers, the browser still
 * blocks the request client-side and fetch() rejects with "Failed to
 * fetch", indistinguishable from a real outage. These tests exercise the
 * route handlers directly (no live server needed) and would fail against
 * the pre-fix routes, which never set any Access-Control-* header.
 */
describe("desktop API CORS", () => {
  it("answers the CORS preflight for every desktop sync-contract route", async () => {
    for (const options of [activateOptions, pushOptions, pullOptions, resolveOptions, deactivateOptions]) {
      const response = await options();
      expect(response.status).toBe(204);
      expect(response.headers.get("Access-Control-Allow-Origin")).toBe(DESKTOP_APP_ORIGIN);
      expect(response.headers.get("Access-Control-Allow-Methods")).toContain("POST");
      expect(response.headers.get("Access-Control-Allow-Headers")).toContain("Authorization");
    }
  });

  it("sets Access-Control-Allow-Origin on activate's error responses, not only success", async () => {
    const invalidJson = await activatePost(new Request("https://app.rockfrostgroup.com/api/desktop/activate", {
      method: "POST",
      body: "not json",
    }));
    expect(invalidJson.status).toBe(400);
    expect(invalidJson.headers.get("Access-Control-Allow-Origin")).toBe(DESKTOP_APP_ORIGIN);

    const invalidBody = await activatePost(new Request("https://app.rockfrostgroup.com/api/desktop/activate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    }));
    expect(invalidBody.status).toBe(400);
    expect(invalidBody.headers.get("Access-Control-Allow-Origin")).toBe(DESKTOP_APP_ORIGIN);
  });

  it("sets Access-Control-Allow-Origin on the 401 an unauthenticated device gets from every authenticated route", async () => {
    const unauthenticated = new Request("https://app.rockfrostgroup.com/api/desktop/sync/pull");
    const pullResponse = await pullGet(unauthenticated);
    expect(pullResponse.status).toBe(401);
    expect(pullResponse.headers.get("Access-Control-Allow-Origin")).toBe(DESKTOP_APP_ORIGIN);

    const pushResponse = await pushPost(new Request("https://app.rockfrostgroup.com/api/desktop/sync/push", { method: "POST" }));
    expect(pushResponse.status).toBe(401);
    expect(pushResponse.headers.get("Access-Control-Allow-Origin")).toBe(DESKTOP_APP_ORIGIN);

    const deactivateResponse = await deactivatePost(new Request("https://app.rockfrostgroup.com/api/desktop/deactivate", { method: "POST" }));
    expect(deactivateResponse.status).toBe(401);
    expect(deactivateResponse.headers.get("Access-Control-Allow-Origin")).toBe(DESKTOP_APP_ORIGIN);

    const resolveResponse = await resolvePost(
      new Request("https://app.rockfrostgroup.com/api/desktop/sync/conflicts/c1/resolve", { method: "POST" }),
      { params: Promise.resolve({ conflictId: "c1" }) },
    );
    expect(resolveResponse.status).toBe(401);
    expect(resolveResponse.headers.get("Access-Control-Allow-Origin")).toBe(DESKTOP_APP_ORIGIN);
  });
});
