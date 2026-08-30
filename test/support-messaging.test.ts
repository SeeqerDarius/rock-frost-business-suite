import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDb = {
  supportConversation: { upsert: vi.fn(), findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), update: vi.fn(), findMany: vi.fn() },
  supportMessage: { create: vi.fn(), findMany: vi.fn(), count: vi.fn() },
  organizationMember: { findMany: vi.fn() },
  userPresence: { findFirst: vi.fn(), findUnique: vi.fn(), upsert: vi.fn() },
  $transaction: vi.fn(),
  $executeRaw: vi.fn(),
};

vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("@/lib/platform-organizations", () => ({
  getPlatformAnchorOrganizationIds: vi.fn().mockResolvedValue(["anchor-org"]),
}));

const support = await import("@/lib/support/service");

const ORG = "org-1";
const USER = "user-1";
const OTHER_USER = "user-2";

beforeEach(() => {
  vi.clearAllMocks();
  mockDb.$transaction.mockImplementation(async (callback: (tx: typeof mockDb) => unknown) => callback(mockDb));
});

describe("Support messaging service — per-user tenant conversations", () => {
  it("listSupportMessages looks up the conversation by (organizationId, userId), not organizationId alone", async () => {
    mockDb.supportConversation.findUnique.mockResolvedValue({ id: "conv-1", organizationId: ORG, userId: USER });
    mockDb.supportMessage.findMany.mockResolvedValue([]);

    await support.listSupportMessages(ORG, USER);

    expect(mockDb.supportConversation.findUnique).toHaveBeenCalledWith({ where: { organizationId_userId: { organizationId: ORG, userId: USER } } });
    const call = mockDb.supportMessage.findMany.mock.calls[0][0];
    expect(call.where.organizationId).toBe(ORG);
    expect(call.where.conversationId).toBe("conv-1");
  });

  it("listSupportMessages returns an empty list without querying messages when no conversation exists yet", async () => {
    mockDb.supportConversation.findUnique.mockResolvedValue(null);
    const result = await support.listSupportMessages(ORG, USER);
    expect(result.messages).toEqual([]);
    expect(mockDb.supportMessage.findMany).not.toHaveBeenCalled();
  });

  it("sendTenantMessage creates or reuses only that user's own conversation, creates a TENANT-role message, and marks the tenant side read", async () => {
    mockDb.supportConversation.upsert.mockResolvedValue({ id: "conv-1", organizationId: ORG, userId: USER });
    mockDb.supportMessage.create.mockResolvedValue({ id: "msg-1", createdAt: new Date("2026-01-01") });
    mockDb.supportConversation.update.mockResolvedValue({ id: "conv-1", organizationId: ORG, userId: USER, tenantLastReadAt: new Date("2026-01-01"), platformLastReadAt: null });
    mockDb.supportConversation.findUniqueOrThrow.mockResolvedValue({ id: "conv-1", organizationId: ORG, userId: USER, tenantLastReadAt: new Date("2026-01-01"), platformLastReadAt: null });

    const { message, conversation } = await support.sendTenantMessage(ORG, USER, "Jane Doe", "My invoice looks wrong");

    const upsertCall = mockDb.supportConversation.upsert.mock.calls[0][0];
    expect(upsertCall.where).toEqual({ organizationId_userId: { organizationId: ORG, userId: USER } });
    expect(upsertCall.create).toEqual({ organizationId: ORG, userId: USER });

    const createCall = mockDb.supportMessage.create.mock.calls[0][0];
    expect(createCall.data.organizationId).toBe(ORG);
    expect(createCall.data.senderRole).toBe("TENANT");
    expect(createCall.data.senderId).toBe(USER);

    const updateCall = mockDb.supportConversation.update.mock.calls[0][0];
    expect(updateCall.data.tenantLastReadAt).toBeInstanceOf(Date);
    expect(updateCall.data.platformLastReadAt).toBeUndefined();

    expect(message.id).toBe("msg-1");
    expect(conversation.id).toBe("conv-1");
  });

  it("two different users in the same organization never resolve to the same conversation", async () => {
    mockDb.supportConversation.upsert.mockResolvedValueOnce({ id: "conv-a", organizationId: ORG, userId: USER });
    mockDb.supportConversation.upsert.mockResolvedValueOnce({ id: "conv-b", organizationId: ORG, userId: OTHER_USER });

    await support.getOrCreateSupportConversation(ORG, USER);
    await support.getOrCreateSupportConversation(ORG, OTHER_USER);

    expect(mockDb.supportConversation.upsert.mock.calls[0][0].where).toEqual({ organizationId_userId: { organizationId: ORG, userId: USER } });
    expect(mockDb.supportConversation.upsert.mock.calls[1][0].where).toEqual({ organizationId_userId: { organizationId: ORG, userId: OTHER_USER } });
  });

  it("sendPlatformMessage creates a PLATFORM-role message on the given conversation and marks the platform side read, not the tenant side", async () => {
    mockDb.supportConversation.findUniqueOrThrow.mockResolvedValueOnce({ id: "conv-1", organizationId: ORG, userId: USER });
    mockDb.supportMessage.create.mockResolvedValue({ id: "msg-1", createdAt: new Date("2026-01-01") });
    mockDb.supportConversation.update.mockResolvedValue({ id: "conv-1", organizationId: ORG, userId: USER, tenantLastReadAt: null, platformLastReadAt: new Date("2026-01-01") });
    mockDb.supportConversation.findUniqueOrThrow.mockResolvedValueOnce({ id: "conv-1", organizationId: ORG, userId: USER, tenantLastReadAt: null, platformLastReadAt: new Date("2026-01-01") });

    await support.sendPlatformMessage("conv-1", "operator-1", "Rock Frost Support", "We're looking into this now");

    const createCall = mockDb.supportMessage.create.mock.calls[0][0];
    expect(createCall.data.senderRole).toBe("PLATFORM");

    const updateCall = mockDb.supportConversation.update.mock.calls[0][0];
    expect(updateCall.data.platformLastReadAt).toBeInstanceOf(Date);
    expect(updateCall.data.tenantLastReadAt).toBeUndefined();
  });

  it("sendPlatformMessage refuses to reply into a legacy (userId: null) conversation", async () => {
    mockDb.supportConversation.findUniqueOrThrow.mockResolvedValue({ id: "conv-legacy", organizationId: ORG, userId: null });

    await expect(support.sendPlatformMessage("conv-legacy", "operator-1", "Rock Frost Support", "Hi")).rejects.toThrow(support.LegacyConversationError);
    expect(mockDb.$transaction).not.toHaveBeenCalled();
  });

  it("sendAdminMessage creates an ADMIN-role message and refuses a conversation from a different organization, even with a valid conversation id", async () => {
    mockDb.supportConversation.findUniqueOrThrow.mockResolvedValue({ id: "conv-other-org", organizationId: "org-2", userId: USER });

    await expect(support.sendAdminMessage(ORG, "conv-other-org", "admin-1", "Admin Name", "Hello")).rejects.toThrow(support.SupportNotFoundError);
    expect(mockDb.$transaction).not.toHaveBeenCalled();
  });

  it("sendAdminMessage succeeds and tags the message ADMIN when the conversation belongs to the admin's own organization", async () => {
    mockDb.supportConversation.findUniqueOrThrow.mockResolvedValueOnce({ id: "conv-1", organizationId: ORG, userId: USER });
    mockDb.supportMessage.create.mockResolvedValue({ id: "msg-1", createdAt: new Date("2026-01-01") });
    mockDb.supportConversation.update.mockResolvedValue({});
    mockDb.supportConversation.findUniqueOrThrow.mockResolvedValueOnce({ id: "conv-1", organizationId: ORG, userId: USER, tenantLastReadAt: null, platformLastReadAt: null, adminLastReadAt: new Date("2026-01-01") });

    await support.sendAdminMessage(ORG, "conv-1", "admin-1", "Admin Name", "We're on it");

    const createCall = mockDb.supportMessage.create.mock.calls[0][0];
    expect(createCall.data.senderRole).toBe("ADMIN");
    const updateCall = mockDb.supportConversation.update.mock.calls[0][0];
    expect(updateCall.data.adminLastReadAt).toBeInstanceOf(Date);
  });

  it("sendAdminMessage refuses to reply into a legacy conversation", async () => {
    mockDb.supportConversation.findUniqueOrThrow.mockResolvedValue({ id: "conv-legacy", organizationId: ORG, userId: null });
    await expect(support.sendAdminMessage(ORG, "conv-legacy", "admin-1", "Admin Name", "Hi")).rejects.toThrow(support.LegacyConversationError);
  });

  describe("otherPartyReadAt (read receipts)", () => {
    it("returns the platform's read cursor for a TENANT viewer, and the tenant's for a PLATFORM viewer", () => {
      const platformRead = new Date("2026-01-02T00:00:00.000Z");
      const tenantRead = new Date("2026-01-01T00:00:00.000Z");
      const conversation = { tenantLastReadAt: tenantRead, platformLastReadAt: platformRead };

      expect(support.otherPartyReadAt(conversation, "TENANT")).toBe(platformRead.toISOString());
      expect(support.otherPartyReadAt(conversation, "PLATFORM")).toBe(tenantRead.toISOString());
    });

    it("returns null when the other side has never read the conversation", () => {
      const conversation = { tenantLastReadAt: null, platformLastReadAt: null };
      expect(support.otherPartyReadAt(conversation, "TENANT")).toBeNull();
      expect(support.otherPartyReadAt(conversation, "PLATFORM")).toBeNull();
    });

    it("always returns null for an ADMIN viewer — a third party has no single fixed other side", () => {
      const conversation = { tenantLastReadAt: new Date(), platformLastReadAt: new Date() };
      expect(support.otherPartyReadAt(conversation, "ADMIN")).toBeNull();
    });
  });

  it("rejects an empty or whitespace-only message before touching the database", async () => {
    mockDb.supportConversation.upsert.mockResolvedValue({ id: "conv-1", organizationId: ORG, userId: USER });
    await expect(support.sendTenantMessage(ORG, USER, "Jane", "   ")).rejects.toThrow();
    expect(mockDb.$transaction).not.toHaveBeenCalled();
  });

  it("getTenantUnreadCount is 0 when no conversation exists yet", async () => {
    mockDb.supportConversation.findUnique.mockResolvedValue(null);
    await expect(support.getTenantUnreadCount(ORG, USER)).resolves.toBe(0);
    expect(mockDb.supportMessage.count).not.toHaveBeenCalled();
  });

  it("getTenantUnreadCount counts PLATFORM, AI, and ADMIN messages newer than tenantLastReadAt, scoped to that user's own conversation", async () => {
    const lastRead = new Date("2026-01-01");
    mockDb.supportConversation.findUnique.mockResolvedValue({ id: "conv-1", organizationId: ORG, userId: USER, tenantLastReadAt: lastRead });
    mockDb.supportMessage.count.mockResolvedValue(3);

    await support.getTenantUnreadCount(ORG, USER);

    const call = mockDb.supportMessage.count.mock.calls[0][0];
    expect(call.where.organizationId).toBe(ORG);
    expect(call.where.conversationId).toBe("conv-1");
    expect(call.where.senderRole).toEqual({ in: ["PLATFORM", "AI", "ADMIN"] });
    expect(call.where.createdAt).toEqual({ gt: lastRead });
  });

  it("listPlatformConversations excludes platform anchor organizations and tags each row's kind by whether userId is set", async () => {
    mockDb.supportConversation.findMany.mockResolvedValue([
      { id: "conv-1", organizationId: ORG, userId: USER, organization: { id: ORG, name: "Acme" }, user: { id: USER, name: "Jane" }, messages: [], platformLastReadAt: null },
      { id: "conv-legacy", organizationId: ORG, userId: null, organization: { id: ORG, name: "Acme" }, user: null, messages: [], platformLastReadAt: null },
    ]);
    mockDb.supportMessage.count.mockResolvedValue(0);

    const result = await support.listPlatformConversations();

    const call = mockDb.supportConversation.findMany.mock.calls[0][0];
    expect(call.where.organizationId).toEqual({ notIn: ["anchor-org"] });
    expect(result.find((c) => c.id === "conv-1")?.kind).toBe("INDIVIDUAL");
    expect(result.find((c) => c.id === "conv-legacy")?.kind).toBe("LEGACY");
  });

  it("isTenantOnline checks presence for exactly the one participant, not the whole organization", async () => {
    mockDb.userPresence.findUnique.mockResolvedValue({ lastSeenAt: new Date() });
    await expect(support.isTenantOnline(USER)).resolves.toBe(true);
    expect(mockDb.userPresence.findUnique).toHaveBeenCalledWith({ where: { userId: USER }, select: { lastSeenAt: true } });
    expect(mockDb.organizationMember.findMany).not.toHaveBeenCalled();
  });

  it("isTenantOnline is false when there is no presence row, or it's stale", async () => {
    mockDb.userPresence.findUnique.mockResolvedValue(null);
    await expect(support.isTenantOnline(USER)).resolves.toBe(false);

    mockDb.userPresence.findUnique.mockResolvedValue({ lastSeenAt: new Date(Date.now() - 60_000) });
    await expect(support.isTenantOnline(USER)).resolves.toBe(false);
  });

  it("isPlatformOnline (the tenant's own vague 'is the team around' indicator) remains platform-wide, untouched by the conversation-scoped fix", async () => {
    mockDb.organizationMember.findMany.mockResolvedValue([{ userId: "admin-1" }]);
    mockDb.userPresence.findFirst.mockResolvedValue({ userId: "admin-1" });

    await expect(support.isPlatformOnline()).resolves.toBe(true);

    const call = mockDb.userPresence.findFirst.mock.calls[0][0];
    expect(call.where.userId).toEqual({ in: ["admin-1"] });
    expect(call.where).not.toHaveProperty("activeConversationId");
  });

  it("isPlatformOnlineForConversation checks Super Admin presence scoped to that one conversation id, not platform-wide", async () => {
    mockDb.organizationMember.findMany.mockResolvedValue([{ userId: "admin-1" }]);
    mockDb.userPresence.findFirst.mockResolvedValue({ userId: "admin-1" });

    await expect(support.isPlatformOnlineForConversation("conv-1")).resolves.toBe(true);

    const call = mockDb.userPresence.findFirst.mock.calls[0][0];
    expect(call.where.userId).toEqual({ in: ["admin-1"] });
    expect(call.where.activeConversationId).toBe("conv-1");
  });

  it("isPlatformOnlineForConversation is false with no active Super Admins, without querying presence at all", async () => {
    mockDb.organizationMember.findMany.mockResolvedValue([]);
    await expect(support.isPlatformOnlineForConversation("conv-1")).resolves.toBe(false);
    expect(mockDb.userPresence.findFirst).not.toHaveBeenCalled();
  });

  it("isPlatformOnlineForConversation is false when a Super Admin is online but pointed at a different conversation", async () => {
    mockDb.organizationMember.findMany.mockResolvedValue([{ userId: "admin-1" }]);
    mockDb.userPresence.findFirst.mockResolvedValue(null);
    await expect(support.isPlatformOnlineForConversation("conv-1")).resolves.toBe(false);
  });

  it("recordHeartbeat leaves activeConversationId untouched when omitted, so a tenant or admin heartbeat never wipes a Super Admin's own presence state", async () => {
    mockDb.userPresence.upsert.mockResolvedValue({});
    await support.recordHeartbeat(USER);

    const call = mockDb.userPresence.upsert.mock.calls[0][0];
    expect(call.update).not.toHaveProperty("activeConversationId");
    expect(call.create.activeConversationId).toBeNull();
  });

  it("recordHeartbeat sets activeConversationId when explicitly provided", async () => {
    mockDb.userPresence.upsert.mockResolvedValue({});
    await support.recordHeartbeat("admin-1", "conv-1");

    const call = mockDb.userPresence.upsert.mock.calls[0][0];
    expect(call.update.activeConversationId).toBe("conv-1");
    expect(call.create.activeConversationId).toBe("conv-1");
  });

  it("sendAiMessage creates an AI-role message with no sender account and bumps no read cursor", async () => {
    mockDb.supportConversation.findUniqueOrThrow.mockResolvedValueOnce({ id: "conv-1", organizationId: ORG, userId: USER });
    mockDb.supportMessage.create.mockResolvedValue({ id: "msg-1", createdAt: new Date("2026-01-01") });
    mockDb.supportConversation.update.mockResolvedValue({});
    mockDb.supportConversation.findUniqueOrThrow.mockResolvedValueOnce({ id: "conv-1", organizationId: ORG, userId: USER, tenantLastReadAt: null, platformLastReadAt: null });

    await support.sendAiMessage("conv-1", "You have 482 active students.");

    const createCall = mockDb.supportMessage.create.mock.calls[0][0];
    expect(createCall.data.senderRole).toBe("AI");
    expect(createCall.data.senderId).toBeNull();
    expect(createCall.data.senderName).toBe("Rock Frost AI Assistant");

    // An AI reply isn't a read acknowledgment from any human party.
    const updateCall = mockDb.supportConversation.update.mock.calls[0][0];
    expect(updateCall.data).toEqual({ status: "OPEN" });
  });

  it("getPlatformUnreadCount counts TENANT and ADMIN messages, but not AI — an AI reply doesn't need operator attention", async () => {
    mockDb.supportConversation.findMany.mockResolvedValue([{ id: "conv-1", platformLastReadAt: null }]);
    mockDb.supportMessage.count.mockResolvedValue(0);

    await support.getPlatformUnreadCount();

    const call = mockDb.supportMessage.count.mock.calls[0][0];
    expect(call.where.senderRole).toEqual({ in: ["TENANT", "ADMIN"] });
  });

  it("isAiReplyRateLimited caps AI replies per organization within a rolling hour", async () => {
    mockDb.supportMessage.count.mockResolvedValue(40);
    await expect(support.isAiReplyRateLimited(ORG)).resolves.toBe(true);

    mockDb.supportMessage.count.mockResolvedValue(39);
    await expect(support.isAiReplyRateLimited(ORG)).resolves.toBe(false);

    const call = mockDb.supportMessage.count.mock.calls[0][0];
    expect(call.where.organizationId).toBe(ORG);
    expect(call.where.senderRole).toBe("AI");
    expect(call.where.createdAt.gte).toBeInstanceOf(Date);
  });
});

describe("Support messaging service — organization admin inbox", () => {
  it("listOrgSupportConversations only ever queries by the given organizationId", async () => {
    mockDb.supportConversation.findMany.mockResolvedValue([]);
    await support.listOrgSupportConversations(ORG);
    const call = mockDb.supportConversation.findMany.mock.calls[0][0];
    expect(call.where).toEqual({ organizationId: ORG });
  });

  it("markReadByAdmin refuses a conversation from a different organization", async () => {
    mockDb.supportConversation.findUniqueOrThrow.mockResolvedValue({ id: "conv-1", organizationId: "org-2" });
    await expect(support.markReadByAdmin(ORG, "conv-1")).rejects.toThrow(support.SupportNotFoundError);
    expect(mockDb.supportConversation.update).not.toHaveBeenCalled();
  });

  it("getOrgSupportUnreadCount counts TENANT, PLATFORM, and AI messages, but never the admin's own ADMIN-authored ones", async () => {
    mockDb.supportConversation.findMany.mockResolvedValue([{ id: "conv-1", adminLastReadAt: null }]);
    mockDb.supportMessage.count.mockResolvedValue(0);

    await support.getOrgSupportUnreadCount(ORG);

    const call = mockDb.supportMessage.count.mock.calls[0][0];
    expect(call.where.senderRole).toEqual({ in: ["TENANT", "PLATFORM", "AI"] });
  });
});

describe("Support messaging — access-guard source coverage", () => {
  const root = process.cwd();
  const read = (relativePath: string) => readFileSync(path.join(root, relativePath), "utf8");

  it("the tenant Support page and actions are available to any signed-in tenant member, not a module-gated one", () => {
    for (const file of ["src/app/app/(overview)/support/page.tsx", "src/app/app/(overview)/support/actions.ts"]) {
      const source = read(file);
      expect(source, file).toContain("requireCurrentTenant");
      expect(source, file).not.toContain("requireModuleAccess");
    }
  });

  it("the platform Support inbox and its actions require the platform operator role", () => {
    const pageSource = read("src/app/app/platform/support/page.tsx");
    expect(pageSource).toContain("requirePlatformOperator");

    const actionsSource = read("src/app/app/platform/support/actions.ts");
    expect(actionsSource).toContain("isPlatformOperator");
  });

  it("the platform inbox's heartbeat carries the currently-selected conversation id, so AI eligibility can be scoped per conversation", () => {
    const pageSource = read("src/app/app/platform/support/page.tsx");
    expect(pageSource).toContain("platformSupportHeartbeat.bind(null, selected.id)");

    const actionsSource = read("src/app/app/platform/support/actions.ts");
    expect(actionsSource).toMatch(/platformSupportHeartbeat\(conversationId\?/);
  });

  it("the organization admin inbox and its actions require ORG_SETTINGS_MANAGE, re-checked independently in every action", () => {
    const pageSource = read("src/app/app/(overview)/support/inbox/page.tsx");
    expect(pageSource).toContain("ORG_SETTINGS_MANAGE");

    const actionsSource = read("src/app/app/(overview)/support/inbox/actions.ts");
    expect(actionsSource).toContain("ORG_SETTINGS_MANAGE");
    // Every exported action re-checks via the shared guard — not one page-level check trusted by all of them.
    const exportedActionCount = (actionsSource.match(/^export async function/gm) ?? []).length;
    const guardCallCount = (actionsSource.match(/requireOrgSupportAdminTenant\(\)/g) ?? []).length;
    expect(exportedActionCount).toBeGreaterThanOrEqual(5);
    expect(guardCallCount).toBe(exportedActionCount + 1); // +1 for the guard's own definition calling requireCurrentTenant, counted separately below

  });

  it("is reachable via a floating chat bubble in the top-level app layout, not a sidebar link, and never emails anyone", () => {
    const workspaceNav = read("src/platform/modules/workspace-navigation.tsx");
    expect(workspaceNav).not.toContain("/app/support");

    const platformNav = read("src/platform/modules/platform-navigation.tsx");
    expect(platformNav).not.toContain("/app/platform/support");

    const appLayout = read("src/app/app/layout.tsx");
    expect(appLayout).toContain("FloatingSupportWidget");
    expect(appLayout).toContain("PlatformSupportBubbleLink");
    expect(appLayout).toContain("getTenantUnreadCount");
    expect(appLayout).toContain("getPlatformUnreadCount");

    for (const file of [
      "src/lib/support/service.ts",
      "src/app/app/(overview)/support/actions.ts",
      "src/app/app/platform/support/actions.ts",
      "src/components/support/support-chat.tsx",
      "src/components/support/floating-support-widget.tsx",
      "src/components/support/floating-support-link.tsx",
      "src/lib/ai/client.ts",
      "src/lib/ai/support-assistant.ts",
    ]) {
      const source = read(file);
      expect(source, file).not.toMatch(/sendEmail|resend|@\/lib\/email/i);
    }
  });

  it("both viewer roles get an optional, editable quick-reply template set", () => {
    const templatesSource = read("src/lib/support/templates.ts");
    expect(templatesSource).toContain("TENANT_SUPPORT_TEMPLATES");
    expect(templatesSource).toContain("PLATFORM_SUPPORT_TEMPLATES");

    const chatSource = read("src/components/support/support-chat.tsx");
    // Selecting a template only populates the draft — it must never submit on its own.
    const templateHandler = chatSource.match(/function handleSelectTemplate\([^)]*\)\s*\{([\s\S]*?)\n  \}/);
    expect(templateHandler, "handleSelectTemplate function body").not.toBeNull();
    expect(templateHandler![1]).not.toMatch(/handleSubmit|onSend|startSendTransition/);
  });

  it("keeps the floating panel inside the dynamic viewport and reserves space for its composer", () => {
    const widgetSource = read("src/components/support/floating-support-widget.tsx");
    const chatSource = read("src/components/support/support-chat.tsx");

    expect(widgetSource).toContain("100dvh-6rem");
    expect(widgetSource).toContain("size-12");
    expect(chatSource).toContain('ScrollArea className="min-h-0 flex-1"');
    expect(chatSource).toContain('className="shrink-0 border-t bg-background p-3"');
    expect(chatSource).toContain("setPendingMessage");
  });
});
