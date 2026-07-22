import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRequireModuleAccess = vi.fn();
const mockHasPermission = vi.fn();
const mockGetAnalyticsOverview = vi.fn();
const mockListPayslips = vi.fn();

const tenant = {
  organizationId: "org-1",
  enabledModuleKeys: ["analytics", "payroll"],
};

vi.mock("@/lib/auth/module-access", () => ({ requireModuleAccess: mockRequireModuleAccess }));
vi.mock("@/lib/auth/permissions", () => ({
  hasPermission: mockHasPermission,
  PERMISSIONS: {
    ANALYTICS_VIEW: "analytics.view",
    PAYROLL_PAYSLIPS_VIEW: "payroll.payslips.view",
  },
}));
vi.mock("@/modules/analytics/service", () => ({ getAnalyticsOverview: mockGetAnalyticsOverview }));
vi.mock("@/modules/payroll/service", () => ({ listPayslips: mockListPayslips }));

const { default: AnalyticsOverviewPage } = await import("@/app/app/analytics/page");
const { default: PayrollPayslipsPage } = await import("@/app/app/payroll/payslips/page");

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireModuleAccess.mockResolvedValue(tenant);
  mockHasPermission.mockReturnValue(false);
});

describe("fine-grained page read boundaries", () => {
  it("does not query broad analytics aggregates without analytics overview permission", async () => {
    await AnalyticsOverviewPage();

    expect(mockRequireModuleAccess).toHaveBeenCalledWith("analytics");
    expect(mockHasPermission).toHaveBeenCalledWith(tenant, "analytics.view");
    expect(mockGetAnalyticsOverview).not.toHaveBeenCalled();
  });

  it("does not query organization payslips without payslip-viewing permission", async () => {
    await PayrollPayslipsPage();

    expect(mockRequireModuleAccess).toHaveBeenCalledWith("payroll");
    expect(mockHasPermission).toHaveBeenCalledWith(tenant, "payroll.payslips.view");
    expect(mockListPayslips).not.toHaveBeenCalled();
  });
});
