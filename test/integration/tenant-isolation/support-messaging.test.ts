import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as support from "@/lib/support/service";
import { cleanupTestOrg, createTestOrg, type TestOrg } from "../setup/fixtures";

let orgA: TestOrg;
let orgB: TestOrg;

beforeAll(async () => {
  orgA = await createTestOrg("orgA-support");
  orgB = await createTestOrg("orgB-support");
});

afterAll(async () => {
  await cleanupTestOrg(orgA);
  await cleanupTestOrg(orgB);
});

describe("Support messaging — real tenant isolation", () => {
  it("each organization gets its own conversation, and messages never cross between them", async () => {
    await support.sendTenantMessage(orgA.organizationId, orgA.userId, "Org A User", "Org A's first message");
    await support.sendTenantMessage(orgB.organizationId, orgB.userId, "Org B User", "Org B's first message");

    const { messages: messagesA } = await support.listSupportMessages(orgA.organizationId);
    const { messages: messagesB } = await support.listSupportMessages(orgB.organizationId);

    expect(messagesA).toHaveLength(1);
    expect(messagesB).toHaveLength(1);
    expect(messagesA[0].content).toBe("Org A's first message");
    expect(messagesB[0].content).toBe("Org B's first message");
    expect(messagesA.map((m) => m.organizationId)).not.toContain(orgB.organizationId);
  });

  it("marking one organization's conversation read never touches another organization's read state", async () => {
    await support.sendPlatformMessage(orgA.organizationId, "platform-user", "Rock Frost Support", "Reply to org A");
    await support.markReadByTenant(orgA.organizationId);

    const unreadA = await support.getTenantUnreadCount(orgA.organizationId);
    const unreadB = await support.getTenantUnreadCount(orgB.organizationId);

    expect(unreadA).toBe(0);
    // Org B never received a platform reply, so it has nothing unread regardless of org A's read state.
    expect(unreadB).toBe(0);
  });

  it("presence is scoped per organization — a heartbeat from org A's user never makes org B read as online", async () => {
    await support.recordHeartbeat(orgA.userId);
    await expect(support.isTenantOnline(orgA.organizationId)).resolves.toBe(true);
    await expect(support.isTenantOnline(orgB.organizationId)).resolves.toBe(false);
  });

  it("the platform inbox lists every real tenant conversation, each with its own organization identity intact", async () => {
    const conversations = await support.listPlatformConversations();
    const byOrg = new Map(conversations.map((c) => [c.organizationId, c]));
    expect(byOrg.has(orgA.organizationId)).toBe(true);
    expect(byOrg.has(orgB.organizationId)).toBe(true);
    expect(byOrg.get(orgA.organizationId)?.organization.id).toBe(orgA.organizationId);
    expect(byOrg.get(orgB.organizationId)?.organization.id).toBe(orgB.organizationId);
  });
});
