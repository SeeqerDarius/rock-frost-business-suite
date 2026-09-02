import { describe, expect, it, vi } from "vitest";

const mockDb = {
  fileAsset: { aggregate: vi.fn() },
  auditLog: { findFirst: vi.fn() },
  fleetPayment: { count: vi.fn() },
  offlineDevice: { count: vi.fn() },
};

vi.mock("@/lib/db", () => ({ db: mockDb }));

const { getOrganizationHealthSnapshot } = await import("@/platform/organizations/health");

describe("getOrganizationHealthSnapshot", () => {
  it("combines four independent, already-recorded signals into one snapshot", async () => {
    mockDb.fileAsset.aggregate.mockResolvedValue({ _sum: { size: 5_242_880 } });
    mockDb.auditLog.findFirst.mockResolvedValue({ createdAt: new Date("2026-09-01T00:00:00Z") });
    mockDb.fleetPayment.count.mockResolvedValue(2);
    mockDb.offlineDevice.count.mockResolvedValue(3);

    const snapshot = await getOrganizationHealthSnapshot("org-1");

    expect(snapshot).toEqual({
      storageBytes: 5_242_880,
      lastActivityAt: new Date("2026-09-01T00:00:00Z"),
      failedFleetPostings: 2,
      activeOfflineDevices: 3,
    });
    expect(mockDb.fileAsset.aggregate).toHaveBeenCalledWith({ where: { organizationId: "org-1" }, _sum: { size: true } });
    expect(mockDb.fleetPayment.count).toHaveBeenCalledWith({ where: { organizationId: "org-1", postingStatus: "FAILED" } });
    expect(mockDb.offlineDevice.count).toHaveBeenCalledWith({ where: { organizationId: "org-1", status: "ACTIVE" } });
  });

  it("reports honest zero/null values for an organization with no recorded activity at all, not fabricated defaults", async () => {
    mockDb.fileAsset.aggregate.mockResolvedValue({ _sum: { size: null } });
    mockDb.auditLog.findFirst.mockResolvedValue(null);
    mockDb.fleetPayment.count.mockResolvedValue(0);
    mockDb.offlineDevice.count.mockResolvedValue(0);

    const snapshot = await getOrganizationHealthSnapshot("org-empty");

    expect(snapshot).toEqual({ storageBytes: 0, lastActivityAt: null, failedFleetPostings: 0, activeOfflineDevices: 0 });
  });
});
