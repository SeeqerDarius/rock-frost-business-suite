import { Activity, Building2, Users, Blocks, TrendingUp, Wallet, Banknote, Contact, Boxes, ShoppingCart, UsersRound, Truck } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { OverviewMetricCard } from "@/components/dashboard/overview-metric-card";
import { db } from "@/lib/db";
import { requirePlatformOperator } from "@/lib/auth/module-access";
import { getPlatformAnchorOrganizationIds } from "@/lib/platform-organizations";
import { catalogueModuleKeys, getModule } from "@/platform/modules/registry";
import { primaryProductKey } from "@/platform/modules/product-groups";
import { getPlatformBusinessInsights } from "@/platform/business-insights/service";

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

  const [organizationCount, activeMemberCount, internalModuleAdoption, businessInsights] = await Promise.all([
    db.organization.count({ where: { id: { notIn: platformAnchorIds } } }),
    db.organizationMember.count({ where: { status: "ACTIVE", organizationId: { notIn: platformAnchorIds } } }),
    db.module.findMany({
      where: { status: "ACTIVE" },
      select: { code: true, name: true, organizationModules: { where: { enabled: true, organizationId: { notIn: platformAnchorIds } }, select: { organizationId: true } } },
      orderBy: { name: "asc" },
    }),
    getPlatformBusinessInsights(),
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
        <CardContent className="space-y-4">
          {businessInsights.organizationsIncluded === 0 ? (
            <p className="text-sm text-muted-foreground">No active or trial organization has any data to summarize yet.</p>
          ) : (
            <>
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
            </>
          )}
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
