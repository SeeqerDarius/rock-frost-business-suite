import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDb = {
  supportConversation: { upsert: vi.fn(), findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), update: vi.fn(), findMany: vi.fn() },
  supportMessage: { create: vi.fn(), findMany: vi.fn(), count: vi.fn() },
  organizationMember: { findMany: vi.fn() },
  userPresence: { findFirst: vi.fn(), upsert: vi.fn() },
  $transaction: vi.fn(),
  $executeRaw: vi.fn(),
};

vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("@/lib/platform-organizations", () => ({
  getPlatformAnchorOrganizationIds: vi.fn().mockResolvedValue(["anchor-org"]),
}));

const support = await import("@/lib/support/service");

const ORG = "org-1";

beforeEach(() => {
  vi.clearAllMocks();
  mockDb.$transaction.mockImplementation(async (callback: (tx: typeof mockDb) => unknown) => callback(mockDb));
});

describe("Support messaging service — tenant isolation", () => {
  it("listSupportMessages scopes the conversation lookup and message query by organizationId", async () => {
    mockDb.supportConversation.findUnique.mockResolvedValue({ id: "conv-1", organizationId: ORG });
    mockDb.supportMessage.findMany.mockResolvedValue([]);

    await support.listSupportMessages(ORG);

    expect(mockDb.supportConversation.findUnique).toHaveBeenCalledWith({ where: { organizationId: ORG } });
    const call = mockDb.supportMessage.findMany.mock.calls[0][0];
    expect(call.where.organizationId).toBe(ORG);
    expect(call.where.conversationId).toBe("conv-1");
  });

  it("listSupportMessages returns an empty list without querying messages when no conversation exists yet", async () => {
    mockDb.supportConversation.findUnique.mockResolvedValue(null);
    const result = await support.listSupportMessages(ORG);
    expect(result.messages).toEqual([]);
    expect(mockDb.supportMessage.findMany).not.toHaveBeenCalled();
  });

  it("sendTenantMessage creates a TENANT-role message scoped to the sender's organization, marks the tenant side read, and returns the updated conversation", async () => {
    mockDb.supportConversation.upsert.mockResolvedValue({ id: "conv-1", organizationId: ORG });
    mockDb.supportMessage.create.mockResolvedValue({ id: "msg-1", createdAt: new Date("2026-01-01") });
    mockDb.supportConversation.update.mockResolvedValue({ id: "conv-1", organizationId: ORG, tenantLastReadAt: new Date("2026-01-01"), platformLastReadAt: null });
    mockDb.supportConversation.findUniqueOrThrow.mockResolvedValue({ id: "conv-1", organizationId: ORG, tenantLastReadAt: new Date("2026-01-01"), platformLastReadAt: null });

    const { message, conversation } = await support.sendTenantMessage(ORG, "user-1", "Jane Doe", "My invoice looks wrong");

    const createCall = mockDb.supportMessage.create.mock.calls[0][0];
    expect(createCall.data.organizationId).toBe(ORG);
    expect(createCall.data.senderRole).toBe("TENANT");
    expect(createCall.data.senderId).toBe("user-1");

    const updateCall = mockDb.supportConversation.update.mock.calls[0][0];
    expect(updateCall.data.tenantLastReadAt).toBeInstanceOf(Date);
    expect(updateCall.data.platformLastReadAt).toBeUndefined();

    expect(message.id).toBe("msg-1");
    expect(conversation.id).toBe("conv-1");
  });

  it("sendPlatformMessage creates a PLATFORM-role message and marks the platform side read, not the tenant side", async () => {
    mockDb.supportConversation.upsert.mockResolvedValue({ id: "conv-1", organizationId: ORG });
    mockDb.supportMessage.create.mockResolvedValue({ id: "msg-1", createdAt: new Date("2026-01-01") });
    mockDb.supportConversation.update.mockResolvedValue({ id: "conv-1", organizationId: ORG, tenantLastReadAt: null, platformLastReadAt: new Date("2026-01-01") });
    mockDb.supportConversation.findUniqueOrThrow.mockResolvedValue({ id: "conv-1", organizationId: ORG, tenantLastReadAt: null, platformLastReadAt: new Date("2026-01-01") });

    await support.sendPlatformMessage(ORG, "operator-1", "Rock Frost Support", "We're looking into this now");

    const createCall = mockDb.supportMessage.create.mock.calls[0][0];
    expect(createCall.data.senderRole).toBe("PLATFORM");

    const updateCall = mockDb.supportConversation.update.mock.calls[0][0];
    expect(updateCall.data.platformLastReadAt).toBeInstanceOf(Date);
    expect(updateCall.data.tenantLastReadAt).toBeUndefined();
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
  });

  it("rejects an empty or whitespace-only message before touching the database", async () => {
    await expect(support.sendTenantMessage(ORG, "user-1", "Jane", "   ")).rejects.toThrow();
    expect(mockDb.$transaction).not.toHaveBeenCalled();
  });

  it("getTenantUnreadCount is 0 when no conversation exists yet", async () => {
    mockDb.supportConversation.findUnique.mockResolvedValue(null);
    await expect(support.getTenantUnreadCount(ORG)).resolves.toBe(0);
    expect(mockDb.supportMessage.count).not.toHaveBeenCalled();
  });

  it("getTenantUnreadCount counts PLATFORM and AI messages newer than tenantLastReadAt, scoped to the conversation", async () => {
    const lastRead = new Date("2026-01-01");
    mockDb.supportConversation.findUnique.mockResolvedValue({ id: "conv-1", organizationId: ORG, tenantLastReadAt: lastRead });
    mockDb.supportMessage.count.mockResolvedValue(3);

    await support.getTenantUnreadCount(ORG);

    const call = mockDb.supportMessage.count.mock.calls[0][0];
    expect(call.where.organizationId).toBe(ORG);
    expect(call.where.conversationId).toBe("conv-1");
    expect(call.where.senderRole).toEqual({ in: ["PLATFORM", "AI"] });
    expect(call.where.createdAt).toEqual({ gt: lastRead });
  });

  it("listPlatformConversations excludes platform anchor organizations", async () => {
    mockDb.supportConversation.findMany.mockResolvedValue([]);
    await support.listPlatformConversations();
    const call = mockDb.supportConversation.findMany.mock.calls[0][0];
    expect(call.where.organizationId).toEqual({ notIn: ["anchor-org"] });
  });

  it("isTenantOnline checks presence only for that organization's own active members", async () => {
    mockDb.organizationMember.findMany.mockResolvedValue([{ userId: "user-1" }, { userId: "user-2" }]);
    mockDb.userPresence.findFirst.mockResolvedValue(null);

    await support.isTenantOnline(ORG);

    expect(mockDb.organizationMember.findMany).toHaveBeenCalledWith({ where: { organizationId: ORG, status: "ACTIVE" }, select: { userId: true } });
    const call = mockDb.userPresence.findFirst.mock.calls[0][0];
    expect(call.where.userId).toEqual({ in: ["user-1", "user-2"] });
  });

  it("isTenantOnline is false with no active members, without querying presence at all", async () => {
    mockDb.organizationMember.findMany.mockResolvedValue([]);
    await expect(support.isTenantOnline(ORG)).resolves.toBe(false);
    expect(mockDb.userPresence.findFirst).not.toHaveBeenCalled();
  });

  it("sendAiMessage creates an AI-role message with no sender account and bumps neither read cursor", async () => {
    mockDb.supportConversation.upsert.mockResolvedValue({ id: "conv-1", organizationId: ORG });
    mockDb.supportMessage.create.mockResolvedValue({ id: "msg-1", createdAt: new Date("2026-01-01") });
    mockDb.supportConversation.findUniqueOrThrow.mockResolvedValue({ id: "conv-1", organizationId: ORG, tenantLastReadAt: null, platformLastReadAt: null });

    await support.sendAiMessage(ORG, "You have 482 active students.");

    const createCall = mockDb.supportMessage.create.mock.calls[0][0];
    expect(createCall.data.senderRole).toBe("AI");
    expect(createCall.data.senderId).toBeNull();
    expect(createCall.data.senderName).toBe("Rock Frost AI Assistant");

    // An AI reply isn't a read acknowledgment from either side of the conversation.
    expect(mockDb.supportConversation.update).not.toHaveBeenCalled();
  });

  it("getPlatformUnreadCount still only counts TENANT messages — an AI reply doesn't need operator attention", async () => {
    mockDb.supportConversation.findMany.mockResolvedValue([{ id: "conv-1", platformLastReadAt: null }]);
    mockDb.supportMessage.count.mockResolvedValue(0);

    await support.getPlatformUnreadCount();

    const call = mockDb.supportMessage.count.mock.calls[0][0];
    expect(call.where.senderRole).toBe("TENANT");
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
