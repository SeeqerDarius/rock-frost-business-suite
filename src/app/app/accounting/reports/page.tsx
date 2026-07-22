import { Lock } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getAccountingSummary } from "@/modules/accounting/service";

export default async function AccountingReportsPage() {
  const tenant = await requireModuleAccess("accounting");

  if (!hasPermission(tenant, PERMISSIONS.ACCOUNTING_REPORTS_VIEW)) {
    return (
      <div className="space-y-6">
        <PageHeader title="Reports" description="Profit & loss, cash position, and receivables/payables summary." />
        <EmptyState icon={Lock} title="You don't have access to this page" description="Accounting reports are limited to roles with reporting permissions." />
      </div>
    );
  }

  const summary = await getAccountingSummary(tenant.organizationId);

  const plStats = [
    { label: "Total revenue", value: summary.totalRevenue.toFixed(2) },
    { label: "Total expenses", value: summary.totalExpenses.toFixed(2) },
    { label: "Net income", value: summary.netIncome.toFixed(2) },
  ];

  const balanceStats = [
    { label: "Cash balance", value: summary.cashBalance.toFixed(2) },
    { label: "Accounts receivable", value: summary.accountsReceivableBalance.toFixed(2) },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Reports" description="Profit & loss, cash position, and receivables/payables summary." />

      <Card>
        <CardHeader>
          <CardTitle>Profit &amp; loss</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          {plStats.map((stat) => (
            <div key={stat.label}>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
              <p className="text-lg font-medium">{stat.value}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Balance summary</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          {balanceStats.map((stat) => (
            <div key={stat.label}>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
              <p className="text-lg font-medium">{stat.value}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Receivables &amp; payables</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div>
            <p className="text-xs text-muted-foreground">Outstanding invoices</p>
            <p className="text-lg font-medium">
              {summary.outstandingInvoiceCount} ({summary.outstandingInvoiceTotal.toFixed(2)})
            </p>
            {summary.overdueInvoiceCount > 0 ? (
              <p className="text-xs text-destructive">{summary.overdueInvoiceCount} overdue</p>
            ) : null}
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Pending expenses</p>
            <p className="text-lg font-medium">
              {summary.pendingExpenseCount} ({summary.pendingExpenseTotal.toFixed(2)})
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
