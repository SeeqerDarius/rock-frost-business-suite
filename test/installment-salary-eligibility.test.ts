import { beforeEach, describe, expect, it, vi } from "vitest";

const mockDb = {
  hirePurchaseStaff: { findFirst: vi.fn() },
  hirePurchaseStaffSalaryHistory: { findMany: vi.fn() },
};

vi.mock("@/lib/db", () => ({ db: mockDb }));

const { getEffectiveMonthlySalary } = await import("@/modules/installment/service");

describe("Installment salary eligibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.hirePurchaseStaffSalaryHistory.findMany.mockResolvedValue([]);
  });

  it("returns zero for a salary month before the staff member joined", async () => {
    mockDb.hirePurchaseStaff.findFirst.mockResolvedValue({
      id: "staff-new",
      organizationId: "org-1",
      monthlySalary: "1200.00",
      createdAt: new Date(2026, 6, 15),
    });

    await expect(
      getEffectiveMonthlySalary("staff-new", "org-1", new Date(2026, 5, 1)),
    ).resolves.toBe(0);
    expect(mockDb.hirePurchaseStaffSalaryHistory.findMany).not.toHaveBeenCalled();
  });

  it("returns the salary from the staff member's joining month onward", async () => {
    mockDb.hirePurchaseStaff.findFirst.mockResolvedValue({
      id: "staff-new",
      organizationId: "org-1",
      monthlySalary: "1200.00",
      createdAt: new Date(2026, 6, 15),
    });

    await expect(
      getEffectiveMonthlySalary("staff-new", "org-1", new Date(2026, 6, 1)),
    ).resolves.toBe(1200);
  });
});
