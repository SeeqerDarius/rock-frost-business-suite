import Link from "next/link";
import { Wallet, Handshake, Truck, UsersRound } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { requireCurrentTenant } from "@/lib/tenant";
import { getAnalyticsOverview } from "@/modules/analytics/service";

export default async function AnalyticsOverviewPage() {
  const tenant = await requireCurrentTenant();
  const summary = await getAnalyticsOverview(tenant.organizationId, tenant.enabledModuleKeys);

  const stats = [
    { label: "Total revenue", value: summary.totalRevenue.toFixed(2), icon: Wallet, href: "/app/analytics/financial" },
    { label: "Pipeline value", value: summary.pipelineValue.toFixed(2), icon: Handshake, href: "/app/analytics/sales" },
    { label: "Vehicles / stock value", value: `${summary.vehicleCount} / ${summary.stockValue.toFixed(2)}`, icon: Truck, href: "/app/analytics/operations" },
    { label: "Active employees", value: summary.activeEmployees, icon: UsersRound, href: "/app/analytics/people" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Analytics Overview"
        description={`Cross-module business intelligence — ${summary.enabledModuleCount} module${summary.enabledModuleCount === 1 ? "" : "s"} contributing data.`}
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardDescription>{stat.label}</CardDescription>
                <stat.icon className="size-4 text-muted-foreground" />
              </div>
              <CardTitle className="text-3xl">{stat.value}</CardTitle>
            </CardHeader>
            <CardContent>
              <Button size="sm" variant="outline" nativeButton={false} render={<Link href={stat.href as never} />}>
                View
              </Button>
            </CardContent>
          </Card>
        ))}
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
