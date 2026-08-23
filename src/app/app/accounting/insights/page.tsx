import { AlertTriangle, ArrowDownRight, ArrowUpRight, Banknote, CircleDollarSign, Lock, ReceiptText, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/feedback/empty-state";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { ACCOUNTING_INSIGHT_PERIODS, getAccountingInsights, type AccountingInsightPeriod } from "@/modules/accounting/insights";
import { InsightsChart } from "./insights-chart";
import { InsightAssistant } from "./insight-assistant";

function money(amount: number) {
  return new Intl.NumberFormat("en-GH", { style: "currency", currency: "GHS" }).format(amount);
}

function Change({ value, favorableWhenPositive = true }: { value: number | null; favorableWhenPositive?: boolean }) {
  if (value === null) return <span className="text-xs text-muted-foreground">No comparable previous revenue</span>;
  const positive = value >= 0;
  const favorable = positive === favorableWhenPositive;
  return <span className={`flex items-center gap-1 text-xs ${favorable ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}>{positive ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}{Math.abs(value)}% from previous period</span>;
}

export default async function AccountingInsightsPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const tenant = await requireModuleAccess("accounting");
  if (!hasPermission(tenant, PERMISSIONS.ACCOUNTING_REPORTS_VIEW)) {
    return <EmptyState icon={Lock} title="You don't have access to Accounting Insights" description="This page requires Accounting reporting permission." />;
  }
  const requested = Number((await searchParams).days);
  const period: AccountingInsightPeriod = ACCOUNTING_INSIGHT_PERIODS.includes(requested as AccountingInsightPeriod) ? requested as AccountingInsightPeriod : 30;
  const [insights, user] = await Promise.all([
    getAccountingInsights(tenant.organizationId, period),
    db.user.findUnique({
      where: { id: tenant.userId },
      select: { name: true, email: true, image: true },
    }),
  ]);
  const canAsk = hasPermission(tenant, PERMISSIONS.AI_ASSISTANT_USE);
  const maximumSource = Math.max(1, ...insights.sources.map((source) => Math.abs(source.amount)));
  const cards = [
    { label: "Recorded revenue", value: money(insights.revenue), icon: CircleDollarSign, detail: <Change value={insights.revenueChangePercent} /> },
    { label: "Recorded expenses", value: money(insights.expenses), icon: ReceiptText, detail: <Change value={insights.expenseChangePercent} favorableWhenPositive={false} /> },
    { label: "Net income", value: money(insights.netIncome), icon: Sparkles, detail: <span className="text-xs text-muted-foreground">Revenue less expenses</span> },
    { label: "Cash and bank", value: money(insights.cashBalance), icon: Banknote, detail: <span className="text-xs text-muted-foreground">Current recorded ledger balance</span> },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader title="Accounting Insights" description="Understand revenue, expenses, cash and collection risks from recorded transactions." />
        <form className="flex items-center gap-2"><label htmlFor="days" className="text-sm text-muted-foreground">Period</label><select id="days" name="days" defaultValue={period} className="h-9 rounded-md border bg-background px-3 text-sm"><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="365">Last 12 months</option></select><button className="h-9 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground">Apply</button></form>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(({ label, value, icon: Icon, detail }) => <Card key={label}><CardContent className="space-y-3 pt-5"><div className="flex items-center justify-between"><p className="text-sm text-muted-foreground">{label}</p><Icon className="size-4 text-muted-foreground" /></div><p className="text-2xl font-semibold tracking-tight">{value}</p>{detail}</CardContent></Card>)}
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(340px,0.75fr)]">
        <div className="space-y-6">
          <Card><CardHeader><CardTitle>Revenue and expense trend</CardTitle></CardHeader><CardContent><InsightsChart series={insights.series} /></CardContent></Card>
          <div className="grid gap-6 md:grid-cols-2">
            <Card><CardHeader><CardTitle>Revenue by source</CardTitle></CardHeader><CardContent className="space-y-4">{insights.sources.length === 0 ? <p className="text-sm text-muted-foreground">No revenue was recorded in this period.</p> : insights.sources.map((source) => <div key={source.sourceType} className="space-y-1.5"><div className="flex justify-between gap-3 text-sm"><span>{source.label}</span><span className="font-medium">{money(source.amount)}</span></div><div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(2, Math.abs(source.amount) / maximumSource * 100)}%` }} /></div></div>)}</CardContent></Card>
            <Card><CardHeader><CardTitle>Items requiring attention</CardTitle></CardHeader><CardContent className="space-y-4"><div className="flex gap-3"><AlertTriangle className="mt-0.5 size-4 text-amber-500" /><div><p className="text-sm font-medium">{insights.overdueInvoiceCount} overdue invoices</p><p className="text-xs text-muted-foreground">{money(insights.overdueInvoiceTotal)} requires collection follow-up.</p></div></div><div className="flex gap-3"><ReceiptText className="mt-0.5 size-4 text-muted-foreground" /><div><p className="text-sm font-medium">{insights.pendingExpenseCount} pending expenses</p><p className="text-xs text-muted-foreground">{money(insights.pendingExpenseTotal)} has not been fully processed.</p></div></div><div className="rounded-md bg-muted/60 p-3 text-xs text-muted-foreground">Insights reflect transactions recorded in Rock Frost. Reconcile bank, cash and external statements before making final financial decisions.</div></CardContent></Card>
          </div>
        </div>
        {canAsk ? (
          <InsightAssistant
            period={period}
            userName={user?.name ?? user?.email ?? "You"}
            userImage={user?.image ?? null}
          />
        ) : <Card><CardContent className="pt-6"><EmptyState icon={Lock} title="Business assistant unavailable" description="Your role does not include AI assistant access." /></CardContent></Card>}
      </div>
    </div>
  );
}
