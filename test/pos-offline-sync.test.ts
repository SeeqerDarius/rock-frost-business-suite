import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import "fake-indexeddb/auto";

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

function installBrowserStub() {
  const store = new Map<string, string>();
  (globalThis as { window?: unknown }).window = {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => { store.set(key, value); },
      removeItem: (key: string) => { store.delete(key); },
    },
  };
}

describe("POS IndexedDB offline queue", () => {
  let queue: typeof import("../src/app/app/pos/sell/offline-queue");
  const sale = (clientRequestId: string) => ({
    clientRequestId,
    sessionId: "sess-1",
    customerName: null,
    lines: [{ itemId: "item-1", description: "Widget", quantity: 1, unitPrice: "10.00" }],
    payments: [{ method: "CASH", amount: "10.00", reference: null }],
    mode: "COMPLETED" as const,
    occurredAt: "2026-08-24T00:00:00.000Z",
  });

  beforeEach(async () => {
    vi.resetModules();
    installBrowserStub();
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase("rock-frost-offline-v1");
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
    queue = await import("../src/app/app/pos/sell/offline-queue");
    const storage = await import("../src/lib/pwa/indexed-db");
    const future = new Date(Date.now() + 60_000).toISOString();
    for (const [organizationId, userId, deviceId] of [["org-1", "user-1", "device-1"], ["org-2", "user-1", "device-2"], ["org-1", "user-2", "device-3"]]) {
      await storage.saveOfflineDeviceRegistration({ key: `device:${organizationId}:${userId}`, deviceId, installationId: `installation-${deviceId}`, organizationId, userId, moduleKeys: ["pos"], offlineAccessUntil: future, mutationKillSwitch: false });
    }
  });

  afterEach(() => { delete (globalThis as { window?: unknown }).window; });

  it("starts empty and persists a queued sale", async () => {
    await expect(queue.listQueuedSales("org-1", "user-1")).resolves.toEqual([]);
    await queue.enqueueSale("org-1", "user-1", sale("req-1"));
    await expect(queue.listQueuedSales("org-1", "user-1")).resolves.toEqual([sale("req-1")]);
  });

  it("isolates organization and user partitions", async () => {
    await queue.enqueueSale("org-1", "user-1", sale("req-1"));
    await queue.enqueueSale("org-2", "user-1", sale("req-2"));
    await queue.enqueueSale("org-1", "user-2", sale("req-3"));
    await expect(queue.listQueuedSales("org-1", "user-1")).resolves.toEqual([sale("req-1")]);
    await expect(queue.listQueuedSales("org-2", "user-1")).resolves.toEqual([sale("req-2")]);
    await expect(queue.listQueuedSales("org-1", "user-2")).resolves.toEqual([sale("req-3")]);
  });

  it("removes only the owned queued sale after confirmed synchronization", async () => {
    await queue.enqueueSale("org-1", "user-1", sale("req-1"));
    await queue.enqueueSale("org-1", "user-1", sale("req-2"));
    await queue.removeQueuedSale("org-1", "user-1", "req-1");
    expect((await queue.listQueuedSales("org-1", "user-1")).map((entry) => entry.clientRequestId)).toEqual(["req-2"]);
  });

  it("retains a permanent sync rejection for attention", async () => {
    await queue.enqueueSale("org-1", "user-1", sale("req-1"));
    await queue.markQueuedSaleError("org-1", "user-1", "req-1", "There isn't enough stock.");
    expect((await queue.listQueuedSales("org-1", "user-1"))[0].lastError).toBe("There isn't enough stock.");
  });

  it("migrates a legacy localStorage queue into the current user partition", async () => {
    window.localStorage.setItem("rf-pos-offline-queue:org-1", JSON.stringify([sale("legacy-1")]));
    await expect(queue.listQueuedSales("org-1", "user-1")).resolves.toEqual([sale("legacy-1")]);
    expect(window.localStorage.getItem("rf-pos-offline-queue:org-1")).toBeNull();
  });

  it("refuses capture when the server kill switch is active", async () => {
    const storage = await import("../src/lib/pwa/indexed-db");
    await storage.saveOfflineDeviceRegistration({ key: "device:org-1:user-1", deviceId: "device-1", installationId: "installation-1", organizationId: "org-1", userId: "user-1", moduleKeys: ["pos"], offlineAccessUntil: new Date(Date.now() + 60_000).toISOString(), mutationKillSwitch: true });
    await expect(queue.enqueueSale("org-1", "user-1", sale("blocked-1"))).rejects.toThrow("not authorized");
  });

  it("generates distinct request identifiers", () => {
    expect(new Set(Array.from({ length: 20 }, () => queue.generateClientRequestId())).size).toBe(20);
  });
});

describe("POS offline server-confirmation safeguards", () => {
  it("keeps server validation, permission, accounting, and audit controls", () => {
    const source = read("src/app/app/pos/sell/actions.ts");
    expect(source).toContain('requireModuleAccess("pos")');
    expect(source).toContain("PERMISSIONS.POS_SALES_MANAGE");
    expect(source).toContain("postModuleRevenue");
    expect(source).toContain("logAuditEvent");
    expect(source).toContain("clientRequestId: parsed.data.clientRequestId");
  });

  it("uses asynchronous IndexedDB queue operations and pending language", () => {
    const source = read("src/app/app/pos/sell/sale-cart.tsx");
    expect(source).toContain("await enqueueSale(organizationId, userId, queuedEntry)");
    expect(source).toContain("Recorded offline. Awaiting synchronization");
    expect(source).toContain('window.addEventListener("online", handleOnline)');
    expect(source).toContain("synchronizeQueuedSales(organizationId, userId)");
    expect(read("src/app/app/pos/sell/offline-queue.ts")).toContain("synchronizeOfflineOperations(organizationId, userId)");
  });

  it("keeps new catalogue writes unavailable offline", () => {
    const source = read("src/app/app/pos/sell/product-picker.tsx");
    expect(source).toContain("disabled={!isOnline}");
    expect(source).toContain("Adding a new product needs a connection");
  });
});
