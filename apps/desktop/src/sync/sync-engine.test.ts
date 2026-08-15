import { describe, expect, it, vi } from "vitest";
import { MemoryLocalDatabase } from "@/db/memory-database";
import { SyncEngine } from "@/sync/sync-engine";
import type { SyncClient } from "@/sync/sync-client";
import { SyncClientError, type SyncPullResponse, type SyncPushResponse } from "@/contract/sync-contract";

/**
 * A minimal stand-in for SyncClient exposing exactly the surface
 * SyncEngine calls (pull, push, callWithRetry). callWithRetry here just
 * invokes the operation once — retry.ts's own backoff behavior is already
 * covered in retry.test.ts, so this test suite can focus purely on the
 * engine's orchestration logic.
 */
function fakeClient(overrides: Partial<Pick<SyncClient, "pull" | "push">> = {}): SyncClient {
  return {
    pull: overrides.pull ?? vi.fn(async (): Promise<SyncPullResponse> => ({ records: [], hasMore: false, nextCursor: "cursor-0" })),
    push: overrides.push ?? vi.fn(async (): Promise<SyncPushResponse> => ({ outcomes: [], cursorAfterPush: "cursor-0" })),
    callWithRetry: async (operation: () => Promise<unknown>) => operation(),
  } as unknown as SyncClient;
}

function baseDeps(overrides: Partial<ConstructorParameters<typeof SyncEngine>[0]> = {}) {
  const db = new MemoryLocalDatabase();
  return {
    db,
    client: fakeClient(),
    enabledModuleKeys: ["fleet"] as const,
    deviceId: "device-1",
    onRevoked: vi.fn(async () => {}),
    onSessionExpired: vi.fn(async () => {}),
    ...overrides,
  };
}

describe("SyncEngine: cursor handling", () => {
  it("follows hasMore across multiple pull pages and persists the final cursor", async () => {
    const pull = vi
      .fn()
      .mockResolvedValueOnce({ records: [], hasMore: true, nextCursor: "cursor-1" } satisfies SyncPullResponse)
      .mockResolvedValueOnce({ records: [], hasMore: true, nextCursor: "cursor-2" } satisfies SyncPullResponse)
      .mockResolvedValueOnce({ records: [], hasMore: false, nextCursor: "cursor-3" } satisfies SyncPullResponse);

    const deps = baseDeps({ client: fakeClient({ pull }) });
    const engine = new SyncEngine(deps as never);
    await engine.syncNow();

    expect(pull).toHaveBeenCalledTimes(3);
    expect(pull).toHaveBeenNthCalledWith(1, "");
    expect(pull).toHaveBeenNthCalledWith(2, "cursor-1");
    expect(pull).toHaveBeenNthCalledWith(3, "cursor-2");
    expect(await deps.db.getSyncCursor("fleet")).toBe("cursor-3");
  });

  it("resumes from the last persisted cursor on a later sync rather than starting over", async () => {
    const deps = baseDeps();
    await deps.db.setSyncCursor("fleet", "resume-from-here");
    const pull = vi.fn(async (): Promise<SyncPullResponse> => ({ records: [], hasMore: false, nextCursor: "resume-from-here-next" }));
    const engine = new SyncEngine({ ...deps, client: fakeClient({ pull }) } as never);

    await engine.syncNow();

    expect(pull).toHaveBeenCalledWith("resume-from-here");
  });

  it("applies pulled records into the local cache, and removes tombstoned ones", async () => {
    const deps = baseDeps();
    await deps.db.upsertCachedRecord({
      moduleKey: "fleet",
      entityType: "fleet.trip",
      entityId: "trip-old",
      version: 1,
      payload: {},
      hasPendingLocalChange: false,
      updatedAt: "2026-01-01T00:00:00.000Z",
      updatedByUserId: null,
      updatedByUserName: null,
    });

    const pull = vi.fn(async (): Promise<SyncPullResponse> => ({
      hasMore: false,
      nextCursor: "c1",
      records: [
        { moduleKey: "fleet", entityType: "fleet.trip", entityId: "trip-new", version: 1, payload: { note: "hi" }, deleted: false, updatedAt: "2026-01-02T00:00:00.000Z", updatedByUserId: "u1", updatedByUserName: "Ama" },
        { moduleKey: "fleet", entityType: "fleet.trip", entityId: "trip-old", version: 2, payload: null, deleted: true, updatedAt: "2026-01-02T00:00:00.000Z", updatedByUserId: null, updatedByUserName: null },
      ],
    }));
    const engine = new SyncEngine({ ...deps, client: fakeClient({ pull }) } as never);
    await engine.syncNow();

    expect(await deps.db.getCachedRecord("fleet", "fleet.trip", "trip-new")).toMatchObject({ payload: { note: "hi" } });
    expect(await deps.db.getCachedRecord("fleet", "fleet.trip", "trip-old")).toBeNull();
  });

  it("never overwrites a cached record that still has an unsent local mutation pending", async () => {
    const deps = baseDeps();
    await deps.db.upsertCachedRecord({
      moduleKey: "fleet",
      entityType: "fleet.trip",
      entityId: "trip-1",
      version: 1,
      payload: { note: "my local edit" },
      hasPendingLocalChange: true,
      updatedAt: "2026-01-01T00:00:00.000Z",
      updatedByUserId: null,
      updatedByUserName: null,
    });

    const pull = vi.fn(async (): Promise<SyncPullResponse> => ({
      hasMore: false,
      nextCursor: "c1",
      records: [{ moduleKey: "fleet", entityType: "fleet.trip", entityId: "trip-1", version: 5, payload: { note: "cloud value" }, deleted: false, updatedAt: "2026-01-02T00:00:00.000Z", updatedByUserId: null, updatedByUserName: null }],
    }));
    const engine = new SyncEngine({ ...deps, client: fakeClient({ pull }) } as never);
    await engine.syncNow();

    const record = await deps.db.getCachedRecord("fleet", "fleet.trip", "trip-1");
    expect(record?.payload).toEqual({ note: "my local edit" });
    expect(record?.hasPendingLocalChange).toBe(true);
  });
});

describe("SyncEngine: push outcome handling", () => {
  it("marks an applied mutation as applied and clears its pending flag", async () => {
    const deps = baseDeps();
    const queued = await deps.db.enqueueMutation({
      mutationId: crypto.randomUUID(),
      organizationId: "org-1",
      moduleKey: "fleet",
      entityType: "fleet.trip",
      entityId: "trip-1",
      baseVersion: null,
      operation: "create",
      payload: { note: "x" },
      changedAt: new Date().toISOString(),
    });
    await deps.db.upsertCachedRecord({
      moduleKey: "fleet",
      entityType: "fleet.trip",
      entityId: "trip-1",
      version: 0,
      payload: { note: "x" },
      hasPendingLocalChange: true,
      updatedAt: new Date().toISOString(),
      updatedByUserId: null,
      updatedByUserName: null,
    });

    const push = vi.fn(async (): Promise<SyncPushResponse> => ({
      outcomes: [{ mutationId: queued.mutationId, status: "applied", newVersion: 1 }],
      cursorAfterPush: "c1",
    }));
    const engine = new SyncEngine({ ...deps, client: fakeClient({ push }) } as never);
    await engine.syncNow();

    const mutation = await deps.db.getQueuedMutationByMutationId(queued.mutationId);
    expect(mutation?.status).toBe("applied");
    const record = await deps.db.getCachedRecord("fleet", "fleet.trip", "trip-1");
    expect(record?.hasPendingLocalChange).toBe(false);
    expect(record?.version).toBe(1);
  });

  it("stores a conflict outcome as an open conflict and marks the mutation as conflict, never auto-resolving it", async () => {
    const deps = baseDeps();
    const queued = await deps.db.enqueueMutation({
      mutationId: crypto.randomUUID(),
      organizationId: "org-1",
      moduleKey: "fleet",
      entityType: "fleet.driver_payment",
      entityId: "pay-1",
      baseVersion: 3,
      operation: "create",
      payload: { amount: "10.00" },
      changedAt: new Date().toISOString(),
    });

    const push = vi.fn(async (): Promise<SyncPushResponse> => ({
      outcomes: [
        {
          mutationId: queued.mutationId,
          status: "conflict",
          conflict: {
            conflictId: "conflict-1",
            moduleKey: "fleet",
            entityType: "fleet.driver_payment",
            entityId: "pay-1",
            allowedResolutions: ["keep_cloud"],
            localValue: { amount: "10.00" },
            localChangedAt: new Date().toISOString(),
            localChangedByUserName: "Ama",
            cloudValue: { amount: "12.00" },
            cloudChangedAt: new Date().toISOString(),
            cloudChangedByUserName: "Kojo",
          },
        },
      ],
      cursorAfterPush: "c1",
    }));
    const engine = new SyncEngine({ ...deps, client: fakeClient({ push }) } as never);
    await engine.syncNow();

    const mutation = await deps.db.getQueuedMutationByMutationId(queued.mutationId);
    expect(mutation?.status).toBe("conflict");
    const conflicts = await deps.db.listConflicts("open");
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.conflictId).toBe("conflict-1");
    expect(engine.getStatus().state).toBe("conflicts_pending");
  });

  it("marks a rejected mutation as rejected with its reason, and does not touch the cached record", async () => {
    const deps = baseDeps();
    const queued = await deps.db.enqueueMutation({
      mutationId: crypto.randomUUID(),
      organizationId: "org-1",
      moduleKey: "fleet",
      entityType: "fleet.trip",
      entityId: "trip-1",
      baseVersion: null,
      operation: "create",
      payload: {},
      changedAt: new Date().toISOString(),
    });

    const push = vi.fn(async (): Promise<SyncPushResponse> => ({
      outcomes: [{ mutationId: queued.mutationId, status: "rejected", rejectionReason: "Vehicle no longer exists." }],
      cursorAfterPush: "c1",
    }));
    const engine = new SyncEngine({ ...deps, client: fakeClient({ push }) } as never);
    await engine.syncNow();

    const mutation = await deps.db.getQueuedMutationByMutationId(queued.mutationId);
    expect(mutation).toMatchObject({ status: "rejected", rejectionReason: "Vehicle no longer exists." });
  });
});

describe("SyncEngine: special-case responses", () => {
  it("calls onRevoked and sets state 'revoked' on a 403", async () => {
    const onRevoked = vi.fn(async () => {});
    const pull = vi.fn(async () => {
      throw new SyncClientError("revoked_or_unauthorized", "Device revoked.", 403);
    });
    const deps = baseDeps({ onRevoked, client: fakeClient({ pull }) });
    const engine = new SyncEngine(deps as never);
    await engine.syncNow();

    expect(onRevoked).toHaveBeenCalledTimes(1);
    expect(engine.getStatus().state).toBe("revoked");
  });

  it("calls onSessionExpired and sets state 'session_expired' on a 401, since this contract has no refresh endpoint", async () => {
    const onSessionExpired = vi.fn(async () => {});
    const pull = vi.fn(async () => {
      throw new SyncClientError("expired_auth", "Token expired.", 401);
    });
    const deps = baseDeps({ onSessionExpired, client: fakeClient({ pull }) });
    const engine = new SyncEngine(deps as never);
    await engine.syncNow();

    expect(onSessionExpired).toHaveBeenCalledTimes(1);
    expect(engine.getStatus().state).toBe("session_expired");
  });

  it("sets state 'offline' on a network error without calling onRevoked or onSessionExpired", async () => {
    const onRevoked = vi.fn(async () => {});
    const onSessionExpired = vi.fn(async () => {});
    const pull = vi.fn(async () => {
      throw new SyncClientError("network_error", "fetch failed");
    });
    const deps = baseDeps({ onRevoked, onSessionExpired, client: fakeClient({ pull }) });
    const engine = new SyncEngine(deps as never);
    await engine.syncNow();

    expect(engine.getStatus()).toMatchObject({ state: "offline", isOnline: false });
    expect(onRevoked).not.toHaveBeenCalled();
    expect(onSessionExpired).not.toHaveBeenCalled();
  });

  it("does not start a second overlapping sync while one is already in flight", async () => {
    // The deferred promise is created up front (not inside the mock
    // implementation) so `resolvePull` is guaranteed assigned before
    // syncNow() is ever called — pull() itself is only actually invoked a
    // few microtask ticks into runSyncCycle(), so capturing the resolver
    // from inside the mock's own executor would race against that.
    let resolvePull!: () => void;
    const pending = new Promise<SyncPullResponse>((resolve) => {
      resolvePull = () => resolve({ records: [], hasMore: false, nextCursor: "c1" });
    });
    const pull = vi.fn(() => pending);
    const deps = baseDeps({ client: fakeClient({ pull }) });
    const engine = new SyncEngine(deps as never);

    const first = engine.syncNow();
    const second = engine.syncNow();
    resolvePull();
    await Promise.all([first, second]);

    expect(pull).toHaveBeenCalledTimes(1);
  });
});
