import { Lock, Wallet } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { formatMoney } from "@/lib/currency";
import { getFinancialOverview } from "@/modules/analytics/service";

export default async function AnalyticsFinancialPage() {
  const tenant = await requireModuleAccess("analytics");

  if (!hasPermission(tenant, PERMISSIONS.ANALYTICS_FINANCIAL_VIEW)) {
    return (
      <div className="space-y-6">
        <PageHeader title="Financial" description="Accounting and payroll rolled up." />
        <EmptyState icon={Lock} title="You don't have access to this page" description="Financial analytics are limited to roles with financial-reporting permissions." />
      </div>
    );
  }

  const { accounting, payroll } = await getFinancialOverview(tenant.organizationId, tenant.enabledModuleKeys);
  const money = (value: Parameters<typeof formatMoney>[0]) => formatMoney(value, tenant.organization.currency);

  if (!accounting && !payroll) {
    return (
      <div className="space-y-6">
        <PageHeader title="Financial" description="Accounting and payroll rolled up." />
        <EmptyState icon={Wallet} title="No financial modules enabled" description="Enable Accounting and/or Payroll for this organization to see financial analytics here." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Financial" description="Accounting and payroll rolled up." />

      {accounting ? (
        <Card>
          <CardHeader>
            <CardTitle>Accounting</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3">
            <div>
              <p className="text-xs text-muted-foreground">Cash balance</p>
              <p className="text-lg font-medium">{money(accounting.cashBalance)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total revenue</p>
              <p className="text-lg font-medium">{money(accounting.totalRevenue)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total expenses</p>
              <p className="text-lg font-medium">{money(accounting.totalExpenses)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Net income</p>
              <p className="text-lg font-medium">{money(accounting.netIncome)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Outstanding invoices</p>
              <p className="text-lg font-medium">{accounting.outstandingInvoiceCount} ({money(accounting.outstandingInvoiceTotal)})</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Pending expenses</p>
              <p className="text-lg font-medium">{accounting.pendingExpenseCount} ({money(accounting.pendingExpenseTotal)})</p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {payroll ? (
        <Card>
          <CardHeader>
            <CardTitle>Payroll</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3">
            <div>
              <p className="text-xs text-muted-foreground">Employees on payroll</p>
              <p className="text-lg font-medium">{payroll.employeesWithCompensationCount}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Completed runs</p>
              <p className="text-lg font-medium">{payroll.completedRunCount}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Last run net pay</p>
              <p className="text-lg font-medium">{money(payroll.lastRunTotalNet)}</p>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
