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
  organization: { groupBy: vi.fn(), findMany: vi.fn(), findUnique: vi.fn() },
  subscription: { findMany: vi.fn() },
};

vi.mock("@/lib/db", () => ({ db: mockDb }));
const mockGetPlatformAnchorOrganizationIds = vi.fn().mockResolvedValue(["anchor-org"]);
vi.mock("@/lib/platform-organizations", () => ({ getPlatformAnchorOrganizationIds: mockGetPlatformAnchorOrganizationIds }));

const mockGetAnalyticsOverview = vi.fn();
vi.mock("@/modules/analytics/service", () => ({ getAnalyticsOverview: mockGetAnalyticsOverview }));

const mockListEmployees = vi.fn();
vi.mock("@/modules/hr/service", () => ({ listEmployees: mockListEmployees }));

const { getPlatformBusinessInsights, getPlatformRevenueOverview, getPlatformOwnBusinessOverview } = await import("@/platform/business-insights/service");

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

describe("getPlatformRevenueOverview", () => {
  it("computes MRR only from currently-active, in-window subscriptions, and keeps pending/collected separate", async () => {
    const now = new Date("2026-08-24T00:00:00.000Z");
    mockDb.subscription.findMany.mockResolvedValue([
      // Active, 12-month, GHS 2400 -> MRR contribution 200/month.
      { status: "ACTIVE", amount: 2400, currency: "GHS", durationMonths: 12, paidAt: new Date("2026-01-01"), startsAt: new Date("2026-01-01"), endsAt: new Date("2027-01-01") },
      // Active but already ended - must not count toward MRR.
      { status: "ACTIVE", amount: 1200, currency: "GHS", durationMonths: 12, paidAt: new Date("2024-01-01"), startsAt: new Date("2024-01-01"), endsAt: new Date("2025-01-01") },
      // Quoted, unpaid - pending, not collected, not MRR.
      { status: "PENDING_PAYMENT", amount: 500, currency: "GHS", durationMonths: 1, paidAt: null, startsAt: null, endsAt: null },
      // A different currency entirely, must not blend with GHS.
      { status: "ACTIVE", amount: 100, currency: "USD", durationMonths: 1, paidAt: new Date("2026-08-01"), startsAt: new Date("2026-08-01"), endsAt: new Date("2026-09-01") },
    ]);
    vi.setSystemTime(now);

    const result = await getPlatformRevenueOverview();

    expect(result.revenueByCurrency.GHS.mrr).toBe(200);
    expect(result.revenueByCurrency.GHS.activeSubscriptionCount).toBe(1);
    expect(result.revenueByCurrency.GHS.totalCollected).toBe(3600);
    expect(result.revenueByCurrency.GHS.pendingAmount).toBe(500);
    expect(result.revenueByCurrency.USD.mrr).toBe(100);
    vi.useRealTimers();
  });

  it("groups collected revenue into a monthly trend, keyed by month and currency", async () => {
    mockDb.subscription.findMany.mockResolvedValue([
      { status: "ACTIVE", amount: 100, currency: "GHS", durationMonths: 1, paidAt: new Date("2026-06-15"), startsAt: null, endsAt: null },
      { status: "ACTIVE", amount: 150, currency: "GHS", durationMonths: 1, paidAt: new Date("2026-06-20"), startsAt: null, endsAt: null },
      { status: "CANCELLED", amount: 200, currency: "GHS", durationMonths: 1, paidAt: new Date("2026-07-01"), startsAt: null, endsAt: null },
    ]);

    const result = await getPlatformRevenueOverview();

    expect(result.monthlyTrend).toEqual([
      { month: "2026-06", currency: "GHS", amount: 250 },
      { month: "2026-07", currency: "GHS", amount: 200 },
    ]);
  });

  it("returns an empty result with no subscriptions, rather than throwing", async () => {
    mockDb.subscription.findMany.mockResolvedValue([]);

    const result = await getPlatformRevenueOverview();

    expect(result.revenueByCurrency).toEqual({});
    expect(result.monthlyTrend).toEqual([]);
  });
});

describe("getPlatformOwnBusinessOverview", () => {
  it("reads Rock Frost's own anchor organization through the same getAnalyticsOverview/listEmployees every tenant uses, not a Prisma model directly", async () => {
    mockDb.organization.findUnique.mockResolvedValue({
      name: "Rock Frost Business Suite",
      currency: "GHS",
      organizationModules: [{ module: { code: "hr" } }, { module: { code: "accounting" } }],
    });
    mockGetAnalyticsOverview.mockResolvedValue(overview({ cashBalance: 500, netIncome: 100 }));
    mockListEmployees.mockResolvedValue([{ id: "emp-1", fullName: "Ama Owusu", jobTitle: "Operations Lead", status: "ACTIVE" }]);

    const result = await getPlatformOwnBusinessOverview();

    expect(result.organizationName).toBe("Rock Frost Business Suite");
    expect(result.employeeCount).toBe(1);
    expect(result.employees[0].fullName).toBe("Ama Owusu");
    expect(result.overview?.cashBalance).toBe(500);
    expect(mockListEmployees).toHaveBeenCalledWith("anchor-org");
  });

  it("skips listEmployees entirely when HR isn't enabled for the anchor organization yet", async () => {
    mockDb.organization.findUnique.mockResolvedValue({
      name: "Rock Frost Business Suite",
      currency: "GHS",
      organizationModules: [{ module: { code: "accounting" } }],
    });
    mockGetAnalyticsOverview.mockResolvedValue(overview());

    const result = await getPlatformOwnBusinessOverview();

    expect(result.employeeCount).toBe(0);
    expect(mockListEmployees).not.toHaveBeenCalled();
  });

  it("returns a null organization rather than throwing when there isn't exactly one platform anchor", async () => {
    mockGetPlatformAnchorOrganizationIds.mockResolvedValueOnce([]);

    const result = await getPlatformOwnBusinessOverview();

    expect(result.organizationId).toBeNull();
    expect(result.employees).toEqual([]);
  });
});

describe("Platform dashboard business activity section", () => {
  it("is gated on requirePlatformOperator, same as the rest of platform scope, and documents the modules it doesn't cover", () => {
    const source = readFileSync("src/app/app/platform/dashboard/page.tsx", "utf8");
    expect(source).toContain("await requirePlatformOperator()");
    expect(source).toContain("getPlatformBusinessInsights");
    expect(source).toContain("aren&apos;t summarized by Analytics yet");
  });

  it("surfaces real platform revenue from the subscription ledger and Rock Frost's own business, distinct from tenant aggregation", () => {
    const source = readFileSync("src/app/app/platform/dashboard/page.tsx", "utf8");
    expect(source).toContain("getPlatformRevenueOverview");
    expect(source).toContain("getPlatformOwnBusinessOverview");
    expect(source).toContain("Platform revenue");
    expect(source).toContain("Rock Frost&apos;s own business");
  });
});
