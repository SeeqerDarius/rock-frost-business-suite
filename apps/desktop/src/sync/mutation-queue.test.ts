import { describe, expect, it } from "vitest";
import { MemoryLocalDatabase } from "@/db/memory-database";
import { createMutationId, enqueueMutation, toMutationEnvelopes } from "@/sync/mutation-queue";

describe("mutation-queue: FIFO ordering", () => {
  it("returns queued mutations in the exact order they were enqueued, not by changedAt", async () => {
    const db = new MemoryLocalDatabase();

    // Two mutations recorded with an out-of-order changedAt timestamp (as
    // could happen with clock skew or a backdated offline entry) must still
    // come back in enqueue order — ordering is the local sequence id, never
    // the timestamp. See db/schema.ts's QueuedMutationRecord doc comment.
    await enqueueMutation(db, {
      organizationId: "org-1",
      moduleKey: "fleet",
      entityType: "fleet.trip",
      entityId: "trip-1",
      baseVersion: null,
      operation: "create",
      payload: { note: "first" },
      changedAt: "2026-01-02T00:00:00.000Z",
    });
    await enqueueMutation(db, {
      organizationId: "org-1",
      moduleKey: "fleet",
      entityType: "fleet.trip",
      entityId: "trip-2",
      baseVersion: null,
      operation: "create",
      payload: { note: "second" },
      changedAt: "2026-01-01T00:00:00.000Z", // earlier changedAt, later enqueue
    });

    const queued = await db.listQueuedMutations();
    expect(queued.map((m) => (m.payload as { note: string }).note)).toEqual(["first", "second"]);
  });

  it("assigns strictly increasing local sequence ids regardless of insertion timing", async () => {
    const db = new MemoryLocalDatabase();
    const first = await enqueueMutation(db, {
      organizationId: "org-1",
      moduleKey: "inventory",
      entityType: "inventory.stock_movement",
      entityId: "mv-1",
      baseVersion: null,
      operation: "create",
      payload: {},
    });
    const second = await enqueueMutation(db, {
      organizationId: "org-1",
      moduleKey: "inventory",
      entityType: "inventory.stock_movement",
      entityId: "mv-2",
      baseVersion: null,
      operation: "create",
      payload: {},
    });
    expect(second.id).toBeGreaterThan(first.id);
  });

  it("toMutationEnvelopes maps records to the exact wire shape the contract requires", async () => {
    const db = new MemoryLocalDatabase();
    const record = await enqueueMutation(db, {
      organizationId: "org-1",
      moduleKey: "pos",
      entityType: "pos.offline_sale",
      entityId: "sale-1",
      baseVersion: 3,
      operation: "update",
      payload: { totalAmount: "10.00" },
      changedAt: "2026-01-01T00:00:00.000Z",
    });

    const [envelope] = toMutationEnvelopes([record]);
    expect(envelope).toEqual({
      organizationId: "org-1",
      moduleKey: "pos",
      entityType: "pos.offline_sale",
      entityId: "sale-1",
      mutationId: record.mutationId,
      baseVersion: 3,
      operation: "update",
      changedAt: "2026-01-01T00:00:00.000Z",
      payload: { totalAmount: "10.00" },
    });
  });
});

describe("mutation-queue: idempotency", () => {
  it("createMutationId produces unique values across calls", () => {
    const ids = new Set(Array.from({ length: 50 }, () => createMutationId()));
    expect(ids.size).toBe(50);
  });

  it("re-enqueueing the same mutationId (a retry) does not create a second queue row", async () => {
    const db = new MemoryLocalDatabase();
    const mutationId = createMutationId();

    await enqueueMutation(db, {
      mutationId,
      organizationId: "org-1",
      moduleKey: "installment",
      entityType: "installment.payment_receipt",
      entityId: "receipt-1",
      baseVersion: null,
      operation: "create",
      payload: { amount: "5.00" },
    });
    await enqueueMutation(db, {
      mutationId, // same logical mutation, e.g. retried after a lost response
      organizationId: "org-1",
      moduleKey: "installment",
      entityType: "installment.payment_receipt",
      entityId: "receipt-1",
      baseVersion: null,
      operation: "create",
      payload: { amount: "5.00" },
    });

    const queued = await db.listQueuedMutations();
    expect(queued).toHaveLength(1);
  });
});
