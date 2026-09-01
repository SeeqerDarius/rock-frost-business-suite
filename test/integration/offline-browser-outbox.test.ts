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
});
