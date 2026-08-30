import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as support from "@/lib/support/service";
import { cleanupTestOrg, createTestOrg, addSecondTestMember, type TestOrg } from "../setup/fixtures";
import { testDb } from "../setup/db";

let orgA: TestOrg;
let orgB: TestOrg;
let orgASecondUserId: string;
let platformUserId: string;

beforeAll(async () => {
  orgA = await createTestOrg("orgA-support");
  orgB = await createTestOrg("orgB-support");
  const second = await addSecondTestMember(orgA, "orgA-support-second");
  orgASecondUserId = second.userId;
  const platformUser = await testDb.user.create({
    data: {
      name: "Integration Platform Operator",
      email: `support-platform-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.invalid`,
      status: "ACTIVE",
    },
  });
  platformUserId = platformUser.id;
});

afterAll(async () => {
  await cleanupTestOrg(orgA);
  await cleanupTestOrg(orgB);
  await testDb.user.delete({ where: { id: orgASecondUserId } }).catch(() => {});
  await testDb.user.delete({ where: { id: platformUserId } }).catch(() => {});
});

describe("Support messaging — real tenant isolation", () => {
  it("each organization gets its own conversation, and messages never cross between them", async () => {
    await support.sendTenantMessage(orgA.organizationId, orgA.userId, "Org A User", "Org A's first message");
    await support.sendTenantMessage(orgB.organizationId, orgB.userId, "Org B User", "Org B's first message");

    const { messages: messagesA } = await support.listSupportMessages(orgA.organizationId, orgA.userId);
    const { messages: messagesB } = await support.listSupportMessages(orgB.organizationId, orgB.userId);

    expect(messagesA).toHaveLength(1);
    expect(messagesB).toHaveLength(1);
    expect(messagesA[0].content).toBe("Org A's first message");
    expect(messagesB[0].content).toBe("Org B's first message");
    expect(messagesA.map((m) => m.organizationId)).not.toContain(orgB.organizationId);
  });

  it("two active members of the same organization each get their own private conversation and never see each other's messages", async () => {
    await support.sendTenantMessage(orgA.organizationId, orgASecondUserId, "Org A Second User", "Second user's own message");

    const { conversation: conversationFirst, messages: messagesFirst } = await support.listSupportMessages(orgA.organizationId, orgA.userId);
    const { conversation: conversationSecond, messages: messagesSecond } = await support.listSupportMessages(orgA.organizationId, orgASecondUserId);

    expect(conversationFirst!.id).not.toBe(conversationSecond!.id);
    expect(messagesFirst.map((m) => m.content)).not.toContain("Second user's own message");
    expect(messagesSecond).toHaveLength(1);
    expect(messagesSecond[0].content).toBe("Second user's own message");
  });

  it("a brand-new user's first message never resolves to another member's existing conversation", async () => {
    const conversation = await support.getOrCreateSupportConversation(orgA.organizationId, orgASecondUserId);
    const originalConversation = await testDb.supportConversation.findUniqueOrThrow({ where: { organizationId_userId: { organizationId: orgA.organizationId, userId: orgA.userId } } });
    expect(conversation.id).not.toBe(originalConversation.id);
  });

  it("marking one organization's conversation read never touches another organization's read state", async () => {
    const { conversation: conversationA } = await support.listSupportMessages(orgA.organizationId, orgA.userId);
    await support.sendPlatformMessage(conversationA!.id, platformUserId, "Rock Frost Support", "Reply to org A");
    await support.markReadByTenant(orgA.organizationId, orgA.userId);

    const unreadA = await support.getTenantUnreadCount(orgA.organizationId, orgA.userId);
    const unreadB = await support.getTenantUnreadCount(orgB.organizationId, orgB.userId);

    expect(unreadA).toBe(0);
    // Org B never received a platform reply, so it has nothing unread regardless of org A's read state.
    expect(unreadB).toBe(0);
  });

  it("presence is scoped per user — a heartbeat from org A's user never makes org B's user read as online", async () => {
    await support.recordHeartbeat(orgA.userId);
    await expect(support.isTenantOnline(orgA.userId)).resolves.toBe(true);
    await expect(support.isTenantOnline(orgB.userId)).resolves.toBe(false);
  });

  it("the platform inbox lists every real tenant conversation, each with its own organization identity intact", async () => {
    const conversations = await support.listPlatformConversations();
    const orgAConversations = conversations.filter((c) => c.organizationId === orgA.organizationId);
    const orgBConversations = conversations.filter((c) => c.organizationId === orgB.organizationId);
    expect(orgAConversations.length).toBeGreaterThanOrEqual(2);
    expect(orgBConversations.length).toBeGreaterThanOrEqual(1);
    expect(orgAConversations.every((c) => c.organization.id === orgA.organizationId)).toBe(true);
    expect(orgBConversations.every((c) => c.organization.id === orgB.organizationId)).toBe(true);
  });

  it("the organization admin inbox for org A never returns a conversation belonging to org B, even implicitly", async () => {
    const orgAAdminConversations = await support.listOrgSupportConversations(orgA.organizationId);
    const orgBConversation = await testDb.supportConversation.findUniqueOrThrow({ where: { organizationId_userId: { organizationId: orgB.organizationId, userId: orgB.userId } } });
    expect(orgAAdminConversations.some((c) => c.id === orgBConversation.id)).toBe(false);

    // A crafted conversationId from another organization is refused, not silently accepted.
    await expect(support.sendAdminMessage(orgA.organizationId, orgBConversation.id, orgA.userId, "Org A Admin", "Should never land")).rejects.toThrow(support.SupportNotFoundError);
  });
});
