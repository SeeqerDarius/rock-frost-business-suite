import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { testDb } from "./setup/db";
import { cleanupTestOrg, createTestOrg, type TestOrg } from "./setup/fixtures";

describe("browser offline outbox isolation and concurrency", () => {
  let orgA: TestOrg;
  let orgB: TestOrg;
  let deviceA: string;
  let deviceB: string;

  beforeAll(async () => {
    [orgA, orgB] = await Promise.all([createTestOrg("offline-browser-a"), createTestOrg("offline-browser-b")]);
    const expires = new Date(Date.now() + 60 * 60 * 1000);
    const [a, b] = await Promise.all([
      testDb.offlineDevice.create({ data: { organizationId: orgA.organizationId, userId: orgA.userId, membershipId: orgA.membershipId, name: "Browser A", platform: "browser:test", installationId: "00000000-0000-4000-8000-000000000001", tokenHash: `test-a-${Date.now()}`, moduleKeys: ["pos"], tokenExpiresAt: expires, offlineAccessUntil: expires } }),
      testDb.offlineDevice.create({ data: { organizationId: orgB.organizationId, userId: orgB.userId, membershipId: orgB.membershipId, name: "Browser B", platform: "browser:test", installationId: "00000000-0000-4000-8000-000000000002", tokenHash: `test-b-${Date.now()}`, moduleKeys: ["pos"], tokenExpiresAt: expires, offlineAccessUntil: expires } }),
    ]);
    deviceA = a.id;
    deviceB = b.id;
  });

  afterAll(async () => { await Promise.all([cleanupTestOrg(orgA), cleanupTestOrg(orgB)]); });

  function mutation(organizationId: string, userId: string, deviceId: string, mutationId: string, idempotencyKey: string) {
    return { organizationId, userId, deviceId, mutationId, idempotencyKey, moduleKey: "pos", entityType: "pos.sale", entityId: mutationId, operation: "record", baseVersion: 0, payloadSchemaVersion: 1, attachmentReferences: [], dependencyIds: [], payload: { test: true }, changedAt: new Date() };
  }

  it("allows the same external idempotency value in different tenant partitions", async () => {
    const key = `shared-${Date.now()}`;
    const [a, b] = await Promise.all([
      testDb.offlineMutation.create({ data: mutation(orgA.organizationId, orgA.userId, deviceA, `${key}-a`, key) }),
      testDb.offlineMutation.create({ data: mutation(orgB.organizationId, orgB.userId, deviceB, `${key}-b`, key) }),
    ]);
    expect(a.organizationId).not.toBe(b.organizationId);
  });

  it("permits only one concurrent claim for a tenant idempotency key", async () => {
    const key = `race-${Date.now()}`;
    const settled = await Promise.allSettled([
      testDb.offlineMutation.create({ data: mutation(orgA.organizationId, orgA.userId, deviceA, `${key}-one`, key) }),
      testDb.offlineMutation.create({ data: mutation(orgA.organizationId, orgA.userId, deviceA, `${key}-two`, key) }),
    ]);
    expect(settled.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = settled.find((result): result is PromiseRejectedResult => result.status === "rejected");
    expect(rejected?.reason).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
    expect((rejected?.reason as Prisma.PrismaClientKnownRequestError).code).toBe("P2002");
    await expect(testDb.offlineMutation.count({ where: { organizationId: orgA.organizationId, idempotencyKey: key } })).resolves.toBe(1);
  });

  it("isolates staged attachments by tenant, user, and device", async () => {
    const clientId = "00000000-0000-4000-8000-000000000099";
    const expiresAt = new Date(Date.now() + 60_000);
    const [attachmentA, attachmentB] = await Promise.all([
      testDb.offlineAttachmentUpload.create({ data: { organizationId: orgA.organizationId, userId: orgA.userId, deviceId: deviceA, clientId, moduleKey: "fleet", fileName: "a.png", mimeType: "image/png", size: 8, sha256: "a".repeat(64), data: Buffer.from("test-a"), expiresAt } }),
      testDb.offlineAttachmentUpload.create({ data: { organizationId: orgB.organizationId, userId: orgB.userId, deviceId: deviceB, clientId, moduleKey: "fleet", fileName: "b.png", mimeType: "image/png", size: 8, sha256: "b".repeat(64), data: Buffer.from("test-b"), expiresAt } }),
    ]);
    expect(attachmentA.organizationId).not.toBe(attachmentB.organizationId);
    await expect(testDb.offlineAttachmentUpload.findMany({ where: { organizationId: orgA.organizationId, userId: orgB.userId } })).resolves.toEqual([]);
  });

  it("preserves protected conflicts with both local and server snapshots", async () => {
    const key = `conflict-${Date.now()}`;
    const ledger = await testDb.offlineMutation.create({ data: mutation(orgA.organizationId, orgA.userId, deviceA, key, key) });
    const conflict = await testDb.offlineConflict.create({ data: { organizationId: orgA.organizationId, deviceId: deviceA, mutationId: ledger.id, conflictType: "stale-stock", cloudVersion: 42, cloudSnapshot: { quantity: 7 }, allowedResolutions: ["KEEP_SERVER", "MANAGER_REVIEW"] } });
    const loaded = await testDb.offlineConflict.findFirstOrThrow({ where: { id: conflict.id, organizationId: orgA.organizationId }, include: { mutation: true } });
    expect(loaded.mutation.payload).toEqual({ test: true });
    expect(loaded.cloudSnapshot).toEqual({ quantity: 7 });
    expect(loaded.allowedResolutions).toEqual(["KEEP_SERVER", "MANAGER_REVIEW"]);
  });

  it("creates a safe server draft only once for one source mutation", async () => {
    const sourceMutationId = `draft-${Date.now()}`;
    const input = { organizationId: orgA.organizationId, userId: orgA.userId, moduleKey: "accounting", entityType: "accounting.invoice-draft", entityId: sourceMutationId, title: "Offline invoice draft", payload: { status: "DRAFT_REQUIRES_SERVER_REVIEW" }, sourceMutationId };
    const settled = await Promise.allSettled([testDb.offlineDraft.create({ data: input }), testDb.offlineDraft.create({ data: input })]);
    expect(settled.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    await expect(testDb.offlineDraft.count({ where: { sourceMutationId } })).resolves.toBe(1);
  });
});
