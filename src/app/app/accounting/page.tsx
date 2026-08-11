import { Wallet, FileText, Receipt, TrendingUp } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { OverviewMetricCard } from "@/components/dashboard/overview-metric-card";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { getAccountingSummary } from "@/modules/accounting/service";

export default async function AccountingOverviewPage() {
  const tenant = await requireModuleAccess("accounting");
  const summary = await getAccountingSummary(tenant.organizationId);

  const stats = [
    { label: "Cash balance", value: summary.cashBalance.toFixed(2), description: "Combined balance across cash accounts", icon: <Wallet className="size-4" />, href: "/app/accounting/accounts" },
    { label: "Outstanding invoices", value: summary.outstandingInvoiceCount, description: "Invoices awaiting customer payment", icon: <FileText className="size-4" />, href: "/app/accounting/invoices" },
    { label: "Pending expenses", value: summary.pendingExpenseCount, description: "Expenses awaiting approval or payment", icon: <Receipt className="size-4" />, href: "/app/accounting/expenses" },
    { label: "Net income", value: summary.netIncome.toFixed(2), description: "Revenue less expenses for the period", icon: <TrendingUp className="size-4" />, href: "/app/accounting/reports" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Accounting Overview" description="Cash position, receivables, payables, and profitability at a glance." />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => <OverviewMetricCard key={stat.label} {...stat} />)}
      </div>
    </div>
  );
}
