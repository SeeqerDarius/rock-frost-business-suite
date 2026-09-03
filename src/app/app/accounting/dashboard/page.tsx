import Link from "next/link";
import { Lock, TrendingUp, TrendingDown, FileText, Wallet, UsersRound } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { OverviewMetricCard } from "@/components/dashboard/overview-metric-card";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { GaugeChart } from "@/components/dashboard/charts";
import { RevenueTrendSection, ProfitLossSection } from "./dashboard-toggles";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { formatMoney } from "@/lib/currency";
import { cn } from "@/lib/utils";
import {
  getDashboardKpis,
  getFinancialComparison,
  getFinancialBenchmarks,
  getTopInvoices,
  getRevenueBreakdownTrend,
  getProfitLossTrend,
  type DashboardPeriodPreset,
  type ComparisonRow,
} from "@/modules/accounting/dashboard-service";

const PRESETS: { value: DashboardPeriodPreset; label: string }[] = [
  { value: "month", label: "This month" },
  { value: "quarter", label: "This quarter" },
  { value: "year", label: "This year" },
];

function isPreset(value: string | undefined): value is DashboardPeriodPreset {
  return value === "month" || value === "quarter" || value === "year";
}

function formatRow(value: number | null, unit: ComparisonRow["unit"], currency?: string | null) {
  if (value === null) return "Not available";
  if (unit === "money") return formatMoney(value, currency);
  if (unit === "percent") return `${value.toFixed(1)}%`;
  if (unit === "ratio") return `${value.toFixed(2)}x`;
  return `${value.toFixed(1)} days`;
}

/** Percentage-point delta for rows already expressed as a percentage; relative % change otherwise - collapsing the two into one formula would make a margin's delta unreadable (e.g. 28% vs 20% is a +8-point move, not a nonsensical +40%). */
function formatDelta(row: ComparisonRow) {
  if (row.current === null || row.prior === null) return "Not available";
  if (row.unit === "percent") {
    const points = row.current - row.prior;
    return `${points >= 0 ? "+" : ""}${points.toFixed(2)} pts`;
  }
  if (Math.abs(row.prior) < 0.005) return row.current === row.prior ? "0%" : "Not available";
  const relative = ((row.current - row.prior) / Math.abs(row.prior)) * 100;
  return `${relative >= 0 ? "+" : ""}${relative.toFixed(1)}%`;
}

function ComparisonTable({ title, description, rows, currency }: { title: string; description: string; rows: ComparisonRow[]; currency?: string | null }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead></TableHead>
              <TableHead className="text-right">Current</TableHead>
              <TableHead className="text-right">Prior</TableHead>
              <TableHead className="text-right">Change</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const delta = formatDelta(row);
              const positive = delta.startsWith("+");
              const negative = delta.startsWith("-");
              return (
                <TableRow key={row.label}>
                  <TableCell className="text-muted-foreground">{row.label}</TableCell>
                  <TableCell className="text-right font-mono text-xs">{formatRow(row.current, row.unit, currency)}</TableCell>
                  <TableCell className="text-right font-mono text-xs text-muted-foreground">{formatRow(row.prior, row.unit, currency)}</TableCell>
                  <TableCell className={cn("text-right font-mono text-xs", positive && "text-emerald-600 dark:text-emerald-400", negative && "text-destructive")}>{delta}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export default async function AccountingFinancialDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ preset?: string }>;
}) {
  const { preset: presetParam } = await searchParams;
  const tenant = await requireModuleAccess("accounting");

  if (!hasPermission(tenant, PERMISSIONS.ACCOUNTING_REPORTS_VIEW)) {
    return (
      <div className="space-y-6">
        <PageHeader title="Financial Dashboard" description="Revenue and profit trends, financial-ratio benchmarks, and period comparison." />
        <EmptyState icon={Lock} title="You don't have access to this page" description="The financial dashboard is limited to roles with reporting permissions." />
      </div>
    );
  }

  const preset: DashboardPeriodPreset = isPreset(presetParam) ? presetParam : "month";
  const currency = tenant.organization.currency ?? "GHS";
  const money = (value: number) => formatMoney(value, currency);

  const [kpis, comparison, benchmarks, topInvoices, revenueTrend, profitLossTrend] = await Promise.all([
    getDashboardKpis(tenant.organizationId, preset),
    getFinancialComparison(tenant.organizationId, preset),
    getFinancialBenchmarks(tenant.organizationId, preset, currency),
    getTopInvoices(tenant.organizationId, preset),
    getRevenueBreakdownTrend(tenant.organizationId),
    getProfitLossTrend(tenant.organizationId),
  ]);

  const stats = [
    { label: "Current income", value: money(kpis.currentIncome), description: `Revenue recognized in ${comparison.current.label.toLowerCase()}`, icon: <TrendingUp className="size-4" />, href: "/app/accounting/invoices" },
    { label: "Receivables", value: money(kpis.receivables), description: "Outstanding customer balance as of today", icon: <UsersRound className="size-4" />, href: "/app/accounting/receivables" },
    { label: "Current expense", value: money(kpis.currentExpense), description: `Expenses recognized in ${comparison.current.label.toLowerCase()}`, icon: <TrendingDown className="size-4" />, href: "/app/accounting/expenses" },
    { label: "Payables", value: money(kpis.payables), description: "Outstanding supplier balance as of today", icon: <Wallet className="size-4" />, href: "/app/accounting/ageing" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Financial Dashboard"
        description={`Revenue and profit trends, financial-ratio benchmarks, and period comparison. Showing ${comparison.current.label.toLowerCase()} vs ${comparison.prior.label.toLowerCase()}.`}
        actions={
          <div className="inline-flex rounded-lg border bg-muted/60 p-0.5 text-xs">
            {PRESETS.map((option) => (
              <Link
                key={option.value}
                href={`/app/accounting/dashboard?preset=${option.value}`}
                aria-current={preset === option.value ? "true" : undefined}
                className={cn(
                  "rounded-md px-2.5 py-1.5 font-medium transition-colors",
                  preset === option.value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {option.label}
              </Link>
            ))}
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => <OverviewMetricCard key={stat.label} {...stat} />)}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Revenue</CardTitle>
          <CardDescription>Invoiced revenue by paid, unpaid, and refunded status over time.</CardDescription>
        </CardHeader>
        <CardContent>
          <RevenueTrendSection data={revenueTrend} currency={currency} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Profit &amp; Loss</CardTitle>
          <CardDescription>Income and expenses by period, with total profit - on an accrual or cash basis.</CardDescription>
        </CardHeader>
        <CardContent>
          <ProfitLossSection data={profitLossTrend} currency={currency} />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <ComparisonTable title="Cash" description="Cash movement across cash, bank, and mobile-money accounts." rows={comparison.cash} currency={currency} />
        <ComparisonTable title="Profitability" description="Income, cost of revenue, and net profit." rows={comparison.profitability} currency={currency} />
        <ComparisonTable title="Performance" description="Margins and returns as a share of revenue or assets." rows={comparison.performance} currency={currency} />
        <ComparisonTable title="Balance sheet" description="Receivable, payables, and net assets as of today." rows={comparison.balanceSheet} currency={currency} />
        <ComparisonTable title="Position" description="How long customers take to pay and suppliers are paid." rows={comparison.position} currency={currency} />
        <ComparisonTable title="Solvency" description="Debt coverage and equity strength. Permanence, financial balance, and long-term working capital require a short-term/long-term account split not yet tracked, so they read as not available." rows={comparison.solvency} currency={currency} />
        <ComparisonTable title="Liquidity" description="Coverage of liabilities from cash and near-cash assets." rows={comparison.liquidity} currency={currency} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Top Invoices</CardTitle>
          <CardDescription>{`The highest-value invoices issued in ${comparison.current.label.toLowerCase()}.`}</CardDescription>
        </CardHeader>
        <CardContent>
          {topInvoices.length === 0 ? (
            <EmptyState icon={FileText} title="No invoices in this period" description="Invoices issued in this period will show up here, highest amount first." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Reference</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Created by</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topInvoices.map((invoice) => (
                  <TableRow key={invoice.id}>
                    <TableCell>{invoice.invoiceNumber}</TableCell>
                    <TableCell>{invoice.customerName}</TableCell>
                    <TableCell><Badge variant="outline">{invoice.status}</Badge></TableCell>
                    <TableCell>{invoice.issueDate.toLocaleDateString()}</TableCell>
                    <TableCell className="text-muted-foreground">{invoice.createdByName ?? "Not available"}</TableCell>
                    <TableCell className="text-right font-mono text-xs">{money(invoice.amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Benchmarks</CardTitle>
          <CardDescription>
            Financial-ratio gauges for {benchmarks.period.label.toLowerCase()}. &ldquo;Current&rdquo; assets and liabilities mean every Asset and Liability account - this schema has no short-term/long-term account split yet, so ratios that
            normally use only current-period figures use the whole balance sheet instead.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {benchmarks.gauges.map((gauge) => (
              <GaugeChart
                key={gauge.key}
                value={gauge.value}
                displayValue={gauge.displayValue}
                min={gauge.min}
                max={gauge.max}
                unit={gauge.unit}
                currency={gauge.currency}
                tone={gauge.tone}
                label={gauge.label}
                formula={gauge.formula}
                interpretation={gauge.interpretation}
              />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
