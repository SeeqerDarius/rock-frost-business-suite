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
 * "does this (organization, user) pair's one conversation row exist yet,"
 * which upsert already handles safely under concurrency without an
 * app-level retry. Only the tenant side ever creates a conversation from
 * scratch — platform, admin, and AI replies always target an existing
 * conversationId, since those surfaces only ever act on a row a tenant
 * participant already started.
 */

let org: TestOrg;
let platformUserId: string;
let conversationId: string;

beforeAll(async () => {
  org = await createTestOrg("support-concurrency");
  const platformUser = await testDb.user.create({
    data: {
      name: "Integration Platform Operator",
      email: `support-platform-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.invalid`,
      status: "ACTIVE",
    },
  });
  platformUserId = platformUser.id;
  const { conversation } = await support.sendTenantMessage(org.organizationId, org.userId, "Org User", "Hello, we need help");
  conversationId = conversation.id;
});

afterAll(async () => {
  await cleanupTestOrg(org);
  await testDb.user.delete({ where: { id: platformUserId } }).catch(() => {});
});

describe("Support messaging concurrency (real Postgres)", () => {
  it("two concurrent replies into the same existing conversation (platform and AI, racing) both succeed and both persist", async () => {
    const [{ message: platformMessage }, { message: aiMessage }] = await Promise.all([
      support.sendPlatformMessage(conversationId, platformUserId, "Rock Frost Support", "Hi, how can we help?"),
      support.sendAiMessage(conversationId, "I can look into that for you."),
    ]);

    expect(platformMessage.id).not.toBe(aiMessage.id);

    const conversationCount = await testDb.supportConversation.count({ where: { organizationId: org.organizationId } });
    expect(conversationCount).toBe(1);

    const messageCount = await testDb.supportMessage.count({ where: { organizationId: org.organizationId } });
    expect(messageCount).toBe(3); // the initial tenant message plus these two
  });

  it("two concurrent first-ever messages from two different users in the same organization both succeed and each gets its own conversation", async () => {
    const secondUser = await testDb.user.create({
      data: {
        name: "Integration Second User",
        email: `support-second-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.invalid`,
        status: "ACTIVE",
      },
    });
    try {
      const [{ conversation: firstConversation }, { conversation: secondConversation }] = await Promise.all([
        support.sendTenantMessage(org.organizationId, org.userId, "Org User", "Racing message from the first user"),
        support.sendTenantMessage(org.organizationId, secondUser.id, "Second User", "Racing message from the second user"),
      ]);

      expect(firstConversation.id).toBe(conversationId);
      expect(secondConversation.id).not.toBe(conversationId);

      const conversationCount = await testDb.supportConversation.count({ where: { organizationId: org.organizationId } });
      expect(conversationCount).toBe(2);
    } finally {
      await testDb.user.delete({ where: { id: secondUser.id } }).catch(() => {});
    }
  });

  it("many concurrent tenant messages all persist with no lost writes", async () => {
    const before = await testDb.supportMessage.count({ where: { organizationId: org.organizationId } });

    await Promise.all(
      Array.from({ length: 8 }, (_, i) => support.sendTenantMessage(org.organizationId, org.userId, "Org User", `Concurrent message ${i}`)),
    );

    const after = await testDb.supportMessage.count({ where: { organizationId: org.organizationId } });
    expect(after - before).toBe(8);

    const conversation = await testDb.supportConversation.findUniqueOrThrow({ where: { id: conversationId } });
    const latestMessage = await testDb.supportMessage.findFirst({ where: { conversationId }, orderBy: { createdAt: "desc" } });
    expect(conversation.lastMessageAt.getTime()).toBeGreaterThanOrEqual(latestMessage!.createdAt.getTime() - 1000);
  });

  it("a tenant marking their side read concurrently with a new platform reply does not crash and settles to a correct unread count", async () => {
    await support.markReadByTenant(org.organizationId, org.userId);

    const [, { message: reply }] = await Promise.all([
      support.markReadByTenant(org.organizationId, org.userId),
      support.sendPlatformMessage(conversationId, platformUserId, "Rock Frost Support", "One more thing"),
    ]);

    // The reply's own timestamp is the honest upper bound for what "read" could possibly have captured concurrently.
    const unread = await support.getTenantUnreadCount(org.organizationId, org.userId);
    expect(unread === 0 || unread === 1).toBe(true);
    expect(reply.id).toBeTruthy();
  });
});
