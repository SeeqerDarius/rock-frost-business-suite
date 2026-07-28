import { beforeEach, describe, expect, it, vi } from "vitest";

const tx = {
  organization: { updateMany: vi.fn() },
  organizationModule: { updateMany: vi.fn() },
  notification: { createMany: vi.fn() },
};
const mockDb = {
  organization: { findMany: vi.fn() },
  $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
};
const mockLogAuditEvent = vi.fn();
const mockGetPlatformAnchorOrganizationIds = vi.fn();

vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("@/lib/audit", () => ({ logAuditEvent: mockLogAuditEvent }));
vi.mock("@/lib/platform-organizations", () => ({
  getPlatformAnchorOrganizationIds: mockGetPlatformAnchorOrganizationIds,
}));

const {
  expireTrials,
  getTrialDaysRemaining,
  getTrialEndsAt,
  TRIAL_DURATION_DAYS,
} = await import("@/platform/trials/service");

beforeEach(() => {
  vi.clearAllMocks();
  mockGetPlatformAnchorOrganizationIds.mockResolvedValue(["platform-org"]);
  tx.organization.updateMany.mockResolvedValue({ count: 1 });
  tx.organizationModule.updateMany.mockResolvedValue({ count: 2 });
  tx.notification.createMany.mockResolvedValue({ count: 1 });
});

describe("trial-expiry enforcement", () => {
  it("uses one consistent 14-day UTC duration for display and enforcement", () => {
    const createdAt = new Date("2026-07-01T12:00:00.000Z");
    expect(TRIAL_DURATION_DAYS).toBe(14);
    expect(getTrialEndsAt(createdAt)).toEqual(new Date("2026-07-15T12:00:00.000Z"));
    expect(getTrialDaysRemaining(createdAt, new Date("2026-07-14T12:00:00.000Z"))).toBe(1);
    expect(getTrialDaysRemaining(createdAt, new Date("2026-07-16T12:00:00.000Z"))).toBe(0);
  });

  it("suspends expired customer trials, disables modules, notifies members, and audits atomically", async () => {
    mockDb.organization.findMany.mockResolvedValue([{
      id: "trial-org",
      name: "Trial Organization",
      members: [{ userId: "owner-1" }],
    }]);
    const now = new Date("2026-07-28T01:15:00.000Z");

    const result = await expireTrials(now);

    expect(result).toMatchObject({ candidates: 1, expired: 1 });
    expect(result.cutoff).toEqual(new Date("2026-07-14T01:15:00.000Z"));
    expect(mockDb.organization.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        status: "TRIAL",
        createdAt: { lte: result.cutoff },
        id: { notIn: ["platform-org"] },
        subscriptions: { none: expect.objectContaining({ status: "ACTIVE" }) },
      }),
    }));
    expect(tx.organization.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: "trial-org", status: "TRIAL" }),
      data: { status: "SUSPENDED" },
    }));
    expect(tx.organizationModule.updateMany).toHaveBeenCalledWith({
      where: { organizationId: "trial-org", enabled: true },
      data: { enabled: false },
    });
    expect(tx.notification.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ userId: "owner-1", type: "TRIAL_EXPIRED" })],
    });
    expect(mockLogAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: "organization.trial_expired", organizationId: "trial-org" }),
      tx,
    );
  });

  it("is idempotent when another invocation claims the organization first", async () => {
    mockDb.organization.findMany.mockResolvedValue([{
      id: "trial-org",
      name: "Trial Organization",
      members: [{ userId: "owner-1" }],
    }]);
    tx.organization.updateMany.mockResolvedValue({ count: 0 });

    const result = await expireTrials(new Date("2026-07-28T01:15:00.000Z"));

    expect(result).toMatchObject({ candidates: 1, expired: 0 });
    expect(tx.organizationModule.updateMany).not.toHaveBeenCalled();
    expect(tx.notification.createMany).not.toHaveBeenCalled();
    expect(mockLogAuditEvent).not.toHaveBeenCalled();
  });

  it("does no transactional work when no trial is eligible", async () => {
    mockDb.organization.findMany.mockResolvedValue([]);

    const result = await expireTrials(new Date("2026-07-28T01:15:00.000Z"));

    expect(result).toMatchObject({ candidates: 0, expired: 0 });
    expect(mockDb.$transaction).not.toHaveBeenCalled();
  });
});
