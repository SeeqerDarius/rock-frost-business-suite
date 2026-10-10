import { Lock, ReceiptText, Wallet } from "lucide-react";
import { AttentionQueue, type AttentionQueueItem } from "@/components/dashboard/attention-queue";
import { OverviewMetricCard } from "@/components/dashboard/overview-metric-card";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
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

  const stats = [
    accounting ? { label: "Cash balance", value: money(accounting.cashBalance), description: "Current balance of the Accounting cash account.", icon: <Wallet className="size-4" />, href: "/app/accounting/dashboard" } : null,
    accounting ? { label: "Posted revenue", value: money(accounting.totalRevenue), description: "Revenue recorded in the Accounting ledger.", icon: <ReceiptText className="size-4" />, href: "/app/accounting/dashboard" } : null,
    accounting ? { label: "Net income", value: money(accounting.netIncome), description: "Posted revenue less recorded expenses.", icon: <Wallet className="size-4" />, href: "/app/accounting/dashboard" } : null,
    accounting ? { label: "Outstanding invoices", value: money(accounting.outstandingInvoiceTotal), description: `${accounting.outstandingInvoiceCount} sent or overdue invoice${accounting.outstandingInvoiceCount === 1 ? "" : "s"}.`, icon: <ReceiptText className="size-4" />, href: "/app/accounting/invoices" } : null,
    payroll ? { label: "Last payroll net pay", value: money(payroll.lastRunTotalNet), description: payroll.lastCompletedRunPayDate ? `Latest completed payroll run: ${payroll.lastCompletedRunPayDate.toLocaleDateString("en-GH", { dateStyle: "medium" })}.` : "No completed payroll run yet.", icon: <Wallet className="size-4" />, href: "/app/payroll" } : null,
    payroll ? { label: "Employees with compensation", value: payroll.employeesWithCompensationCount, description: `${payroll.employeesWithoutCompensationCount} employee${payroll.employeesWithoutCompensationCount === 1 ? "" : "s"} still need compensation details.`, icon: <ReceiptText className="size-4" />, href: "/app/payroll" } : null,
  ].filter((stat): stat is NonNullable<typeof stat> => stat !== null);

  const attentionCandidates: (AttentionQueueItem | null)[] = [
    accounting?.overdueInvoiceCount ? { id: "overdue-invoices", title: "Overdue invoices", value: accounting.overdueInvoiceCount, description: `${money(accounting.outstandingInvoiceTotal)} remains outstanding across sent and overdue invoices.`, href: "/app/accounting/invoices", severity: "urgent" } : null,
    accounting?.pendingExpenseCount ? { id: "pending-expenses", title: "Pending expenses", value: accounting.pendingExpenseCount, description: `${money(accounting.pendingExpenseTotal)} awaits approval or payment.`, href: "/app/accounting/expenses", severity: "review" } : null,
    payroll?.draftRunCount ? { id: "draft-runs", title: "Draft payroll runs", value: payroll.draftRunCount, description: "Complete or intentionally discard the run before the next payroll cycle.", href: "/app/payroll", severity: "review" } : null,
    payroll?.employeesWithoutCompensationCount ? { id: "missing-compensation", title: "Employees without compensation", value: payroll.employeesWithoutCompensationCount, description: "These employees cannot be included in a fully configured payroll run.", href: "/app/payroll", severity: "review" } : null,
  ];
  const attentionItems = attentionCandidates.filter((item): item is AttentionQueueItem => item !== null);

  return (
    <div className="space-y-6">
      <PageHeader title="Financial" description="Current ledger and payroll snapshot. Use Accounting Financial Dashboard for period comparisons, trends, and ratios." />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {stats.map((stat) => <OverviewMetricCard key={stat.label} {...stat} />)}
      </div>
      <AttentionQueue items={attentionItems} title="Financial controls" description="Follow up on exceptions in the source accounting or payroll workflow." emptyTitle="No tracked financial follow-ups" emptyDescription="There are no overdue invoices, pending expenses, draft runs, or compensation gaps in this snapshot." />
    </div>
  );
}
