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

  it("requires the publish permission and an active class for class announcements", async () => {
    const announcement = { title: "Sports day", body: "Friday", audience: "ALL_GUARDIANS" as const, clientRequestId: "req-12345678" };
    await expect(comms.publishAnnouncement(actor({ canPublishAnnouncements: false }), announcement)).rejects.toMatchObject({ code: "forbidden" });
    mockDb.schoolClass.findFirst.mockResolvedValue(null);
    await expect(comms.publishAnnouncement(actor(), { ...announcement, audience: "CLASS_GUARDIANS", classId: "class-other-org" })).rejects.toMatchObject({ code: "invalid" });
    expect(mockDb.schoolClass.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ organizationId: "org-1", active: true }) }));
    expect(mockDb.schoolAnnouncement.create).not.toHaveBeenCalled();
  });
});
