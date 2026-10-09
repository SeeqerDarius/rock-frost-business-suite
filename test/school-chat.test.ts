import { beforeEach, describe, expect, it, vi } from "vitest";

const mockDb = {
  organization: { findUnique: vi.fn() },
  schoolChatMember: { findFirst: vi.fn() },
  schoolChatMessage: { findFirst: vi.fn() },
  webPushSubscription: { findMany: vi.fn() },
};
vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("@/lib/audit", () => ({ logAuditEvent: vi.fn() }));
vi.mock("next/server", () => ({ after: (fn: () => unknown) => fn() }));

const chat = await import("@/modules/school/chat-service");
const { schoolChatAttachmentData, SchoolChatAttachmentError } = await import("@/lib/school-chat-attachment");
const { sendWebPushToUsers, isWebPushConfigured } = await import("@/lib/web-push");
const { getNotificationHref } = await import("@/lib/notifications/deep-link");

const staff = { kind: "staff" as const, organizationId: "org-1", userId: "staff-1", name: "Teacher", canBroadcast: false };
const guardian = { kind: "guardian" as const, organizationId: "org-1", userId: "guardian-1", name: "Parent", guardianId: "g-1", studentIds: ["s-1"] };
const file = (bytes: number[], type: string, name = "file") => new File([new Uint8Array(bytes)], name, { type });

beforeEach(() => vi.clearAllMocks());

describe("school chat attachments", () => {
  it("accepts photos and PDFs whose bytes match their type", async () => {
    const pdf = await schoolChatAttachmentData(file([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31], "application/pdf", "report.pdf"));
    expect(pdf).toMatchObject({ fileName: "report.pdf", mimeType: "application/pdf", size: 6 });
    expect(pdf!.dataUrl.startsWith("data:application/pdf;base64,")).toBe(true);
    expect(await schoolChatAttachmentData(file([0xff, 0xd8, 0xff, 0xe0], "image/jpeg", "a/b\\c.jpg"))).toMatchObject({ fileName: "a b c.jpg" });
    expect(await schoolChatAttachmentData(null)).toBeNull();
  });

  it("rejects disguised, unsupported, and oversized files", async () => {
    await expect(schoolChatAttachmentData(file([0x3c, 0x73, 0x76, 0x67], "image/png"))).rejects.toBeInstanceOf(SchoolChatAttachmentError);
    await expect(schoolChatAttachmentData(file([0x4d, 0x5a], "application/x-msdownload"))).rejects.toThrow(/photo|PDF/);
    await expect(schoolChatAttachmentData(new File([new Uint8Array(4 * 1024 * 1024 + 1)], "big.pdf", { type: "application/pdf" }))).rejects.toThrow(/4 MB/);
  });
});

describe("school chat gates before any data access", () => {
  it("only lets staff create groups and only publishers broadcast", async () => {
    await expect(chat.createGroupChat(guardian, { name: "Parents", memberUserIds: ["x"] })).rejects.toMatchObject({ code: "forbidden" });
    await expect(chat.broadcastMessage(staff, { audience: "ALL_STAFF", body: "Hi", clientRequestId: "req-12345678" })).rejects.toMatchObject({ code: "forbidden" });
    await expect(chat.broadcastMessage(guardian, { audience: "ALL_STAFF", body: "Hi", clientRequestId: "req-12345678" })).rejects.toMatchObject({ code: "forbidden" });
    expect(mockDb.organization.findUnique).not.toHaveBeenCalled();
  });

  it("validates message text, group names, reactions, and request ids", async () => {
    await expect(chat.sendChatMessage(staff, { chatId: "c1", body: "   ", clientRequestId: "req-12345678" })).rejects.toMatchObject({ code: "invalid" });
    await expect(chat.sendChatMessage(staff, { chatId: "c1", body: "x".repeat(4001), clientRequestId: "req-12345678" })).rejects.toMatchObject({ code: "invalid" });
    await expect(chat.sendChatMessage(staff, { chatId: "c1", body: "Hi", clientRequestId: "<bad>" })).rejects.toMatchObject({ code: "invalid" });
    await expect(chat.createGroupChat({ ...staff }, { name: "x", memberUserIds: ["u"] })).rejects.toMatchObject({ code: "invalid" });
    await expect(chat.reactToChatMessage(staff, { messageId: "m1", emoji: "🍕" })).rejects.toMatchObject({ code: "invalid" });
    expect(mockDb.schoolChatMember.findFirst).not.toHaveBeenCalled();
  });

  it("treats a chat the viewer is not a member of as not found", async () => {
    mockDb.schoolChatMember.findFirst.mockResolvedValue(null);
    await expect(chat.getChat(staff, "chat-of-someone-else")).rejects.toMatchObject({ code: "not-found" });
    expect(mockDb.schoolChatMember.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ organizationId: "org-1", userId: "staff-1", leftAt: null }) }));
  });
});

describe("chat notifications", () => {
  it("leaves web push off until VAPID keys are configured", async () => {
    expect(isWebPushConfigured()).toBe(false);
    await expect(sendWebPushToUsers(["u1"], { title: "t", body: "b", url: "/app" })).resolves.toEqual({ sent: 0 });
    expect(mockDb.webPushSubscription.findMany).not.toHaveBeenCalled();
  });

  it("opens the chat from a bell notification", () => {
    expect(getNotificationHref({ type: "SCHOOL_CHAT_MESSAGE", metadata: { chatId: "ckabcdefghijklmnop" } }, false)).toBe("/app/school/chats/ckabcdefghijklmnop");
    expect(getNotificationHref({ type: "SCHOOL_CHAT_MESSAGE", metadata: { chatId: "../../evil" } }, false)).toBe("/app/school/chats");
  });
});
