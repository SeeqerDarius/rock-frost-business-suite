import { describe, expect, it, vi } from "vitest";

const mockGetPlatformAnchorOrganizationIds = vi.fn();

const mockDb = {
  organization: { groupBy: vi.fn(), findMany: vi.fn() },
  auditLog: { findMany: vi.fn(), count: vi.fn() },
};

vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("@/lib/platform-organizations", () => ({ getPlatformAnchorOrganizationIds: mockGetPlatformAnchorOrganizationIds }));

const { getTrialAndChurnReport } = await import("@/platform/trials/reporting");

describe("getTrialAndChurnReport", () => {
  it("excludes Rock Frost's own anchor organization from every query, matching business-insights' own convention", async () => {
    mockGetPlatformAnchorOrganizationIds.mockResolvedValue(["anchor-org"]);
    mockDb.organization.groupBy.mockResolvedValue([]);
    mockDb.organization.findMany.mockResolvedValue([]);
    mockDb.auditLog.findMany.mockResolvedValue([]);
    mockDb.auditLog.count.mockResolvedValue(0);

    await getTrialAndChurnReport();

    expect(mockDb.organization.groupBy).toHaveBeenCalledWith(expect.objectContaining({ where: { id: { notIn: ["anchor-org"] } } }));
    expect(mockDb.organization.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: { notIn: ["anchor-org"] }, status: "TRIAL" } }));
  });

  it("sorts at-risk trials soonest-expiring first", async () => {
    mockGetPlatformAnchorOrganizationIds.mockResolvedValue([]);
    mockDb.organization.groupBy.mockResolvedValue([]);
    mockDb.organization.findMany.mockResolvedValue([
      { id: "org-far", name: "Far From Expiry", tenantCode: "far", createdAt: new Date() },
      { id: "org-soon", name: "Nearly Expired", tenantCode: "soon", createdAt: new Date(Date.now() - 13 * 86_400_000) },
    ]);
    mockDb.auditLog.findMany.mockResolvedValue([]);
    mockDb.auditLog.count.mockResolvedValue(0);

    const report = await getTrialAndChurnReport();

    expect(report.atRiskTrials.map((trial) => trial.organizationId)).toEqual(["org-soon", "org-far"]);
  });

  it("treats a trial-expired event as an implicit TRIAL to SUSPENDED transition, since the action name alone says so", async () => {
    mockGetPlatformAnchorOrganizationIds.mockResolvedValue([]);
    mockDb.organization.groupBy.mockResolvedValue([{ status: "SUSPENDED", _count: { _all: 1 } }]);
    mockDb.organization.findMany.mockResolvedValue([]);
    mockDb.auditLog.findMany.mockResolvedValue([
      { id: "evt-1", organizationId: "org-1", action: "organization.trial_expired", changes: null, createdAt: new Date(), organization: { name: "Expired Co" } },
    ]);
    mockDb.auditLog.count.mockResolvedValue(1);

    const report = await getTrialAndChurnReport();

    expect(report.recentEvents).toEqual([{ id: "evt-1", organizationId: "org-1", organizationName: "Expired Co", createdAt: expect.any(Date), from: "TRIAL", to: "SUSPENDED" }]);
    expect(report.organizationsByStatus).toEqual({ SUSPENDED: 1 });
  });

  it("reads a manual status change from its own recorded from/to, not the trial-expiry default", async () => {
    mockGetPlatformAnchorOrganizationIds.mockResolvedValue([]);
    mockDb.organization.groupBy.mockResolvedValue([]);
    mockDb.organization.findMany.mockResolvedValue([]);
    mockDb.auditLog.findMany.mockResolvedValue([
      { id: "evt-2", organizationId: "org-2", action: "organization.status_changed", changes: { from: "TRIAL", to: "ACTIVE" }, createdAt: new Date(), organization: { name: "Converted Co" } },
    ]);
    mockDb.auditLog.count.mockResolvedValue(0);

    const report = await getTrialAndChurnReport();

    expect(report.recentEvents).toEqual([{ id: "evt-2", organizationId: "org-2", organizationName: "Converted Co", createdAt: expect.any(Date), from: "TRIAL", to: "ACTIVE" }]);
  });

  it("computes convertedCount and expiredCount from dedicated unbounded queries, not the 50-row recent-events window", async () => {
    mockGetPlatformAnchorOrganizationIds.mockResolvedValue([]);
    mockDb.organization.groupBy.mockResolvedValue([]);
    mockDb.organization.findMany.mockResolvedValue([]);
    mockDb.auditLog.findMany.mockResolvedValue([]);
    // Two distinct count() calls happen in this order: trial_expired, then converted.
    mockDb.auditLog.count.mockResolvedValueOnce(7).mockResolvedValueOnce(12);

    const report = await getTrialAndChurnReport();

    expect(report.expiredCount).toBe(7);
    expect(report.convertedCount).toBe(12);
  });
});
