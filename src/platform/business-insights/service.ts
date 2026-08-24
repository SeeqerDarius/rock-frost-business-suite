import "server-only";

import { db } from "@/lib/db";
import { getPlatformAnchorOrganizationIds } from "@/lib/platform-organizations";
import { expandProductModuleKeys } from "@/platform/modules/product-groups";
import { getAnalyticsOverview } from "@/modules/analytics/service";
import type { OrganizationStatus } from "@prisma/client";

/**
 * Platform-scope equivalent of the organization-scope Analytics module
 * (src/modules/analytics/service.ts): owns no database tables of its own,
 * calls that same module's own getAnalyticsOverview() per organization
 * (never a module's Prisma models directly), and combines the results
 * across every tenant. Covers whichever modules Analytics itself covers
 * today - fleet, installment, crm, inventory, accounting, hr, procurement,
 * payroll - not POS, Projects, Hotel, School, Hostel, Pharmacy, or
 * Hospital, which have their own summary functions but aren't wired into
 * Analytics yet. That's an existing gap in Analytics, not something this
 * file works around; extending it is separate, larger scope.
 *
 * Money fields are grouped by each organization's own currency rather than
 * summed together - organizations aren't all on the same currency
 * (src/app/app/platform/organizations/{new,[organizationId]}/page.tsx let
 * an operator set any 3-letter code), so a single blended "total revenue"
 * figure would silently mix currencies and misrepresent the business.
 * Only ACTIVE and TRIAL organizations are aggregated into the money/count
 * totals - a SUSPENDED or CANCELLED organization's stale data isn't
 * current business activity, though it's still counted in
 * organizationsByStatus for context.
 */

export interface PlatformMoneyTotals {
  totalRevenue: number;
  cashBalance: number;
  netIncome: number;
  pipelineValue: number;
  stockValue: number;
  openOrderValue: number;
  lastPayrollNet: number;
  organizationCount: number;
}

export interface PlatformBusinessInsights {
  organizationsByStatus: Partial<Record<OrganizationStatus, number>>;
  organizationsIncluded: number;
  moneyByCurrency: Record<string, PlatformMoneyTotals>;
  activeEmployees: number;
  vehicleCount: number;
}

const EMPTY_MONEY_TOTALS: PlatformMoneyTotals = {
  totalRevenue: 0,
  cashBalance: 0,
  netIncome: 0,
  pipelineValue: 0,
  stockValue: 0,
  openOrderValue: 0,
  lastPayrollNet: 0,
  organizationCount: 0,
};

export async function getPlatformBusinessInsights(): Promise<PlatformBusinessInsights> {
  const anchorIds = await getPlatformAnchorOrganizationIds();

  const [statusGroups, organizations] = await Promise.all([
    db.organization.groupBy({
      by: ["status"],
      where: { id: { notIn: anchorIds } },
      _count: { _all: true },
    }),
    db.organization.findMany({
      where: { id: { notIn: anchorIds }, status: { in: ["ACTIVE", "TRIAL"] } },
      select: {
        id: true,
        currency: true,
        organizationModules: {
          where: { enabled: true, module: { status: "ACTIVE" } },
          select: { module: { select: { code: true } } },
        },
      },
    }),
  ]);

  const organizationsByStatus: Partial<Record<OrganizationStatus, number>> = {};
  for (const group of statusGroups) organizationsByStatus[group.status] = group._count._all;

  const overviews = await Promise.all(organizations.map(async (organization) => {
    const enabledModuleKeys = expandProductModuleKeys(organization.organizationModules.map((assignment) => assignment.module.code));
    const overview = await getAnalyticsOverview(organization.id, enabledModuleKeys);
    return { currency: organization.currency, overview };
  }));

  const moneyByCurrency: Record<string, PlatformMoneyTotals> = {};
  let activeEmployees = 0;
  let vehicleCount = 0;

  for (const { currency, overview } of overviews) {
    const totals = moneyByCurrency[currency] ?? { ...EMPTY_MONEY_TOTALS };
    totals.totalRevenue += overview.totalRevenue;
    totals.cashBalance += overview.cashBalance;
    totals.netIncome += overview.netIncome;
    totals.pipelineValue += overview.pipelineValue;
    totals.stockValue += overview.stockValue;
    totals.openOrderValue += overview.openOrderValue;
    totals.lastPayrollNet += overview.lastPayrollNet;
    totals.organizationCount += 1;
    moneyByCurrency[currency] = totals;

    activeEmployees += overview.activeEmployees;
    vehicleCount += overview.vehicleCount;
  }

  return {
    organizationsByStatus,
    organizationsIncluded: organizations.length,
    moneyByCurrency,
    activeEmployees,
    vehicleCount,
  };
}
