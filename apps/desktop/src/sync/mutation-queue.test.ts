import { describe, expect, it } from "vitest";
import { MemoryLocalDatabase } from "@/db/memory-database";
import { enqueueMutation, toMutationEnvelopes } from "@/sync/mutation-queue";

describe("offline mutation queue", () => {
  it("keeps one idempotent FIFO record for a repeated mutation ID", async () => {
    const db = new MemoryLocalDatabase();
    const mutationId = crypto.randomUUID();
    const input = { mutationId, organizationId: "org-1", moduleKey: "inventory" as const, entityType: "inventory.movement" as const, entityId: "move-1", baseVersion: 0 as const, operation: "CREATE" as const, payload: { quantity: 1 }, changedAt: "2026-08-15T00:00:00.000Z" };
    await enqueueMutation(db, input); await enqueueMutation(db, input);
    expect(await db.listQueuedMutations("pending")).toHaveLength(1);
  });

  it("serializes the exact uppercase create contract", async () => {
    const db = new MemoryLocalDatabase();
    await enqueueMutation(db, { organizationId: "org-1", moduleKey: "pos", entityType: "pos.sale", entityId: "sale-1", baseVersion: 0, operation: "CREATE", payload: { sessionId: "session-1" } });
    expect(toMutationEnvelopes(await db.listQueuedMutations("pending"))[0]).toMatchObject({ entityType: "pos.sale", operation: "CREATE", baseVersion: 0 });
  });
});
