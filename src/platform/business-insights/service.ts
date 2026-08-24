import "server-only";

import { db } from "@/lib/db";
import { getPlatformAnchorOrganizationIds } from "@/lib/platform-organizations";
import { expandProductModuleKeys } from "@/platform/modules/product-groups";
import { getAnalyticsOverview } from "@/modules/analytics/service";
import { listEmployees } from "@/modules/hr/service";
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

/**
 * Rock Frost's own business, not any tenant's - the anchor organization
 * (getPlatformAnchorOrganizationIds()) is a real Organization row like any
 * tenant, so once it has HR/Accounting enabled, its own employees and books
 * are visible through the exact same getAnalyticsOverview()/listEmployees()
 * every tenant's own workspace uses. Deliberately not seeded with any
 * placeholder data - if the anchor organization hasn't enabled a module or
 * entered real records yet, this returns the same honest zero/empty state
 * any brand-new tenant would see, matching this codebase's standing rule
 * against fabricated data.
 */
export interface PlatformOwnBusinessOverview {
  organizationId: string | null;
  organizationName: string | null;
  currency: string | null;
  employeeCount: number;
  employees: { id: string; fullName: string; jobTitle: string | null; status: string }[];
  overview: Awaited<ReturnType<typeof getAnalyticsOverview>> | null;
}

export async function getPlatformOwnBusinessOverview(): Promise<PlatformOwnBusinessOverview> {
  const anchorIds = await getPlatformAnchorOrganizationIds();
  if (anchorIds.length !== 1) {
    return { organizationId: null, organizationName: null, currency: null, employeeCount: 0, employees: [], overview: null };
  }
  const organizationId = anchorIds[0];

  const organization = await db.organization.findUnique({
    where: { id: organizationId },
    select: {
      name: true,
      currency: true,
      organizationModules: { where: { enabled: true, module: { status: "ACTIVE" } }, select: { module: { select: { code: true } } } },
    },
  });
  if (!organization) {
    return { organizationId, organizationName: null, currency: null, employeeCount: 0, employees: [], overview: null };
  }

  const enabledModuleKeys = expandProductModuleKeys(organization.organizationModules.map((assignment) => assignment.module.code));
  const [overview, employees] = await Promise.all([
    getAnalyticsOverview(organizationId, enabledModuleKeys),
    enabledModuleKeys.includes("hr") ? listEmployees(organizationId) : Promise.resolve([]),
  ]);

  return {
    organizationId,
    organizationName: organization.name,
    currency: organization.currency,
    employeeCount: employees.length,
    employees: employees.map((employee) => ({ id: employee.id, fullName: employee.fullName, jobTitle: employee.jobTitle, status: employee.status })),
    overview,
  };
}

/**
 * Real platform revenue, sourced from the Subscription ledger - what
 * tenants actually pay Rock Frost, not any tenant's own internal business
 * revenue (that's getPlatformBusinessInsights() above, a different thing
 * entirely). Grouped by currency for the same reason as the tenant
 * aggregation: Subscription.currency isn't guaranteed uniform.
 *
 * "MRR" here is a plain amount/durationMonths normalization per ACTIVE,
 * currently-in-window subscription (matching the same currently-active
 * definition src/platform/trials/service.ts's expireTrials() query uses:
 * startsAt in the past, endsAt null or in the future) - a real monthly
 * run-rate estimate, not a marketing number. "Collected" sums every
 * subscription that has actually been paid (paidAt set), regardless of
 * its current status, since a since-cancelled subscription's past payment
 * was still real revenue at the time. "Pending" is quoted-but-unpaid
 * amounts sitting in PENDING_PAYMENT, kept separate so it's never
 * mistaken for revenue already in hand.
 */
export interface PlatformRevenueTotals {
  mrr: number;
  activeSubscriptionCount: number;
  totalCollected: number;
  pendingAmount: number;
}

export interface PlatformRevenueMonth {
  month: string;
  currency: string;
  amount: number;
}

export interface PlatformRevenueOverview {
  revenueByCurrency: Record<string, PlatformRevenueTotals>;
  monthlyTrend: PlatformRevenueMonth[];
}

const EMPTY_REVENUE_TOTALS: PlatformRevenueTotals = { mrr: 0, activeSubscriptionCount: 0, totalCollected: 0, pendingAmount: 0 };

export async function getPlatformRevenueOverview(): Promise<PlatformRevenueOverview> {
  const now = new Date();
  const subscriptions = await db.subscription.findMany({
    select: { status: true, amount: true, currency: true, durationMonths: true, paidAt: true, startsAt: true, endsAt: true },
  });

  const revenueByCurrency: Record<string, PlatformRevenueTotals> = {};
  const monthlyByKey = new Map<string, PlatformRevenueMonth>();

  for (const subscription of subscriptions) {
    const totals = revenueByCurrency[subscription.currency] ?? { ...EMPTY_REVENUE_TOTALS };
    const amount = Number(subscription.amount);
    const isCurrentlyActive = subscription.status === "ACTIVE" &&
      (!subscription.startsAt || subscription.startsAt <= now) &&
      (!subscription.endsAt || subscription.endsAt > now);
    if (isCurrentlyActive) {
      totals.mrr += subscription.durationMonths > 0 ? amount / subscription.durationMonths : amount;
      totals.activeSubscriptionCount += 1;
    }
    if (subscription.paidAt) {
      totals.totalCollected += amount;
      const month = subscription.paidAt.toISOString().slice(0, 7);
      const key = `${month}:${subscription.currency}`;
      const entry = monthlyByKey.get(key) ?? { month, currency: subscription.currency, amount: 0 };
      entry.amount += amount;
      monthlyByKey.set(key, entry);
    }
    if (subscription.status === "PENDING_PAYMENT") {
      totals.pendingAmount += amount;
    }
    revenueByCurrency[subscription.currency] = totals;
  }

  const monthlyTrend = [...monthlyByKey.values()].sort((a, b) => a.month.localeCompare(b.month) || a.currency.localeCompare(b.currency));

  return { revenueByCurrency, monthlyTrend };
}
