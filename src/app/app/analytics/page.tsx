import { Handshake, Lock, Truck, UsersRound, Wallet } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { OverviewMetricCard } from "@/components/dashboard/overview-metric-card";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getAnalyticsOverview } from "@/modules/analytics/service";

export default async function AnalyticsOverviewPage() {
  const tenant = await requireModuleAccess("analytics");

  if (!hasPermission(tenant, PERMISSIONS.ANALYTICS_VIEW)) {
    return (
      <div className="space-y-6">
        <PageHeader title="Analytics Overview" description="Cross-module business intelligence." />
        <EmptyState icon={Lock} title="You don't have access to this page" description="The analytics overview is limited to roles with overview permissions." />
      </div>
    );
  }

  const summary = await getAnalyticsOverview(tenant.organizationId, tenant.enabledModuleKeys);

  const stats = [
    { label: "Total revenue", value: summary.totalRevenue.toFixed(2), description: "Combined revenue across enabled modules", icon: <Wallet className="size-4" />, href: "/app/analytics/financial" },
    { label: "Pipeline value", value: summary.pipelineValue.toFixed(2), description: "Open CRM deal value in the pipeline", icon: <Handshake className="size-4" />, href: "/app/analytics/sales" },
    { label: "Vehicles / stock value", value: `${summary.vehicleCount} / ${summary.stockValue.toFixed(2)}`, description: "Fleet size and inventory value on hand", icon: <Truck className="size-4" />, href: "/app/analytics/operations" },
    { label: "Active employees", value: summary.activeEmployees, description: "Employees currently on record", icon: <UsersRound className="size-4" />, href: "/app/analytics/people" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Analytics Overview"
        description={`Cross-module business intelligence: ${summary.enabledModuleCount} module${summary.enabledModuleCount === 1 ? "" : "s"} contributing data.`}
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => <OverviewMetricCard key={stat.label} {...stat} />)}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Other key figures</CardTitle>
          <CardDescription>Rolled up from every enabled module.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <div>
            <p className="text-xs text-muted-foreground">Cash balance</p>
            <p className="text-lg font-medium">{summary.cashBalance.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Net income</p>
            <p className="text-lg font-medium">{summary.netIncome.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Open procurement orders</p>
            <p className="text-lg font-medium">{summary.openOrderValue.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Last payroll run (net)</p>
            <p className="text-lg font-medium">{summary.lastPayrollNet.toFixed(2)}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
