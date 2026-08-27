import { Lock } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { formatMoney } from "@/lib/currency";
import { getPayrollSummary } from "@/modules/payroll/service";
import { ReportExportLinks } from "@/components/reports/report-export-links";

export default async function PayrollReportsPage() {
  const tenant = await requireModuleAccess("payroll");

  if (!hasPermission(tenant, PERMISSIONS.PAYROLL_REPORTS_VIEW)) {
    return (
      <div className="space-y-6">
        <PageHeader title="Reports" description="Payroll cost and coverage summaries." />
        <EmptyState icon={Lock} title="You don't have access to this page" description="Payroll reports are limited to roles with reporting permissions." />
      </div>
    );
  }

  const summary = await getPayrollSummary(tenant.organizationId);

  const stats = [
    { label: "Employees on payroll", value: summary.employeesWithCompensationCount },
    { label: "Missing compensation", value: summary.employeesWithoutCompensationCount },
    { label: "Draft runs", value: summary.draftRunCount },
    { label: "Completed runs", value: summary.completedRunCount },
    { label: "Last run gross pay", value: formatMoney(summary.lastRunTotalGross, tenant.organization.currency) },
    { label: "Last run net pay", value: formatMoney(summary.lastRunTotalNet, tenant.organization.currency) },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Reports" description="Payroll cost and coverage summaries." actions={<ReportExportLinks moduleKey="payroll" />} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardHeader>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
              <CardTitle className="text-2xl">{stat.value}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>
    </div>
  );
}
