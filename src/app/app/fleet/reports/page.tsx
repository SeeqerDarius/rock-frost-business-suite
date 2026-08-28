import { BarChart3, Lock } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { PeriodicTrendChart, BreakdownDonutChart } from "@/components/dashboard/charts";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getFleetManagementReport, getFleetPaymentTrends } from "@/modules/fleet/service";
import { ReportExportLinks } from "@/components/reports/report-export-links";

const VEHICLE_STATUS_LABELS: Record<string, string> = {
  AVAILABLE: "Available",
  ASSIGNED: "Assigned",
  MAINTENANCE: "In maintenance",
  INACTIVE: "Inactive",
  RETIRED: "Retired",
};

export default async function FleetReportsPage() {
  const tenant = await requireModuleAccess("fleet");

  if (!hasPermission(tenant, PERMISSIONS.FLEET_REPORTS_VIEW)) {
    return (
      <div className="space-y-6">
        <PageHeader title="Reports" description="Fleet performance and financial summaries." />
        <EmptyState
          icon={Lock}
          title="You don't have access to this page"
          description="Fleet reports are limited to roles with reporting permissions."
        />
      </div>
    );
  }

  const [report, paymentTrends] = await Promise.all([
    getFleetManagementReport(tenant.organizationId),
    getFleetPaymentTrends(tenant.organizationId),
  ]);
  const summary = report.summary;
  const currency = tenant.organization.currency ?? "GHS";
  const vehiclesByStatusChartData = summary.vehiclesByStatus.map((row) => ({
    label: VEHICLE_STATUS_LABELS[row.status] ?? row.status,
    value: row._count,
  }));

  const stats = [
    { label: "Total vehicles", value: summary.vehicleCount },
    { label: "Active drivers", value: summary.activeDriverCount },
    { label: "Vehicle owners", value: summary.ownerCount },
    { label: "Vehicles under maintenance", value: summary.maintenanceVehicleCount },
    { label: "Pending maintenance", value: summary.pendingMaintenanceCount },
    { label: "Active work & pay contracts", value: summary.activeContractCount },
    { label: "Weekly remittances", value: `${currency} ${report.weeklyCollections.toFixed(2)}` },
    { label: "Pending payments", value: report.pendingPaymentCount },
    { label: "Documents due", value: report.expiringDocumentCount },
    { label: "Repairs awaiting verification", value: report.unverifiedRepairCount },
    { label: "Outstanding Work & Pay", value: `${currency} ${summary.outstandingBalance.toFixed(2)}` },
    { label: "Monthly verified revenue", value: `${currency} ${summary.monthlyRevenue.toFixed(2)}` },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Reports" description="Fleet performance and financial summaries." actions={<ReportExportLinks moduleKey="fleet" />} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardHeader>
              <CardDescription>{stat.label}</CardDescription>
              <CardTitle className="text-3xl">{stat.value}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <BarChart3 className="size-5 text-muted-foreground" />
              <CardTitle>Vehicles by status</CardTitle>
            </div>
            <CardDescription>Current fleet composition.</CardDescription>
          </CardHeader>
          <CardContent>
            <BreakdownDonutChart data={vehiclesByStatusChartData} valueFormat="count" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Revenue trend</CardTitle>
            <CardDescription>Verified fleet payments over time.</CardDescription>
          </CardHeader>
          <CardContent>
            <PeriodicTrendChart data={paymentTrends.trends} series={[{ key: "revenue", label: "Revenue" }]} currency={currency} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Owner and investor performance</CardTitle>
          <CardDescription>Portfolio remittances, outstanding agreements, maintenance cost and net cash position.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {report.investors.length === 0 ? <p className="text-sm text-muted-foreground">No owner portfolios yet.</p> : report.investors.map((row) => (
            <div key={row.owner.id} className="grid gap-2 rounded-lg border p-3 text-sm sm:grid-cols-6">
              <div><p className="text-muted-foreground">Owner</p><p className="font-medium">{row.owner.name}</p></div>
              <div><p className="text-muted-foreground">Vehicles</p><p className="font-medium">{row.vehicleCount}</p></div>
              <div><p className="text-muted-foreground">Collected</p><p className="font-medium">{currency} {row.amountCollected.toFixed(2)}</p></div>
              <div><p className="text-muted-foreground">Outstanding</p><p className="font-medium">{currency} {row.outstanding.toFixed(2)}</p></div>
              <div><p className="text-muted-foreground">Maintenance</p><p className="font-medium">{currency} {row.maintenanceCost.toFixed(2)}</p></div>
              <div><p className="text-muted-foreground">Net cash</p><p className="font-medium">{currency} {row.netCashPosition.toFixed(2)}</p></div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Payments this month</CardTitle>
          <CardDescription>Total recorded fleet payments so far this calendar month.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-semibold">{currency} {summary.paymentsThisMonthTotal.toFixed(2)}</p>
        </CardContent>
      </Card>
    </div>
  );
}
