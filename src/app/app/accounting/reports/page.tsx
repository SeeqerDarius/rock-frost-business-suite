import { Lock } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getAccountingSummary, getStatementOfFinancialPosition } from "@/modules/accounting/service";

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

  const [summary, position] = await Promise.all([
    getAccountingSummary(tenant.organizationId),
    getStatementOfFinancialPosition(tenant.organizationId),
  ]);

  const plStats = [
    { label: "Total revenue", value: summary.totalRevenue.toFixed(2) },
    { label: "Total expenses", value: summary.totalExpenses.toFixed(2) },
    { label: "Net income", value: summary.netIncome.toFixed(2) },
  ];

  const balanceStats = [
    { label: "Cash balance", value: summary.cashBalance.toFixed(2) },
    { label: "Accounts receivable", value: summary.accountsReceivableBalance.toFixed(2) },
    { label: "Petty cash (active funds)", value: `${summary.pettyCashBalance.toFixed(2)} (${summary.pettyCashFundCount})` },
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
        <CardContent className="grid gap-3 sm:grid-cols-3">
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

      <Card>
        <CardHeader>
          <CardTitle>Statement of financial position</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-6 sm:grid-cols-3">
            <div>
              <p className="text-sm font-medium">Assets</p>
              <div className="mt-2 space-y-1.5">
                {position.assets.map((account) => (
                  <div key={account.id} className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>{account.name}</span>
                    <span className="font-mono text-xs">{account.balance.toFixed(2)}</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex items-center justify-between border-t pt-2 text-sm font-medium">
                <span>Total assets</span>
                <span>{position.totalAssets.toFixed(2)}</span>
              </div>
            </div>
            <div>
              <p className="text-sm font-medium">Liabilities</p>
              <div className="mt-2 space-y-1.5">
                {position.liabilities.length === 0 ? <p className="text-sm text-muted-foreground">None recorded.</p> : null}
                {position.liabilities.map((account) => (
                  <div key={account.id} className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>{account.name}</span>
                    <span className="font-mono text-xs">{account.balance.toFixed(2)}</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex items-center justify-between border-t pt-2 text-sm font-medium">
                <span>Total liabilities</span>
                <span>{position.totalLiabilities.toFixed(2)}</span>
              </div>
            </div>
            <div>
              <p className="text-sm font-medium">Equity</p>
              <div className="mt-2 space-y-1.5">
                {position.equity.map((account) => (
                  <div key={account.id} className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>{account.name}</span>
                    <span className="font-mono text-xs">{account.balance.toFixed(2)}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>Retained earnings (current period)</span>
                  <span className="font-mono text-xs">{position.netIncome.toFixed(2)}</span>
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between border-t pt-2 text-sm font-medium">
                <span>Total equity</span>
                <span>{position.totalEquity.toFixed(2)}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
            <span>Assets = Liabilities + Equity</span>
            <span className={position.isBalanced ? "font-medium text-emerald-600 dark:text-emerald-400" : "font-medium text-destructive"}>
              {position.isBalanced ? "Balanced" : `Off by ${position.difference.toFixed(2)}`}
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
