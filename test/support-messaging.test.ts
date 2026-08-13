import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDb = {
  supportConversation: { upsert: vi.fn(), findUnique: vi.fn(), update: vi.fn(), findMany: vi.fn() },
  supportMessage: { create: vi.fn(), findMany: vi.fn(), count: vi.fn() },
  organizationMember: { findMany: vi.fn() },
  userPresence: { findFirst: vi.fn(), upsert: vi.fn() },
  $transaction: vi.fn(),
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

  it("sendTenantMessage creates a TENANT-role message scoped to the sender's organization and marks the tenant side read", async () => {
    mockDb.supportConversation.upsert.mockResolvedValue({ id: "conv-1", organizationId: ORG });
    mockDb.supportMessage.create.mockResolvedValue({ id: "msg-1", createdAt: new Date("2026-01-01") });

    await support.sendTenantMessage(ORG, "user-1", "Jane Doe", "My invoice looks wrong");

    const createCall = mockDb.supportMessage.create.mock.calls[0][0];
    expect(createCall.data.organizationId).toBe(ORG);
    expect(createCall.data.senderRole).toBe("TENANT");
    expect(createCall.data.senderId).toBe("user-1");

    const updateCall = mockDb.supportConversation.update.mock.calls[0][0];
    expect(updateCall.data.tenantLastReadAt).toBeInstanceOf(Date);
    expect(updateCall.data.platformLastReadAt).toBeUndefined();
  });

  it("sendPlatformMessage creates a PLATFORM-role message and marks the platform side read, not the tenant side", async () => {
    mockDb.supportConversation.upsert.mockResolvedValue({ id: "conv-1", organizationId: ORG });
    mockDb.supportMessage.create.mockResolvedValue({ id: "msg-1", createdAt: new Date("2026-01-01") });

    await support.sendPlatformMessage(ORG, "operator-1", "Rock Frost Support", "We're looking into this now");

    const createCall = mockDb.supportMessage.create.mock.calls[0][0];
    expect(createCall.data.senderRole).toBe("PLATFORM");

    const updateCall = mockDb.supportConversation.update.mock.calls[0][0];
    expect(updateCall.data.platformLastReadAt).toBeInstanceOf(Date);
    expect(updateCall.data.tenantLastReadAt).toBeUndefined();
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

  it("getTenantUnreadCount only counts PLATFORM messages newer than tenantLastReadAt, scoped to the conversation", async () => {
    const lastRead = new Date("2026-01-01");
    mockDb.supportConversation.findUnique.mockResolvedValue({ id: "conv-1", organizationId: ORG, tenantLastReadAt: lastRead });
    mockDb.supportMessage.count.mockResolvedValue(3);

    await support.getTenantUnreadCount(ORG);

    const call = mockDb.supportMessage.count.mock.calls[0][0];
    expect(call.where.organizationId).toBe(ORG);
    expect(call.where.conversationId).toBe("conv-1");
    expect(call.where.senderRole).toBe("PLATFORM");
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

  it("is registered in both sidebar navigations with a live unread count, and never emails anyone", () => {
    const workspaceNav = read("src/platform/modules/workspace-navigation.tsx");
    expect(workspaceNav).toContain("/app/support");
    expect(workspaceNav).toContain("getTenantUnreadCount");

    const platformNav = read("src/platform/modules/platform-navigation.tsx");
    expect(platformNav).toContain("/app/platform/support");
    expect(platformNav).toContain("getPlatformUnreadCount");

    for (const file of [
      "src/lib/support/service.ts",
      "src/app/app/(overview)/support/actions.ts",
      "src/app/app/platform/support/actions.ts",
    ]) {
      const source = read(file);
      expect(source, file).not.toMatch(/sendEmail|resend|@\/lib\/email/i);
    }
  });
});
