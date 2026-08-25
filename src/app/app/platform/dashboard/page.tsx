import { Activity, Building2, Users, Blocks, TrendingUp, Wallet, Banknote, Contact, Boxes, ShoppingCart, UsersRound, Truck, DollarSign, Landmark } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { OverviewMetricCard } from "@/components/dashboard/overview-metric-card";
import { db } from "@/lib/db";
import { requirePlatformOperator } from "@/lib/auth/module-access";
import { getPlatformAnchorOrganizationIds } from "@/lib/platform-organizations";
import { catalogueModuleKeys, getModule } from "@/platform/modules/registry";
import { primaryProductKey } from "@/platform/modules/product-groups";
import { getPlatformBusinessInsights, getPlatformRevenueOverview, getPlatformOwnBusinessOverview } from "@/platform/business-insights/service";
import { CollapsibleSection } from "./collapsible-section";

const STATUS_LABEL: Record<string, string> = { ACTIVE: "Active", TRIAL: "Trial", SUSPENDED: "Suspended", CANCELLED: "Cancelled" };
const STATUS_BADGE: Record<string, "default" | "outline" | "destructive" | "secondary"> = { ACTIVE: "default", TRIAL: "secondary", SUSPENDED: "destructive", CANCELLED: "outline" };
const MONEY_FIELDS: { key: keyof Awaited<ReturnType<typeof getPlatformBusinessInsights>>["moneyByCurrency"][string]; label: string; icon: React.ReactNode }[] = [
  { key: "totalRevenue", label: "Total revenue", icon: <TrendingUp className="size-4" /> },
  { key: "cashBalance", label: "Cash balance", icon: <Wallet className="size-4" /> },
  { key: "netIncome", label: "Net income", icon: <Banknote className="size-4" /> },
  { key: "pipelineValue", label: "CRM pipeline", icon: <Contact className="size-4" /> },
  { key: "stockValue", label: "Stock value", icon: <Boxes className="size-4" /> },
  { key: "openOrderValue", label: "Open orders", icon: <ShoppingCart className="size-4" /> },
  { key: "lastPayrollNet", label: "Last payroll net", icon: <Banknote className="size-4" /> },
];

function formatMoney(value: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, currencyDisplay: "narrowSymbol" }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

export default async function PlatformDashboardPage() {
  await requirePlatformOperator();
  const platformAnchorIds = await getPlatformAnchorOrganizationIds();

  const [organizationCount, activeMemberCount, internalModuleAdoption, businessInsights, revenueOverview, ownBusiness] = await Promise.all([
    db.organization.count({ where: { id: { notIn: platformAnchorIds } } }),
    db.organizationMember.count({ where: { status: "ACTIVE", organizationId: { notIn: platformAnchorIds } } }),
    db.module.findMany({
      where: { status: "ACTIVE" },
      select: { code: true, name: true, organizationModules: { where: { enabled: true, organizationId: { notIn: platformAnchorIds } }, select: { organizationId: true } } },
      orderBy: { name: "asc" },
    }),
    getPlatformBusinessInsights(),
    getPlatformRevenueOverview(),
    getPlatformOwnBusinessOverview(),
  ]);

  const moduleAdoption = catalogueModuleKeys.map((productKey) => {
    const organizationIds = new Set(
      internalModuleAdoption
        .filter((module) => primaryProductKey(module.code) === productKey)
        .flatMap((module) => module.organizationModules.map((assignment) => assignment.organizationId)),
    );
    return { key: productKey, name: getModule(productKey)?.name ?? productKey, organizationIds };
  });
  const enabledModuleCount = moduleAdoption.reduce((total, module) => total + module.organizationIds.size, 0);

  // Only modules at least one organization has actually enabled — a module
  // nobody uses yet has no adoption to report.
  const adoptedModules = moduleAdoption.filter((mod) => mod.organizationIds.size > 0);

  const stats = [
    { label: "Organizations", value: organizationCount, description: "Tenant organizations on the platform", icon: <Building2 className="size-4" />, href: "/app/platform/organizations" },
    { label: "Active members", value: activeMemberCount, description: "Members across every organization", icon: <Users className="size-4" /> },
    { label: "Module activations", value: enabledModuleCount, description: "Modules enabled across all organizations", icon: <Blocks className="size-4" />, href: "/app/platform/modules" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Platform overview" description="Organizations, subscriptions, and module activation across the whole platform." />

      <div className="grid gap-4 sm:grid-cols-3">
        {stats.map((stat) => <OverviewMetricCard key={stat.label} {...stat} />)}
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <DollarSign className="size-5 text-muted-foreground" />
            <CardTitle>Platform revenue</CardTitle>
          </div>
          <CardDescription>What organizations actually pay Rock Frost, from the subscription ledger - not any tenant&apos;s own business revenue.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {Object.keys(revenueOverview.revenueByCurrency).length === 0 ? (
            <p className="text-sm text-muted-foreground">No subscriptions recorded yet.</p>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                {Object.entries(revenueOverview.revenueByCurrency).map(([currency, totals]) => (
                  <div key={currency} className="space-y-2 rounded-lg border p-3">
                    <p className="text-sm font-semibold">{currency}</p>
                    <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
                      <div className="flex items-center justify-between gap-2"><dt className="text-muted-foreground">MRR</dt><dd className="font-medium tabular-nums">{formatMoney(totals.mrr, currency)}</dd></div>
                      <div className="flex items-center justify-between gap-2"><dt className="text-muted-foreground">Active subscriptions</dt><dd className="font-medium tabular-nums">{totals.activeSubscriptionCount}</dd></div>
                      <div className="flex items-center justify-between gap-2"><dt className="text-muted-foreground">Collected to date</dt><dd className="font-medium tabular-nums">{formatMoney(totals.totalCollected, currency)}</dd></div>
                      <div className="flex items-center justify-between gap-2"><dt className="text-muted-foreground">Pending payment</dt><dd className="font-medium tabular-nums">{formatMoney(totals.pendingAmount, currency)}</dd></div>
                    </dl>
                  </div>
                ))}
              </div>
              {revenueOverview.monthlyTrend.length > 0 ? (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Collected by month</p>
                  {(() => {
                    const maxAmount = Math.max(...revenueOverview.monthlyTrend.map((row) => row.amount));
                    return revenueOverview.monthlyTrend.map((row) => (
                      <div key={`${row.month}-${row.currency}`} className="flex items-center gap-3 text-sm">
                        <span className="w-20 shrink-0 text-muted-foreground tabular-nums">{row.month}</span>
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full bg-primary" style={{ width: `${maxAmount > 0 ? (row.amount / maxAmount) * 100 : 0}%` }} />
                        </div>
                        <span className="w-28 shrink-0 text-right font-medium tabular-nums">{formatMoney(row.amount, row.currency)}</span>
                      </div>
                    ));
                  })()}
                </div>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Landmark className="size-5 text-muted-foreground" />
            <CardTitle>Rock Frost&apos;s own business</CardTitle>
          </div>
          <CardDescription>Employees and books for the organization running the platform itself, tracked the same way any tenant&apos;s are.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!ownBusiness.organizationId ? (
            <p className="text-sm text-muted-foreground">No platform anchor organization found.</p>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="flex items-center gap-3 rounded-lg border p-3">
                  <UsersRound className="size-5 text-muted-foreground" />
                  <div>
                    <p className="text-2xl font-semibold tabular-nums">{ownBusiness.employeeCount}</p>
                    <p className="text-xs text-muted-foreground">Employees</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 rounded-lg border p-3">
                  <Wallet className="size-5 text-muted-foreground" />
                  <div>
                    <p className="text-2xl font-semibold tabular-nums">{formatMoney(ownBusiness.overview?.cashBalance ?? 0, ownBusiness.currency ?? "USD")}</p>
                    <p className="text-xs text-muted-foreground">Cash balance</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 rounded-lg border p-3">
                  <Banknote className="size-5 text-muted-foreground" />
                  <div>
                    <p className="text-2xl font-semibold tabular-nums">{formatMoney(ownBusiness.overview?.netIncome ?? 0, ownBusiness.currency ?? "USD")}</p>
                    <p className="text-xs text-muted-foreground">Net income</p>
                  </div>
                </div>
              </div>
              {ownBusiness.employees.length === 0 ? (
                <p className="text-sm text-muted-foreground">No employees on file yet. Add them from HR after switching into {ownBusiness.organizationName}&apos;s own workspace.</p>
              ) : (
                <ul className="space-y-1.5">
                  {ownBusiness.employees.map((employee) => (
                    <li key={employee.id} className="flex items-center justify-between rounded-md border px-3 py-1.5 text-sm">
                      <span>{employee.fullName}{employee.jobTitle ? <span className="ml-2 text-xs text-muted-foreground">{employee.jobTitle}</span> : null}</span>
                      <Badge variant="outline">{employee.status}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="size-5 text-muted-foreground" />
              <CardTitle>Business activity</CardTitle>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(businessInsights.organizationsByStatus).map(([status, count]) => (
                <Badge key={status} variant={STATUS_BADGE[status] ?? "outline"}>{count} {STATUS_LABEL[status] ?? status}</Badge>
              ))}
            </div>
          </div>
          <CardDescription>
            Aggregated across every Active and Trial organization&apos;s Fleet, Installment, CRM, Inventory, Accounting, HR, Procurement, and Payroll data.
            Point of Sale, Projects, Hotel, School, Hostel, Pharmacy, and Hospital aren&apos;t summarized by Analytics yet, so they aren&apos;t reflected here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CollapsibleSection label="cross-tenant figures">
            {businessInsights.organizationsIncluded === 0 ? (
              <p className="text-sm text-muted-foreground">No active or trial organization has any data to summarize yet.</p>
            ) : (
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  {Object.entries(businessInsights.moneyByCurrency).map(([currency, totals]) => (
                    <div key={currency} className="space-y-2 rounded-lg border p-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold">{currency}</p>
                        <p className="text-xs text-muted-foreground">{totals.organizationCount} organization{totals.organizationCount === 1 ? "" : "s"}</p>
                      </div>
                      <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
                        {MONEY_FIELDS.map(({ key, label }) => (
                          <div key={key} className="flex items-center justify-between gap-2">
                            <dt className="text-muted-foreground">{label}</dt>
                            <dd className="font-medium tabular-nums">{formatMoney(totals[key], currency)}</dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  ))}
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="flex items-center gap-3 rounded-lg border p-3">
                    <UsersRound className="size-5 text-muted-foreground" />
                    <div>
                      <p className="text-2xl font-semibold tabular-nums">{businessInsights.activeEmployees}</p>
                      <p className="text-xs text-muted-foreground">Active employees across HR</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 rounded-lg border p-3">
                    <Truck className="size-5 text-muted-foreground" />
                    <div>
                      <p className="text-2xl font-semibold tabular-nums">{businessInsights.vehicleCount}</p>
                      <p className="text-xs text-muted-foreground">Vehicles across Fleet</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </CollapsibleSection>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Activity className="size-5 text-muted-foreground" />
            <CardTitle>Module adoption</CardTitle>
          </div>
          <CardDescription>How many organizations have each module enabled.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {adoptedModules.length === 0 ? (
            <p className="text-sm text-muted-foreground">No organization has enabled any module yet.</p>
          ) : (
            adoptedModules.map((mod) => (
              <div key={mod.key} className="flex items-center justify-between rounded-lg border p-3">
                <p className="text-sm font-medium">{mod.name}</p>
                <p className="text-sm text-muted-foreground">
                  {mod.organizationIds.size} organization{mod.organizationIds.size === 1 ? "" : "s"}
                </p>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
