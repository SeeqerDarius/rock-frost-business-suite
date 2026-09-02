import { beforeEach, describe, expect, it, vi } from "vitest";
import "fake-indexeddb/auto";

describe("expanded offline IndexedDB", () => {
  beforeEach(async () => {
    vi.resetModules();
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase("rock-frost-offline-v1");
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: { storage: { estimate: vi.fn().mockResolvedValue({ usage: 100, quota: 10_000 }) } } });
  });

  it("migrates to the complete set of durable stores", async () => {
    const { openOfflineDatabase } = await import("../src/lib/pwa/indexed-db");
    const database = await openOfflineDatabase();
    expect(Array.from(database.objectStoreNames)).toEqual(expect.arrayContaining(["workspaces", "operations", "records", "workPacks", "attachments", "syncAttempts", "conflicts", "meta"]));
    database.close();
  });

  it("partitions attachments and sync attempts by organization and user", async () => {
    const storage = await import("../src/lib/pwa/indexed-db");
    await storage.putOfflineAttachment({ attachmentId: "a", organizationId: "org-a", userId: "user-a", module: "fleet", deviceId: "device-a", operationId: "op-a", fileName: "a.png", mimeType: "image/png", size: 1, blob: new Blob(["a"]), createdAt: new Date().toISOString(), status: "pending" });
    await storage.putOfflineAttachment({ attachmentId: "b", organizationId: "org-b", userId: "user-a", module: "fleet", deviceId: "device-b", operationId: "op-b", fileName: "b.png", mimeType: "image/png", size: 1, blob: new Blob(["b"]), createdAt: new Date().toISOString(), status: "pending" });
    await storage.putOfflineSyncAttempt({ attemptId: "attempt-a", organizationId: "org-a", userId: "user-a", deviceId: "device-a", startedAt: new Date().toISOString(), operationCount: 1, outcome: "running" });
    expect((await storage.listOfflineAttachments("org-a", "user-a")).map((item) => item.attachmentId)).toEqual(["a"]);
    expect((await storage.listOfflineSyncAttempts("org-a", "user-a")).map((item) => item.attemptId)).toEqual(["attempt-a"]);
  });

  it("does not return expired work packs after a browser restart", async () => {
    const storage = await import("../src/lib/pwa/indexed-db");
    await storage.putOfflineWorkPack({ key: "expired", organizationId: "org", userId: "user", module: "school", deviceId: "device", workPackType: "attendance", workPackId: "expired", title: "Expired", records: [], serverVersion: 1, downloadedAt: new Date(0).toISOString(), expiresAt: new Date(1).toISOString(), sizeBytes: 0 });
    await storage.putOfflineWorkPack({ key: "active", organizationId: "org", userId: "user", module: "school", deviceId: "device", workPackType: "attendance", workPackId: "active", title: "Active", records: [], serverVersion: 2, downloadedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60_000).toISOString(), sizeBytes: 0 });
    expect((await storage.listOfflineWorkPacks("org", "user")).map((item) => item.key)).toEqual(["active"]);
  });

  it("fails closed when storage reaches the bounded quota", async () => {
    vi.mocked(navigator.storage.estimate).mockResolvedValue({ usage: 8_500, quota: 10_000 });
    const { ensureOfflineCapacity } = await import("../src/lib/pwa/indexed-db");
    await expect(ensureOfflineCapacity(1)).rejects.toThrow("nearly full");
  });

  it("purges every local store for a revoked user", async () => {
    const storage = await import("../src/lib/pwa/indexed-db");
    await storage.saveWorkspaceSnapshot({ partitionKey: "org:user", organizationId: "org", organizationName: "Org", userId: "user", role: null, permissions: [], moduleKeys: [], branch: null, capturedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60_000).toISOString() });
    await storage.putOfflineConflict({ conflictId: "conflict", operationId: "op", organizationId: "org", userId: "user", deviceId: "device", module: "inventory", entityType: "inventory.count-line", workflow: "count", localValue: {}, serverValue: {}, localChangedAt: new Date().toISOString(), allowedResolutions: ["KEEP_SERVER"], status: "open" });
    await storage.purgeOfflineDataForUser("user");
    await expect(storage.listWorkspaceSnapshots()).resolves.toEqual([]);
    await expect(storage.listOfflineConflicts("org", "user")).resolves.toEqual([]);
  });

  it("purges a revoked module without touching another tenant module", async () => {
    const storage = await import("../src/lib/pwa/indexed-db");
    const operation = (operationId: string, module: string) => ({ operationId, organizationId: "org", userId: "user", deviceId: "device", module, entityType: `${module}.draft`, entityId: operationId, operationType: "draft", clientTimestamp: new Date().toISOString(), baseServerVersion: 0, idempotencyKey: operationId, payloadSchemaVersion: 1, payload: {}, attachmentReferences: [], dependencyIds: [], status: "pending" as const, attempts: 0, nextAttemptAt: new Date().toISOString() });
    await storage.enqueueOfflineOperation(operation("fleet-op", "fleet"));
    await storage.enqueueOfflineOperation(operation("school-op", "school"));
    await storage.purgeOfflineModuleData("org", "user", "fleet");
    expect((await storage.listOfflineOperations("org", "user")).map((item) => item.operationId)).toEqual(["school-op"]);
  });
});
