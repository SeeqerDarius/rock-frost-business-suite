import { describe, expect, it, vi } from "vitest";
import { MemoryLocalDatabase } from "@/db/memory-database";
import { SyncEngine } from "@/sync/sync-engine";
import type { SyncClient } from "@/sync/sync-client";
import { SyncClientError, type SyncPullResponse, type SyncPushResponse } from "@/contract/sync-contract";

const emptyPull = (): SyncPullResponse => ({ generatedAt: "2026-08-15T00:00:00.000Z", offlineAccessUntil: "2026-08-18T00:00:00.000Z", fullSnapshot: true, truncated: false, snapshot: {} });
const emptyPush = (): SyncPushResponse => ({ results: [], offlineAccessUntil: "2026-08-18T00:00:00.000Z" });
function fakeClient(overrides: Partial<Pick<SyncClient, "pull" | "push">> = {}): SyncClient {
  return { pull: overrides.pull ?? vi.fn(async () => emptyPull()), push: overrides.push ?? vi.fn(async () => emptyPush()), callWithRetry: async (operation: () => Promise<unknown>) => operation() } as unknown as SyncClient;
}
function deps(overrides: Record<string, unknown> = {}) {
  return { db: new MemoryLocalDatabase(), client: fakeClient(), enabledModuleKeys: ["fleet"] as const, deviceId: "device-1", onRevoked: vi.fn(async () => {}), onSessionExpired: vi.fn(async () => {}), ...overrides };
}

describe("SyncEngine", () => {
  it("stores the bounded full snapshot and its generated timestamp", async () => {
    const pull = vi.fn(async (): Promise<SyncPullResponse> => ({ ...emptyPull(), snapshot: { fleet: { vehicles: [{ id: "v1" }] } } }));
    const setup = deps({ client: fakeClient({ pull }) }); const engine = new SyncEngine(setup as never); await engine.syncNow();
    expect(pull).toHaveBeenCalledWith();
    expect(await setup.db.getCachedRecord("fleet", "fleet.snapshot", "full")).toMatchObject({ payload: { vehicles: [{ id: "v1" }] } });
    expect(await setup.db.getCachedRecord("fleet", "fleet.offline_authorization", "device-1")).toMatchObject({ payload: { offlineAccessUntil: "2026-08-18T00:00:00.000Z" } });
    expect(await setup.db.getSyncCursor("fleet")).toBe("2026-08-15T00:00:00.000Z");
  });

  it("pushes without a deviceId and clears a successfully applied pending badge", async () => {
    const setup = deps(); const mutationId = crypto.randomUUID();
    await setup.db.enqueueMutation({ mutationId, organizationId: "org-1", moduleKey: "fleet", entityType: "fleet.maintenance_request", entityId: "m1", baseVersion: 0, operation: "CREATE", payload: { vehicleId: "v1" }, changedAt: new Date().toISOString() });
    await setup.db.upsertCachedRecord({ moduleKey: "fleet", entityType: "fleet.maintenance_request", entityId: "m1", version: 0, payload: { vehicleId: "v1" }, hasPendingLocalChange: true, updatedAt: new Date().toISOString(), updatedByUserId: null, updatedByUserName: null });
    const push = vi.fn(async (): Promise<SyncPushResponse> => ({ results: [{ mutationId, status: "applied", result: { id: "cloud-1" }, errorCode: null }], offlineAccessUntil: "2026-08-18T00:00:00.000Z" }));
    await new SyncEngine({ ...setup, client: fakeClient({ push }) } as never).syncNow();
    expect(push).toHaveBeenCalledWith(expect.not.objectContaining({ deviceId: expect.anything() }));
    expect((await setup.db.getCachedRecord("fleet", "fleet.maintenance_request", "m1"))?.hasPendingLocalChange).toBe(false);
  });

  it("keeps processing results pending for safe retry", async () => {
    const setup = deps(); const mutationId = crypto.randomUUID();
    await setup.db.enqueueMutation({ mutationId, organizationId: "org-1", moduleKey: "fleet", entityType: "fleet.maintenance_request", entityId: "m1", baseVersion: 0, operation: "CREATE", payload: {}, changedAt: new Date().toISOString() });
    const push = vi.fn(async (): Promise<SyncPushResponse> => ({ results: [{ mutationId, status: "processing", result: null, errorCode: null }], offlineAccessUntil: "2026-08-18T00:00:00.000Z" }));
    await new SyncEngine({ ...setup, client: fakeClient({ push }) } as never).syncNow();
    expect((await setup.db.getQueuedMutationByMutationId(mutationId))?.status).toBe("pending");
  });

  it("routes 403 responses through remote revocation", async () => {
    const onRevoked = vi.fn(async () => {}); const pull = vi.fn(async () => { throw new SyncClientError("revoked_or_unauthorized", "Revoked", 403); });
    const engine = new SyncEngine(deps({ onRevoked, client: fakeClient({ pull }) }) as never); await engine.syncNow();
    expect(onRevoked).toHaveBeenCalledOnce(); expect(engine.getStatus().state).toBe("revoked");
  });
});
