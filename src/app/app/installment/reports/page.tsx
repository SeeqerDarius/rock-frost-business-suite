import { Lock, TrendingUp } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getInstallmentSummary, getStaffPerformanceReport } from "@/modules/installment/service";
import { ReportExportLinks } from "@/components/reports/report-export-links";

export default async function InstallmentReportsPage() {
  const tenant = await requireModuleAccess("installment");

  if (!hasPermission(tenant, PERMISSIONS.HIREPURCHASE_REPORTS_VIEW)) {
    return (
      <div className="space-y-6">
        <PageHeader title="Reports" description="Financial and staff performance summaries." />
        <EmptyState icon={Lock} title="You don't have access to this page" description="Installment reports are limited to roles with reporting permissions." />
      </div>
    );
  }

  // Summary performs the single organization-wide lifecycle refresh. Await it
  // before the pure performance read so two concurrent page-level sweeps do
  // not race each other.
  const summary = await getInstallmentSummary(tenant.organizationId);
  const staffPerformance = await getStaffPerformanceReport(tenant.organizationId);

  const stats = [
    { label: "Expected receivables", value: summary.expectedReceivables },
    { label: "Total collected", value: summary.totalCollected },
    { label: "Net profit so far", value: summary.netProfitSoFar },
    { label: "Projected net profit", value: summary.projectedNetProfit },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Reports" description="Financial and staff performance summaries." actions={<ReportExportLinks moduleKey="installment" />} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardHeader>
              <CardDescription>{stat.label}</CardDescription>
              <CardTitle className="text-2xl">{stat.value.toFixed(2)}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Payroll</CardTitle>
          <CardDescription>Salary paid last month vs. what was due, evaluated a month in arrears.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <div>
            <p className="text-xs text-muted-foreground">Salary paid (last month)</p>
            <p className="text-lg font-medium">{summary.totalSalaryPaid.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Due (last month)</p>
            <p className="text-lg font-medium">{summary.dueMonthPayroll.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Outstanding</p>
            <p className="text-lg font-medium">{summary.outstandingSalaries.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Next payroll due</p>
            <p className="text-lg font-medium">
              {summary.nextPayrollDate.toLocaleDateString()} ({summary.daysUntilPayroll} day{summary.daysUntilPayroll === 1 ? "" : "s"})
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Customer credits</CardTitle>
          <CardDescription>Open overpayments and closure refunds owed.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div>
            <p className="text-xs text-muted-foreground">Open credits</p>
            <p className="text-lg font-medium">{summary.openCreditsCount} ({summary.openCreditsTotal.toFixed(2)})</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Pending closure refunds</p>
            <p className="text-lg font-medium">{summary.openClosureRefunds}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <TrendingUp className="size-5 text-muted-foreground" />
            <CardTitle>Staff performance (this week)</CardTitle>
          </div>
          <CardDescription>Collections, contract value, and salary position per staff member.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Staff</TableHead>
                <TableHead>Customers</TableHead>
                <TableHead>Weekly collection</TableHead>
                <TableHead>Outstanding balance</TableHead>
                <TableHead>Commission</TableHead>
                <TableHead>Net position</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {staffPerformance.map((row) => (
                <TableRow key={row.staffId}>
                  <TableCell className="font-medium">{row.staffName}</TableCell>
                  <TableCell className="text-muted-foreground">{row.customerCount}</TableCell>
                  <TableCell className="text-muted-foreground">{row.weeklyCollection.toFixed(2)}</TableCell>
                  <TableCell className="text-muted-foreground">{row.outstandingBalance.toFixed(2)}</TableCell>
                  <TableCell className="text-muted-foreground">{row.commissionEarned.toFixed(2)}</TableCell>
                  <TableCell className="text-muted-foreground">{row.netPosition.toFixed(2)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
