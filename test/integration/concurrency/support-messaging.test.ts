import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as support from "@/lib/support/service";
import { testDb } from "../setup/db";
import { createTestOrg, cleanupTestOrg, type TestOrg } from "../setup/fixtures";

/**
 * Real-Postgres concurrency coverage for src/lib/support/service.ts. The
 * conversation-creation path deliberately uses Prisma's `upsert` (an atomic
 * INSERT ... ON CONFLICT at the database level) rather than the
 * count()-then-create + createWithUniqueRetry pattern used elsewhere in this
 * codebase for numbered records — there is no number to compute here, only
 * "does this organization's one conversation row exist yet," which upsert
 * already handles safely under concurrency without an app-level retry.
 */

let org: TestOrg;

beforeAll(async () => {
  org = await createTestOrg("support-concurrency");
});

afterAll(async () => {
  await cleanupTestOrg(org);
});

describe("Support messaging concurrency (real Postgres)", () => {
  it("two concurrent first-ever messages (tenant and platform, racing to create the conversation) both succeed and both persist", async () => {
    const [{ message: tenantMessage }, { message: platformMessage }] = await Promise.all([
      support.sendTenantMessage(org.organizationId, org.userId, "Org User", "Hello, we need help"),
      support.sendPlatformMessage(org.organizationId, "platform-operator", "Rock Frost Support", "Hi, how can we help?"),
    ]);

    expect(tenantMessage.id).not.toBe(platformMessage.id);

    const conversationCount = await testDb.supportConversation.count({ where: { organizationId: org.organizationId } });
    expect(conversationCount).toBe(1);

    const messageCount = await testDb.supportMessage.count({ where: { organizationId: org.organizationId } });
    expect(messageCount).toBe(2);
  });

  it("many concurrent tenant messages all persist with no lost writes", async () => {
    const before = await testDb.supportMessage.count({ where: { organizationId: org.organizationId } });

    await Promise.all(
      Array.from({ length: 8 }, (_, i) => support.sendTenantMessage(org.organizationId, org.userId, "Org User", `Concurrent message ${i}`)),
    );

    const after = await testDb.supportMessage.count({ where: { organizationId: org.organizationId } });
    expect(after - before).toBe(8);

    const conversation = await testDb.supportConversation.findUniqueOrThrow({ where: { organizationId: org.organizationId } });
    const latestMessage = await testDb.supportMessage.findFirst({ where: { organizationId: org.organizationId }, orderBy: { createdAt: "desc" } });
    expect(conversation.lastMessageAt.getTime()).toBeGreaterThanOrEqual(latestMessage!.createdAt.getTime() - 1000);
  });

  it("a tenant marking their side read concurrently with a new platform reply does not crash and settles to a correct unread count", async () => {
    await support.markReadByTenant(org.organizationId);

    const [, { message: reply }] = await Promise.all([
      support.markReadByTenant(org.organizationId),
      support.sendPlatformMessage(org.organizationId, "platform-operator", "Rock Frost Support", "One more thing"),
    ]);

    // The reply's own timestamp is the honest upper bound for what "read" could possibly have captured concurrently.
    const unread = await support.getTenantUnreadCount(org.organizationId);
    expect(unread === 0 || unread === 1).toBe(true);
    expect(reply.id).toBeTruthy();
  });
});
