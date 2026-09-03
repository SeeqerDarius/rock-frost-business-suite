import "server-only";

import { Prisma } from "@prisma/client";
import type { AccountingAccountType } from "@prisma/client";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/currency";
import { buildTrendBuckets, widestTrendLookback, type TrendGranularity } from "@/lib/trend-buckets";
import { listSupplierInvoices } from "@/modules/procurement/service";
import {
  getAccountBalancesAsOf,
  getCashFlowStatement,
  NON_POSTED_JOURNAL_STATUSES,
  type AccountBalanceAsOf,
} from "./service";

/**
 * Financial Dashboard for the Accounting module: KPI tiles, revenue/profit
 * trend charts, a Top Invoices list, period-over-prior-period financial
 * statement tables, and a bank of financial-ratio "benchmark" gauges.
 *
 * Deliberate v1 scope limits, documented here rather than hidden:
 *  - Cost of revenue is treated as $0 (no COGS account classification exists
 *    yet), so gross profit margin reads the same as net revenue.
 *  - Operating margin equals net profit margin (no operating/non-operating
 *    expense split exists to compute EBIT separately).
 *  - "Current" assets/liabilities means EVERY Asset/Liability account - the
 *    schema has no current/non-current (short-term vs long-term)
 *    classification, so Current ratio, Quick ratio, Working capital, and the
 *    Cash Flow ratio denominator all use whole-balance-sheet totals.
 *  - Permanence, Financial balance, and Long-term working capital are out of
 *    scope: all three require the current/non-current split above.
 *  - Payables (and everything derived from Total Liabilities) reflects only
 *    the general ledger's own Accounts Payable account. Procurement's
 *    ProcurementSupplierInvoice never posts a journal entry, so it has no
 *    point-in-time balance history - it IS safely included in the flow-based
 *    "credit purchases" figure (a period total, accurate regardless of
 *    today's payment status), but not in any as-of-a-date balance, which
 *    would otherwise silently mix a real historical GL balance with a
 *    "right now" snapshot for the prior period.
 */

export type DashboardPeriodPreset = "month" | "quarter" | "year";

export interface DashboardPeriod {
  from: Date;
  to: Date;
  label: string;
}

const PRESET_LABELS: Record<DashboardPeriodPreset, string> = {
  month: "This month",
  quarter: "This quarter",
  year: "This year",
};

function atStartOfDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function atEndOfDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(23, 59, 59, 999);
  return copy;
}

function startOfPreset(preset: DashboardPeriodPreset, date: Date) {
  if (preset === "month") return new Date(date.getFullYear(), date.getMonth(), 1);
  if (preset === "quarter") return new Date(date.getFullYear(), Math.floor(date.getMonth() / 3) * 3, 1);
  return new Date(date.getFullYear(), 0, 1);
}

/** "To-date" window for the calendar unit containing `now`: start of the unit through the end of today. */
export function resolveDashboardPeriod(preset: DashboardPeriodPreset, now: Date = new Date()): DashboardPeriod {
  return { from: atStartOfDay(startOfPreset(preset, now)), to: atEndOfDay(now), label: PRESET_LABELS[preset] };
}

/**
 * The prior calendar unit, capped at the same day offset ("to-date vs
 * prior-unit-to-date") rather than a raw duration shift immediately before
 * `period.from` - comparing e.g. Sep 1-3 against Aug 1-3, not Aug 29-31,
 * since the latter is a near-empty window on day 3 of a new period and reads
 * as broken rather than informative. A short prior month (e.g. February)
 * rolling a day offset past its own length intentionally spills into the
 * next month via ordinary Date rollover - there is no universally "correct"
 * answer for "day 31 of a 28-day month," and this is an acceptable, disclosed
 * edge case for a v1.
 */
export function priorPeriodOf(period: DashboardPeriod, preset: DashboardPeriodPreset): DashboardPeriod {
  const dayOffset = Math.floor((period.to.getTime() - period.from.getTime()) / 86_400_000);
  const priorUnitStart = preset === "month"
    ? new Date(period.from.getFullYear(), period.from.getMonth() - 1, 1)
    : preset === "quarter"
      ? new Date(period.from.getFullYear(), period.from.getMonth() - 3, 1)
      : new Date(period.from.getFullYear() - 1, 0, 1);
  const from = atStartOfDay(priorUnitStart);
  const to = atEndOfDay(new Date(from.getFullYear(), from.getMonth(), from.getDate() + dayOffset));
  return { from, to, label: `Prior ${PRESET_LABELS[preset].toLowerCase()}` };
}

function safeDiv(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(denominator) || Math.abs(denominator) < 0.005) return null;
  return numerator / denominator;
}

// --- Shared per-period figures, computed once and reused by both the
// benchmark gauges and the comparison tables so the two can never disagree ---

interface PeriodFinancials {
  period: DashboardPeriod;
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  cashAndBank: number;
  receivable: number;
  payables: number;
  income: number;
  expenses: number;
  netIncome: number;
  cashReceived: number;
  cashSpent: number;
  operatingCashFlow: number;
  averageReceivable: number;
  averagePayable: number;
  creditSales: number;
  creditPurchases: number;
  days: number;
}

function sumByType(rows: AccountBalanceAsOf[], type: AccountingAccountType) {
  return rows.filter((row) => row.type === type).reduce((sum, row) => sum + row.balance, 0);
}

async function computePeriodFinancials(organizationId: string, period: DashboardPeriod): Promise<PeriodFinancials> {
  const periodStartBoundary = new Date(period.from.getTime() - 1);

  const [balancesAtEnd, balancesBeforeStart, cashFlow, journalEntries, invoiceAgg, bills, supplierInvoices] = await Promise.all([
    getAccountBalancesAsOf(organizationId, period.to),
    getAccountBalancesAsOf(organizationId, periodStartBoundary),
    getCashFlowStatement(organizationId, period.from, period.to),
    db.accountingJournalEntry.findMany({
      where: { organizationId, entryDate: { gte: period.from, lte: period.to }, status: { notIn: NON_POSTED_JOURNAL_STATUSES } },
      select: { lines: { select: { debit: true, credit: true, account: { select: { type: true } } } } },
    }),
    db.accountingInvoice.aggregate({ where: { organizationId, issueDate: { gte: period.from, lte: period.to } }, _sum: { amount: true } }),
    db.accountingBill.findMany({ where: { organizationId, billDate: { gte: period.from, lte: period.to } }, select: { amount: true } }),
    listSupplierInvoices(organizationId),
  ]);

  let income = new Prisma.Decimal(0);
  let expenses = new Prisma.Decimal(0);
  for (const entry of journalEntries) {
    for (const line of entry.lines) {
      if (line.account.type === "REVENUE") income = income.plus(line.credit).minus(line.debit);
      else if (line.account.type === "EXPENSE") expenses = expenses.plus(line.debit).minus(line.credit);
    }
  }
  const netIncome = income.minus(expenses).toNumber();

  const totalAssets = sumByType(balancesAtEnd, "ASSET");
  const totalLiabilities = sumByType(balancesAtEnd, "LIABILITY");
  // Fold current-period net income into equity the same way
  // getStatementOfFinancialPosition() does, since Revenue/Expense accounts
  // have no balance-sheet home of their own until a period-end close.
  const totalEquity = sumByType(balancesAtEnd, "EQUITY") + netIncome;

  const cashAndBank = balancesAtEnd.filter((a) => a.liquidityType !== "NONE").reduce((sum, a) => sum + a.balance, 0);
  const receivable = balancesAtEnd.find((a) => a.code === "1100")?.balance ?? 0;
  const payables = balancesAtEnd.find((a) => a.code === "2000")?.balance ?? 0;
  const receivableAtStart = balancesBeforeStart.find((a) => a.code === "1100")?.balance ?? 0;
  const payableAtStart = balancesBeforeStart.find((a) => a.code === "2000")?.balance ?? 0;

  const creditSales = Number(invoiceAgg._sum.amount ?? 0);
  const billPurchases = bills.reduce((sum, bill) => sum + Number(bill.amount), 0);
  // Safe here (unlike a balance): a period total of invoiced amounts is
  // accurate regardless of a supplier invoice's payment status today.
  const supplierPurchases = supplierInvoices
    .filter((invoice) => invoice.invoiceDate >= period.from && invoice.invoiceDate <= period.to)
    .reduce((sum, invoice) => sum + Number(invoice.totalAmount), 0);

  const days = Math.max(1, Math.round((period.to.getTime() - period.from.getTime()) / 86_400_000));

  return {
    period,
    totalAssets,
    totalLiabilities,
    totalEquity,
    cashAndBank,
    receivable,
    payables,
    income: income.toNumber(),
    expenses: expenses.toNumber(),
    netIncome,
    cashReceived: cashFlow.cashReceived,
    cashSpent: cashFlow.cashSpent,
    operatingCashFlow: cashFlow.operating,
    averageReceivable: (receivableAtStart + receivable) / 2,
    averagePayable: (payableAtStart + payables) / 2,
    creditSales,
    creditPurchases: billPurchases + supplierPurchases,
    days,
  };
}

// --- Benchmark gauges ---

export interface GaugeBand {
  max: number;
  tone: "red" | "amber" | "green";
}

export type GaugeUnit = "percent" | "ratio" | "days" | "money";

export interface GaugeDefinition {
  key: string;
  label: string;
  formula: string;
  interpretation: string;
  value: number | null;
  displayValue: string;
  min: number;
  max: number;
  unit: GaugeUnit;
  currency?: string | null;
  tone: "red" | "amber" | "green" | "neutral";
}

function pickTone(value: number | null, bands: GaugeBand[]): GaugeDefinition["tone"] {
  if (value === null) return "neutral";
  for (const band of bands) if (value <= band.max) return band.tone;
  return bands[bands.length - 1]?.tone ?? "neutral";
}

function formatGaugeValue(value: number, unit: GaugeUnit, currency?: string | null) {
  if (unit === "percent") return `${value.toFixed(1)}%`;
  if (unit === "ratio") return `${value.toFixed(2)}x`;
  if (unit === "days") return `${value.toFixed(1)} days`;
  return formatMoney(value, currency);
}

function buildGauge(
  key: string,
  label: string,
  formula: string,
  interpretation: string,
  value: number | null,
  unit: GaugeUnit,
  min: number,
  max: number,
  bands: GaugeBand[],
  currency?: string | null,
): GaugeDefinition {
  const displayValue = value === null ? "Not available" : formatGaugeValue(value, unit, currency);
  return { key, label, formula, interpretation, value, displayValue, min, max, unit, currency, tone: pickTone(value, bands) };
}

export interface FinancialBenchmarks {
  period: DashboardPeriod;
  gauges: GaugeDefinition[];
}

export async function getFinancialBenchmarks(organizationId: string, preset: DashboardPeriodPreset, currency?: string | null, now: Date = new Date()): Promise<FinancialBenchmarks> {
  const period = resolveDashboardPeriod(preset, now);
  const f = await computePeriodFinancials(organizationId, period);

  const grossProfitMargin = safeDiv(f.income, f.income); // Cost of revenue = 0 (v1 simplification, see file header)
  const netProfitMargin = safeDiv(f.netIncome, f.income);
  const operatingMargin = netProfitMargin; // v1 simplification, see file header
  const debtToEquity = safeDiv(f.totalLiabilities, f.totalEquity);
  const currentRatio = safeDiv(f.totalAssets, f.totalLiabilities);
  const cashFlowRatio = safeDiv(f.operatingCashFlow, f.totalLiabilities);
  const workingCapital = f.totalAssets - f.totalLiabilities;
  const quickRatio = safeDiv(f.cashAndBank + f.receivable, f.totalLiabilities);
  const averageDebtorDays = f.creditSales > 0 ? (f.averageReceivable / f.creditSales) * f.days : null;
  const averagePayableDays = f.creditPurchases > 0 ? (f.averagePayable / f.creditPurchases) * f.days : null;
  const pct = (v: number | null) => (v === null ? null : v * 100);

  const workingCapitalRange = Math.max(Math.abs(workingCapital) * 1.5, 1);

  const gauges: GaugeDefinition[] = [
    buildGauge("grossProfitMargin", "Gross profit margin", "(Net sales − Cost of revenue) / Net sales",
      "Share of every sale left after direct cost of what was sold. Cost of revenue isn't tracked as its own account type yet, so this currently reads the same as net revenue.",
      pct(grossProfitMargin), "percent", 0, 100, [{ max: 15, tone: "red" }, { max: 40, tone: "amber" }, { max: 100, tone: "green" }]),
    buildGauge("netProfitMargin", "Net profit margin", "Net income / Revenue",
      "How much of every unit of revenue is left after all expenses. A thin or negative margin means costs are eating into revenue faster than it comes in.",
      pct(netProfitMargin), "percent", -20, 60, [{ max: 0, tone: "red" }, { max: 10, tone: "amber" }, { max: 60, tone: "green" }]),
    buildGauge("operatingMargin", "Operating margin", "Net operating income / Net sales",
      "Profit from core operations before financing effects. No operating-vs-non-operating expense split exists yet, so this equals net profit margin.",
      pct(operatingMargin), "percent", -20, 60, [{ max: 0, tone: "red" }, { max: 10, tone: "amber" }, { max: 60, tone: "green" }]),
    buildGauge("debtToEquity", "Debt-to-equity", "Total liabilities / Total equity",
      "How much of the business is financed by debt versus owner capital. A high ratio means more of the balance sheet is owed to others rather than owned outright.",
      debtToEquity, "ratio", 0, 5, [{ max: 1, tone: "green" }, { max: 2, tone: "amber" }, { max: 5, tone: "red" }]),
    buildGauge("currentRatio", "Current ratio", "Total assets / Total liabilities",
      "Whether short-term obligations are covered by what the business owns. No current/non-current split exists yet, so this uses the whole balance sheet.",
      currentRatio, "ratio", 0, 5, [{ max: 1, tone: "red" }, { max: 1.5, tone: "amber" }, { max: 5, tone: "green" }]),
    buildGauge("cashFlowRatio", "Cash flow ratio", "Operating cash flow / Total liabilities",
      "Whether the cash actually generated this period, not just paper profit, is enough to cover what's owed.",
      cashFlowRatio, "ratio", -1, 2, [{ max: 0, tone: "red" }, { max: 0.4, tone: "amber" }, { max: 2, tone: "green" }]),
    buildGauge("workingCapital", "Working capital", "Total assets − Total liabilities",
      "The cushion left after settling every liability with every asset. A currency amount, not a ratio - there is no universal band across organizations of different sizes.",
      workingCapital, "money", -workingCapitalRange, workingCapitalRange, [{ max: 0, tone: "red" }, { max: workingCapitalRange, tone: "green" }], currency),
    buildGauge("quickRatio", "Quick ratio", "(Cash + bank + mobile money + receivables) / Total liabilities",
      "Coverage of liabilities from assets that can be turned into cash quickly, without waiting to sell anything.",
      quickRatio, "ratio", 0, 3, [{ max: 0.5, tone: "red" }, { max: 1, tone: "amber" }, { max: 3, tone: "green" }]),
    buildGauge("averageDebtorDays", "Average debtor days", "(Average receivable balance / Credit sales in period) × days in period",
      "How long, on average, customers take to pay. Fewer days means cash is collected faster.",
      averageDebtorDays, "days", 0, 120, [{ max: 30, tone: "green" }, { max: 60, tone: "amber" }, { max: 120, tone: "red" }]),
    buildGauge("averagePayableDays", "Average payable days", "(Average payable balance / Credit purchases in period) × days in period",
      "How long, on average, the business takes to pay its own suppliers. Includes Procurement-sourced supplier invoices alongside Accounting bills.",
      averagePayableDays, "days", 0, 150, [{ max: 45, tone: "green" }, { max: 90, tone: "amber" }, { max: 150, tone: "red" }]),
  ];

  return { period, gauges };
}

// --- Statement comparison tables ---

export type ComparisonUnit = "money" | "percent" | "ratio" | "days";

export interface ComparisonRow {
  label: string;
  unit: ComparisonUnit;
  current: number | null;
  prior: number | null;
}

export interface FinancialComparison {
  current: DashboardPeriod;
  prior: DashboardPeriod;
  cash: ComparisonRow[];
  profitability: ComparisonRow[];
  performance: ComparisonRow[];
  balanceSheet: ComparisonRow[];
  position: ComparisonRow[];
  solvency: ComparisonRow[];
  liquidity: ComparisonRow[];
}

export async function getFinancialComparison(organizationId: string, preset: DashboardPeriodPreset, now: Date = new Date()): Promise<FinancialComparison> {
  const current = resolveDashboardPeriod(preset, now);
  const prior = priorPeriodOf(current, preset);
  const [cur, pri] = await Promise.all([
    computePeriodFinancials(organizationId, current),
    computePeriodFinancials(organizationId, prior),
  ]);

  const row = (label: string, unit: ComparisonUnit, currentValue: number | null, priorValue: number | null): ComparisonRow => ({ label, unit, current: currentValue, prior: priorValue });
  const pct = (v: number | null) => (v === null ? null : v * 100);
  const debtorDays = (f: PeriodFinancials) => (f.creditSales > 0 ? (f.averageReceivable / f.creditSales) * f.days : null);
  const creditorDays = (f: PeriodFinancials) => (f.creditPurchases > 0 ? (f.averagePayable / f.creditPurchases) * f.days : null);

  return {
    current,
    prior,
    cash: [
      row("Cash received", "money", cur.cashReceived, pri.cashReceived),
      row("Cash spent", "money", -cur.cashSpent, -pri.cashSpent),
      row("Cash surplus", "money", cur.cashReceived - cur.cashSpent, pri.cashReceived - pri.cashSpent),
      row("Closing bank balance", "money", cur.cashAndBank, pri.cashAndBank),
    ],
    profitability: [
      row("Income", "money", cur.income, pri.income),
      row("Cost of revenue", "money", 0, 0),
      row("Gross profit", "money", cur.income, pri.income),
      row("Expenses", "money", cur.expenses, pri.expenses),
      row("Net profit", "money", cur.netIncome, pri.netIncome),
    ],
    performance: [
      row("Gross profit margin", "percent", pct(safeDiv(cur.income, cur.income)), pct(safeDiv(pri.income, pri.income))),
      row("Net profit margin", "percent", pct(safeDiv(cur.netIncome, cur.income)), pct(safeDiv(pri.netIncome, pri.income))),
      row("Return on investments", "percent", pct(safeDiv(cur.netIncome, cur.totalAssets)), pct(safeDiv(pri.netIncome, pri.totalAssets))),
      row("Financial independence", "percent", pct(safeDiv(cur.totalEquity, cur.totalAssets)), pct(safeDiv(pri.totalEquity, pri.totalAssets))),
    ],
    balanceSheet: [
      row("Receivable", "money", cur.receivable, pri.receivable),
      row("Payables", "money", cur.payables, pri.payables),
      row("Net assets", "money", cur.totalEquity, pri.totalEquity),
    ],
    position: [
      row("Average debtor days", "days", debtorDays(cur), debtorDays(pri)),
      row("Average creditor days", "days", creditorDays(cur), creditorDays(pri)),
      row("Short-term cash forecast", "money", cur.receivable, pri.receivable),
    ],
    solvency: [
      row("Debt to equity", "ratio", safeDiv(cur.totalLiabilities, cur.totalEquity), safeDiv(pri.totalLiabilities, pri.totalEquity)),
      row("Solvency %", "percent", pct(safeDiv(cur.totalEquity, cur.totalLiabilities)), pct(safeDiv(pri.totalEquity, pri.totalLiabilities))),
      row("Debt ratio", "percent", pct(safeDiv(cur.totalLiabilities, cur.totalAssets)), pct(safeDiv(pri.totalLiabilities, pri.totalAssets))),
      row("Return on equity", "percent", pct(safeDiv(cur.netIncome, cur.totalEquity)), pct(safeDiv(pri.netIncome, pri.totalEquity))),
      // Out of scope for v1: each requires a current/non-current (short-term
      // vs long-term) classification on Asset/Liability accounts that this
      // schema deliberately does not add - see file header.
      row("Permanence", "percent", null, null),
      row("Financial balance", "percent", null, null),
      row("Long-term working capital", "money", null, null),
    ],
    liquidity: [
      row("Cash asset ratio", "ratio", safeDiv(cur.cashAndBank, cur.totalLiabilities), safeDiv(pri.cashAndBank, pri.totalLiabilities)),
      row("Quick ratio", "ratio", safeDiv(cur.cashAndBank + cur.receivable, cur.totalLiabilities), safeDiv(pri.cashAndBank + pri.receivable, pri.totalLiabilities)),
      row("Current ratio", "ratio", safeDiv(cur.totalAssets, cur.totalLiabilities), safeDiv(pri.totalAssets, pri.totalLiabilities)),
      row("Working capital", "money", cur.totalAssets - cur.totalLiabilities, pri.totalAssets - pri.totalLiabilities),
    ],
  };
}

// --- KPI tiles (reuse getFinancialComparison's current-period values
// directly, never getAccountingSummary - see file header) ---

export interface DashboardKpis {
  period: DashboardPeriod;
  currentIncome: number;
  receivables: number;
  currentExpense: number;
  payables: number;
}

export async function getDashboardKpis(organizationId: string, preset: DashboardPeriodPreset, now: Date = new Date()): Promise<DashboardKpis> {
  const comparison = await getFinancialComparison(organizationId, preset, now);
  const find = (rows: ComparisonRow[], label: string) => rows.find((row) => row.label === label)?.current ?? 0;
  return {
    period: comparison.current,
    currentIncome: find(comparison.profitability, "Income"),
    receivables: find(comparison.balanceSheet, "Receivable"),
    currentExpense: find(comparison.profitability, "Expenses"),
    payables: find(comparison.balanceSheet, "Payables"),
  };
}

// --- Top invoices ---

export interface TopInvoiceRow {
  id: string;
  invoiceNumber: string;
  customerName: string;
  status: string;
  issueDate: Date;
  amount: number;
  outstanding: number;
  createdByName: string | null;
}

/** Sorted by amount descending, not recency - "Top" means highest value. */
export async function getTopInvoices(organizationId: string, preset: DashboardPeriodPreset, limit = 10, now: Date = new Date()): Promise<TopInvoiceRow[]> {
  const period = resolveDashboardPeriod(preset, now);
  const invoices = await db.accountingInvoice.findMany({
    where: { organizationId, issueDate: { gte: period.from, lte: period.to } },
    orderBy: { amount: "desc" },
    take: limit,
    select: { id: true, invoiceNumber: true, customerName: true, status: true, issueDate: true, amount: true, amountPaid: true, amountCredited: true, createdBy: { select: { name: true } } },
  });
  return invoices.map((invoice) => ({
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    customerName: invoice.customerName,
    status: invoice.status,
    issueDate: invoice.issueDate,
    amount: Number(invoice.amount),
    outstanding: Number(invoice.amount) - Number(invoice.amountPaid) - Number(invoice.amountCredited),
    createdByName: invoice.createdBy?.name ?? null,
  }));
}

// --- Revenue breakdown trend + accrual/cash P&L trend ---
// Both fetch once over the widest lookback and bucket three ways in memory
// (the same pattern buildTrendBuckets/widestTrendLookback already establish
// for getAccountingOverviewTrends), so the client-side granularity switch and
// the Invoices|Overdue / Accrual|Cash toggles are pure already-fetched-data
// selection - no query changes on toggle, per docs/DASHBOARD_KPI_STANDARD.md.

export interface RevenueTrendPoint {
  label: string;
  total: number;
  paid: number;
  unpaid: number;
  refund: number;
  overdue: number;
}

export async function getRevenueBreakdownTrend(organizationId: string): Promise<Record<TrendGranularity, RevenueTrendPoint[]>> {
  const lookback = widestTrendLookback();
  const [invoices, creditNotes] = await Promise.all([
    db.accountingInvoice.findMany({
      where: { organizationId, issueDate: { gte: lookback } },
      select: { issueDate: true, amount: true, amountPaid: true, amountCredited: true, status: true },
    }),
    db.accountingCreditNote.findMany({
      where: { organizationId, status: "REFUNDED", settledAt: { gte: lookback } },
      select: { settledAt: true, amount: true },
    }),
  ]);

  const buildSeries = (granularity: TrendGranularity): RevenueTrendPoint[] =>
    buildTrendBuckets(granularity).map((bucket) => {
      const bucketInvoices = invoices.filter((invoice) => invoice.issueDate >= bucket.start && invoice.issueDate < bucket.end);
      const total = bucketInvoices.reduce((sum, invoice) => sum + Number(invoice.amount), 0);
      const paid = bucketInvoices.reduce((sum, invoice) => sum + Number(invoice.amountPaid), 0);
      const unpaid = bucketInvoices.reduce((sum, invoice) => sum + Math.max(0, Number(invoice.amount) - Number(invoice.amountPaid) - Number(invoice.amountCredited)), 0);
      const overdue = bucketInvoices
        .filter((invoice) => invoice.status === "OVERDUE")
        .reduce((sum, invoice) => sum + Math.max(0, Number(invoice.amount) - Number(invoice.amountPaid) - Number(invoice.amountCredited)), 0);
      const refund = creditNotes
        .filter((note) => note.settledAt && note.settledAt >= bucket.start && note.settledAt < bucket.end)
        .reduce((sum, note) => sum + Number(note.amount), 0);
      return { label: bucket.label, total, paid, unpaid, refund, overdue };
    });

  return { days: buildSeries("days"), weeks: buildSeries("weeks"), months: buildSeries("months") };
}

export interface ProfitLossTrendPoint {
  label: string;
  incomeAccrual: number;
  expensesAccrual: number;
  profitAccrual: number;
  incomeCash: number;
  expensesCash: number;
  profitCash: number;
}

export async function getProfitLossTrend(organizationId: string): Promise<Record<TrendGranularity, ProfitLossTrendPoint[]>> {
  const lookback = widestTrendLookback();
  const liquidityAccounts = await db.accountingAccount.findMany({ where: { organizationId, liquidityType: { not: "NONE" } }, select: { id: true } });
  const liquidityIds = new Set(liquidityAccounts.map((account) => account.id));

  const entries = await db.accountingJournalEntry.findMany({
    where: { organizationId, entryDate: { gte: lookback }, status: { notIn: NON_POSTED_JOURNAL_STATUSES } },
    select: { entryDate: true, lines: { select: { debit: true, credit: true, accountId: true, account: { select: { type: true } } } } },
  });

  const buildSeries = (granularity: TrendGranularity): ProfitLossTrendPoint[] =>
    buildTrendBuckets(granularity).map((bucket) => {
      let incomeAccrual = 0;
      let expensesAccrual = 0;
      let incomeCash = 0;
      let expensesCash = 0;
      for (const entry of entries) {
        if (entry.entryDate < bucket.start || entry.entryDate >= bucket.end) continue;
        for (const line of entry.lines) {
          if (line.account.type === "REVENUE") incomeAccrual += Number(line.credit) - Number(line.debit);
          else if (line.account.type === "EXPENSE") expensesAccrual += Number(line.debit) - Number(line.credit);
          if (liquidityIds.has(line.accountId)) {
            incomeCash += Number(line.debit);
            expensesCash += Number(line.credit);
          }
        }
      }
      return { label: bucket.label, incomeAccrual, expensesAccrual, profitAccrual: incomeAccrual - expensesAccrual, incomeCash, expensesCash, profitCash: incomeCash - expensesCash };
    });

  return { days: buildSeries("days"), weeks: buildSeries("weeks"), months: buildSeries("months") };
}
