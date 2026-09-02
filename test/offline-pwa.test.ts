import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { resolveOfflinePolicy } from "../src/lib/pwa/policy";

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

describe("offline feature policy", () => {
  it("defaults closed for organizations without an explicit rollout", () => {
    expect(resolveOfflinePolicy(null)).toEqual({ enabled: false, mutationKillSwitch: true, moduleKeys: [], leaseHours: 12 });
  });

  it("bounds leases and accepts only explicit module keys", () => {
    expect(resolveOfflinePolicy({ offlineAccess: { enabled: true, mutationKillSwitch: false, moduleKeys: ["pos", 9], leaseHours: 99 } })).toEqual({ enabled: true, mutationKillSwitch: false, moduleKeys: ["pos"], leaseHours: 24 });
  });
});

describe("PWA shell and security contract", () => {
  it("has an installable standalone manifest with maskable icons", () => {
    const manifest = JSON.parse(read("public/manifest.webmanifest"));
    expect(manifest.start_url).toBe("/app/dashboard");
    expect(manifest.display).toBe("standalone");
    expect(manifest.icons).toEqual(expect.arrayContaining([expect.objectContaining({ sizes: "192x192", purpose: "any maskable" }), expect.objectContaining({ sizes: "512x512", purpose: "any maskable" })]));
  });

  it("keeps personalized navigation and API responses out of CacheStorage", () => {
    const worker = read("public/sw.js");
    expect(worker).toContain('const SHELL = ["/offline"');
    expect(worker).toContain('if (request.mode === "navigate")');
    expect(worker).not.toContain('cache.put("/app');
    expect(worker).not.toContain("/api/");
    expect(worker).toContain('url.pathname.startsWith("/_next/static/")');
  });

  it("uses waiting-worker activation and cleans only versioned Rock Frost caches", () => {
    const worker = read("public/sw.js");
    expect(worker).toContain('event.data?.type === "ACTIVATE_UPDATE"');
    expect(worker).toContain("self.skipWaiting()");
    expect(worker).toContain('key.startsWith("rf-pwa-")');
  });

  it("requires same-origin session sync and rechecks membership, device, module, and permission", () => {
    const route = read("src/app/api/offline/sync/route.ts");
    expect(route).toContain("sameOrigin(request)");
    expect(route).toContain('membership.status !== "ACTIVE"');
    expect(route).toContain('status: "ACTIVE", platform: { startsWith: "browser:" }');
    expect(route).toContain("tenant.accessibleModuleKeys.includes(operation.module)");
    expect(route).toContain("PERMISSIONS.POS_SALES_MANAGE");
    expect(route).toContain("verifyOfflineRequestSignature");
    expect(route).toContain("device.offlineAccessUntil <= new Date()");
    expect(route).toContain('error: "unauthorized" }, { status: 401');
    expect(read("src/app/api/offline/devices/route.ts")).toContain('error: "unauthorized" }, { status: 401');
  });

  it("supports protected module adapters without last-write-wins", () => {
    const adapters = read("src/lib/pwa/server-adapters.ts");
    expect(adapters).toContain("assertVersion(operation.baseServerVersion");
    expect(adapters).toContain('"stale-vehicle-assignment"');
    expect(adapters).toContain('"stale-stock-count"');
    expect(adapters).toContain('"attendance-changed"');
    expect(adapters).toContain('"housekeeping-task-unavailable"');
    expect(adapters).toContain('offlineStatus: "DRAFT_REQUIRES_SERVER_REVIEW"');
  });

  it("uploads validated attachments before dependent operations and coordinates tabs", () => {
    const client = read("src/lib/pwa/sync-client.ts");
    const attachments = read("src/app/api/offline/attachments/route.ts");
    expect(client.indexOf("uploadDependencies")).toBeLessThan(client.indexOf('signedOfflineFetch(organizationId, userId, "/api/offline/sync"'));
    expect(client).toContain("navigator.locks.request");
    expect(client).toContain('new BroadcastChannel("rock-frost-offline-sync")');
    expect(attachments).toContain("hasValidSignature");
    expect(attachments).toContain("MAX_ATTACHMENT_BYTES");
  });

  it("exposes explicit local and server conflict values", () => {
    const route = read("src/app/api/offline/conflicts/route.ts");
    const center = read("src/app/app/(overview)/account/offline/sync-center.tsx");
    expect(route).toContain("localValue");
    expect(route).toContain("serverValue");
    expect(route).toContain("serverChangedAt");
    expect(route).toContain("allowedResolutions");
    expect(center).toContain("Compare values");
    expect(center).toContain("Request manager review");
  });
});
