import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Mocked rather than a real-Postgres integration test: this aggregates
 * across every organization on the platform, so a real-DB test run
 * concurrently with any other test suite that creates organizations would
 * pollute the totals and make exact-value assertions flaky. The
 * aggregation math (currency grouping, product-group key expansion,
 * status counts) is what's actually novel here; getAnalyticsOverview()
 * itself is already an existing, separately-relied-on function.
 */

const mockDb = {
  organization: { groupBy: vi.fn(), findMany: vi.fn() },
};

vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("@/lib/platform-organizations", () => ({ getPlatformAnchorOrganizationIds: vi.fn().mockResolvedValue(["anchor-org"]) }));

const mockGetAnalyticsOverview = vi.fn();
vi.mock("@/modules/analytics/service", () => ({ getAnalyticsOverview: mockGetAnalyticsOverview }));

const { getPlatformBusinessInsights } = await import("@/platform/business-insights/service");

function overview(overrides: Partial<Awaited<ReturnType<typeof mockGetAnalyticsOverview>>> = {}) {
  return {
    totalRevenue: 0, cashBalance: 0, netIncome: 0, pipelineValue: 0,
    activeEmployees: 0, vehicleCount: 0, stockValue: 0, openOrderValue: 0, lastPayrollNet: 0,
    enabledModuleCount: 0,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getPlatformBusinessInsights", () => {
  it("groups money totals by each organization's own currency instead of blending them together", async () => {
    mockDb.organization.groupBy.mockResolvedValue([
      { status: "ACTIVE", _count: { _all: 2 } },
      { status: "TRIAL", _count: { _all: 1 } },
    ]);
    mockDb.organization.findMany.mockResolvedValue([
      { id: "org-ghs-1", currency: "GHS", organizationModules: [{ module: { code: "hr" } }] },
      { id: "org-ghs-2", currency: "GHS", organizationModules: [{ module: { code: "fleet" } }] },
      { id: "org-usd-1", currency: "USD", organizationModules: [{ module: { code: "crm" } }] },
    ]);
    mockGetAnalyticsOverview
      .mockResolvedValueOnce(overview({ totalRevenue: 1000, activeEmployees: 5 }))
      .mockResolvedValueOnce(overview({ totalRevenue: 500, vehicleCount: 3 }))
      .mockResolvedValueOnce(overview({ totalRevenue: 200, pipelineValue: 900 }));

    const result = await getPlatformBusinessInsights();

    expect(result.organizationsByStatus).toEqual({ ACTIVE: 2, TRIAL: 1 });
    expect(result.organizationsIncluded).toBe(3);
    expect(Object.keys(result.moneyByCurrency).sort()).toEqual(["GHS", "USD"]);
    expect(result.moneyByCurrency.GHS.totalRevenue).toBe(1500);
    expect(result.moneyByCurrency.GHS.organizationCount).toBe(2);
    expect(result.moneyByCurrency.USD.totalRevenue).toBe(200);
    expect(result.moneyByCurrency.USD.pipelineValue).toBe(900);
    // Non-money counts are currency-independent and always sum across every organization.
    expect(result.activeEmployees).toBe(5);
    expect(result.vehicleCount).toBe(3);
  });

  it("excludes platform anchor organizations from both the status counts and the query filter", async () => {
    mockDb.organization.groupBy.mockResolvedValue([]);
    mockDb.organization.findMany.mockResolvedValue([]);

    await getPlatformBusinessInsights();

    expect(mockDb.organization.groupBy).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: { notIn: ["anchor-org"] } }),
    }));
    expect(mockDb.organization.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: { notIn: ["anchor-org"] }, status: { in: ["ACTIVE", "TRIAL"] } }),
    }));
  });

  it("expands a bare 'hr' module code into its full product group before calling getAnalyticsOverview, matching Payroll's entitlement", async () => {
    mockDb.organization.groupBy.mockResolvedValue([]);
    mockDb.organization.findMany.mockResolvedValue([
      { id: "org-1", currency: "GHS", organizationModules: [{ module: { code: "hr" } }] },
    ]);
    mockGetAnalyticsOverview.mockResolvedValueOnce(overview());

    await getPlatformBusinessInsights();

    const [, enabledModuleKeys] = mockGetAnalyticsOverview.mock.calls[0];
    expect(enabledModuleKeys).toEqual(expect.arrayContaining(["hr", "payroll"]));
  });

  it("returns an empty result with no organizations, rather than throwing", async () => {
    mockDb.organization.groupBy.mockResolvedValue([]);
    mockDb.organization.findMany.mockResolvedValue([]);

    const result = await getPlatformBusinessInsights();

    expect(result.organizationsIncluded).toBe(0);
    expect(result.moneyByCurrency).toEqual({});
    expect(result.activeEmployees).toBe(0);
    expect(result.vehicleCount).toBe(0);
  });
});

describe("Platform dashboard business activity section", () => {
  it("is gated on requirePlatformOperator, same as the rest of platform scope, and documents the modules it doesn't cover", () => {
    const source = readFileSync("src/app/app/platform/dashboard/page.tsx", "utf8");
    expect(source).toContain("await requirePlatformOperator()");
    expect(source).toContain("getPlatformBusinessInsights");
    expect(source).toContain("aren&apos;t summarized by Analytics yet");
  });
});
