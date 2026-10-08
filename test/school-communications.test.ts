import { beforeEach, describe, expect, it, vi } from "vitest";

const mockDb = {
  organization: { findUnique: vi.fn() },
  schoolClassTeacher: { findMany: vi.fn() },
  schoolMessage: { findFirst: vi.fn(), create: vi.fn() },
  schoolConversation: { create: vi.fn(), findFirst: vi.fn() },
  schoolAnnouncement: { create: vi.fn() },
  schoolClass: { findFirst: vi.fn() },
  $transaction: vi.fn(),
};
vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("@/lib/audit", () => ({ logAuditEvent: vi.fn() }));

const comms = await import("@/modules/school/communications-service");

const actor = (overrides: Partial<import("@/modules/school/communications-service").StaffActor> = {}) => ({ organizationId: "org-1", userId: "user-1", canViewSchool: true, canManageMessages: true, canPublishAnnouncements: true, ...overrides });
const start = { studentId: "student-1", guardianId: "guardian-1", subject: "Homework", body: "Hello", clientRequestId: "req-12345678" };

beforeEach(() => {
  vi.clearAllMocks();
  mockDb.organization.findUnique.mockResolvedValue({ schoolPortalGranted: true, schoolGuardianMessagingGranted: true });
  mockDb.schoolMessage.findFirst.mockResolvedValue(null);
});

describe("school communications gates", () => {
  it("builds the staff actor only from server-side permission checks", () => {
    const granted = new Set(["school.view", "school.messages.manage"]);
    expect(comms.staffActorFor({ organizationId: "org-1", userId: "user-1" }, (permission) => granted.has(permission))).toEqual({ organizationId: "org-1", userId: "user-1", canViewSchool: true, canManageMessages: true, canPublishAnnouncements: false });
  });

  it("refuses staff without the messaging permission before reading any data", async () => {
    await expect(comms.startStaffConversation(actor({ canManageMessages: false }), start)).rejects.toMatchObject({ code: "forbidden" });
    expect(mockDb.organization.findUnique).not.toHaveBeenCalled();
  });

  it("requires both paid add-ons for direct messaging", async () => {
    mockDb.organization.findUnique.mockResolvedValue({ schoolPortalGranted: true, schoolGuardianMessagingGranted: false });
    await expect(comms.startStaffConversation(actor(), start)).rejects.toMatchObject({ code: "unavailable" });
    mockDb.organization.findUnique.mockResolvedValue({ schoolPortalGranted: false, schoolGuardianMessagingGranted: true });
    await expect(comms.startStaffConversation(actor(), start)).rejects.toMatchObject({ code: "unavailable" });
    expect(mockDb.schoolConversation.create).not.toHaveBeenCalled();
  });

  it("validates subject, message, and request id before writing", async () => {
    await expect(comms.startStaffConversation(actor(), { ...start, subject: "x" })).rejects.toMatchObject({ code: "invalid" });
    await expect(comms.startStaffConversation(actor(), { ...start, body: " \n " })).rejects.toMatchObject({ code: "invalid" });
    await expect(comms.startStaffConversation(actor(), { ...start, body: "a".repeat(4001) })).rejects.toMatchObject({ code: "invalid" });
    await expect(comms.startStaffConversation(actor(), { ...start, clientRequestId: "<script>" })).rejects.toMatchObject({ code: "invalid" });
    expect(mockDb.$transaction).not.toHaveBeenCalled();
  });

  it("returns the earlier conversation when the same form is submitted again", async () => {
    mockDb.schoolMessage.findFirst.mockResolvedValue({ conversationId: "conversation-1" });
    await expect(comms.startStaffConversation(actor(), start)).resolves.toEqual({ conversationId: "conversation-1", duplicate: true });
    expect(mockDb.$transaction).not.toHaveBeenCalled();
  });

  it("requires the publish permission and an active class for class announcements", async () => {
    const announcement = { title: "Sports day", body: "Friday", audience: "ALL_GUARDIANS" as const, clientRequestId: "req-12345678" };
    await expect(comms.publishAnnouncement(actor({ canPublishAnnouncements: false }), announcement)).rejects.toMatchObject({ code: "forbidden" });
    mockDb.schoolClass.findFirst.mockResolvedValue(null);
    await expect(comms.publishAnnouncement(actor(), { ...announcement, audience: "CLASS_GUARDIANS", classId: "class-other-org" })).rejects.toMatchObject({ code: "invalid" });
    expect(mockDb.schoolClass.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ organizationId: "org-1", active: true }) }));
    expect(mockDb.schoolAnnouncement.create).not.toHaveBeenCalled();
  });
});
