import { BarChart3, Lock } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getFleetManagementReport } from "@/modules/fleet/service";
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

  const report = await getFleetManagementReport(tenant.organizationId);
  const summary = report.summary;

  const stats = [
    { label: "Total vehicles", value: summary.vehicleCount },
    { label: "Active drivers", value: summary.activeDriverCount },
    { label: "Pending maintenance", value: summary.pendingMaintenanceCount },
    { label: "Active work & pay contracts", value: summary.activeContractCount },
    { label: "Weekly collections", value: report.weeklyCollections.toFixed(2) },
    { label: "Pending payments", value: report.pendingPaymentCount },
    { label: "Documents due", value: report.expiringDocumentCount },
    { label: "Repairs awaiting verification", value: report.unverifiedRepairCount },
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

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <BarChart3 className="size-5 text-muted-foreground" />
            <CardTitle>Vehicles by status</CardTitle>
          </div>
          <CardDescription>Current fleet composition.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {summary.vehiclesByStatus.length === 0 ? (
            <p className="text-sm text-muted-foreground">No vehicles yet.</p>
          ) : (
            summary.vehiclesByStatus.map((row) => (
              <div key={row.status} className="flex items-center justify-between rounded-lg border p-3">
                <p className="text-sm font-medium">{VEHICLE_STATUS_LABELS[row.status] ?? row.status}</p>
                <p className="text-sm text-muted-foreground">{row._count}</p>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Owner and investor performance</CardTitle>
          <CardDescription>Portfolio collections, outstanding agreements, maintenance cost and net cash position.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {report.investors.length === 0 ? <p className="text-sm text-muted-foreground">No owner portfolios yet.</p> : report.investors.map((row) => (
            <div key={row.owner.id} className="grid gap-2 rounded-lg border p-3 text-sm sm:grid-cols-6">
              <div><p className="text-muted-foreground">Owner</p><p className="font-medium">{row.owner.name}</p></div>
              <div><p className="text-muted-foreground">Vehicles</p><p className="font-medium">{row.vehicleCount}</p></div>
              <div><p className="text-muted-foreground">Collected</p><p className="font-medium">{row.amountCollected.toFixed(2)}</p></div>
              <div><p className="text-muted-foreground">Outstanding</p><p className="font-medium">{row.outstanding.toFixed(2)}</p></div>
              <div><p className="text-muted-foreground">Maintenance</p><p className="font-medium">{row.maintenanceCost.toFixed(2)}</p></div>
              <div><p className="text-muted-foreground">Net cash</p><p className="font-medium">{row.netCashPosition.toFixed(2)}</p></div>
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
          <p className="text-3xl font-semibold">{summary.paymentsThisMonthTotal.toFixed(2)}</p>
        </CardContent>
      </Card>
    </div>
  );
}
