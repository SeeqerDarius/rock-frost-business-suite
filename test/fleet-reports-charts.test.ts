import { readFileSync } from "node:fs";
import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * User request: "reports in every module should have at least, trends graph
 * and pictorial charts. investor dashboard to also have trend graphs and
 * charts if necessary." Scoped to the Fleet module - Reports gets a
 * vehicles-by-status donut and a revenue trend chart; the Investor dashboard
 * gets a collections trend chart scoped to whichever owner portfolio is
 * visible, reusing the existing dashboard chart components and
 * trend-bucketing infrastructure (no schema change).
 */
describe("Fleet Reports and Investor dashboard charts", () => {
  const reportsPage = readFileSync("src/app/app/fleet/reports/page.tsx", "utf8");
  const investorPage = readFileSync("src/app/app/fleet/investor/page.tsx", "utf8");
  const fleetService = readFileSync("src/modules/fleet/service.ts", "utf8");
  const charts = readFileSync("src/components/dashboard/charts.tsx", "utf8");

  it("gives the Reports page a vehicles-by-status donut and a revenue trend chart", () => {
    expect(reportsPage).toContain("BreakdownDonutChart");
    expect(reportsPage).toContain('valueFormat="count"');
    expect(reportsPage).toContain("PeriodicTrendChart");
    expect(reportsPage).toContain("getFleetPaymentTrends");
  });

  it("gives the Investor dashboard a collections trend chart scoped like the existing summary", () => {
    expect(investorPage).toContain("PeriodicTrendChart");
    expect(investorPage).toContain("getFleetInvestorTrends");
  });

  it("exposes count-formatted donut charts without running counts through formatMoney", () => {
    // Regression guard: BreakdownDonutChart used to always format its
    // tooltip via formatMoney, which would show "GHS 3" for a count of 3
    // vehicles rather than a plain number.
    expect(charts).toContain('valueFormat?: "money" | "count"');
    expect(charts).toContain('valueFormat === "count"');
  });

  it("never passes a function prop from these Server Component pages into the client chart components", () => {
    expect(reportsPage).not.toContain("valueFormatter");
    expect(investorPage).not.toContain("valueFormatter");
  });

  it("buckets trend data server-side with the shared trend-buckets helper, not a schema change", () => {
    expect(fleetService).toContain("export async function getFleetPaymentTrends(");
    expect(fleetService).toContain("export async function getFleetInvestorTrends(");
    expect(fleetService).toContain('import { buildTrendBuckets, widestTrendLookback, type TrendGranularity } from "@/lib/trend-buckets"');
  });
});

const mockDb = {
  fleetPayment: { findMany: vi.fn() },
  fleetOwner: { findMany: vi.fn() },
};
vi.mock("@/lib/db", () => ({ db: mockDb }));

const fleet = await import("@/modules/fleet/service");

describe("getFleetPaymentTrends / getFleetInvestorTrends (mocked db)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sums only VERIFIED payments within each bucket's date range", async () => {
    const now = new Date();
    mockDb.fleetPayment.findMany.mockResolvedValue([
      { amount: 100, date: now },
      { amount: 50, date: new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000) },
    ]);

    const result = await fleet.getFleetPaymentTrends("org-1");

    expect(mockDb.fleetPayment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ organizationId: "org-1", status: "VERIFIED" }) }),
    );
    expect(result.trends.days.at(-1)?.revenue).toBe(100);
    expect(result.trends.months.reduce((sum, bucket) => sum + bucket.revenue, 0)).toBeGreaterThanOrEqual(100);
  });

  it("scopes investor trends to only the linked owner's vehicles/contracts when a userId is given", async () => {
    mockDb.fleetOwner.findMany.mockResolvedValue([
      { id: "owner-1", vehicles: [{ id: "vehicle-1", workAndPayContracts: [] }] },
    ]);
    mockDb.fleetPayment.findMany.mockResolvedValue([
      { amount: 200, date: new Date(), relatedEntity: "FleetVehicle", relatedEntityId: "vehicle-1" },
      { amount: 999, date: new Date(), relatedEntity: "FleetVehicle", relatedEntityId: "someone-elses-vehicle" },
    ]);

    const result = await fleet.getFleetInvestorTrends("org-1", "user-owner");

    expect(mockDb.fleetOwner.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ organizationId: "org-1", userId: "user-owner" } ) }));
    const totalDays = result.trends.days.reduce((sum, bucket) => sum + bucket.revenue, 0);
    expect(totalDays).toBe(200);
  });
});
