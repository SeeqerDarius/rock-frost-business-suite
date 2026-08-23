import "server-only";

import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

export const ACCOUNTING_INSIGHT_PERIODS = [30, 90, 365] as const;
export type AccountingInsightPeriod = (typeof ACCOUNTING_INSIGHT_PERIODS)[number];

const SOURCE_LABELS: Record<string, string> = {
  FLEET_PAYMENT: "Fleet",
  PHARMACY_DISPENSING: "Pharmacy",
  HOSPITAL_PAYMENT: "Hospital",
  POS_SALE: "Point of Sale",
  INSTALLMENT_PAYMENT: "Installment",
  HOSTEL_FEE_PAYMENT: "Hostel",
  HOTEL_PAYMENT: "Hotel",
  SCHOOL_FEE_PAYMENT: "School",
  INVOICE: "Accounting invoices",
  MANUAL: "Manual journals",
};

function round(value: Prisma.Decimal) {
  return Number(value.toDecimalPlaces(2));
}

function percentageChange(current: Prisma.Decimal, previous: Prisma.Decimal) {
  if (previous.isZero()) return current.isZero() ? 0 : null;
  return Number(current.minus(previous).div(previous.abs()).mul(100).toDecimalPlaces(1));
}

function bucketKey(date: Date, period: AccountingInsightPeriod) {
  return period === 365
    ? `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`
    : date.toISOString().slice(0, 10);
}

function bucketLabel(key: string, period: AccountingInsightPeriod) {
  const date = period === 365 ? new Date(`${key}-01T00:00:00.000Z`) : new Date(`${key}T00:00:00.000Z`);
  return period === 365
    ? date.toLocaleDateString("en-GH", { month: "short", year: "2-digit", timeZone: "UTC" })
    : date.toLocaleDateString("en-GH", { month: "short", day: "numeric", timeZone: "UTC" });
}

export async function getAccountingInsights(organizationId: string, period: AccountingInsightPeriod) {
  const to = new Date();
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - period + 1);
  from.setUTCHours(0, 0, 0, 0);
  const previousFrom = new Date(from);
  previousFrom.setUTCDate(previousFrom.getUTCDate() - period);

  const [entries, overdueInvoices, pendingExpenses, cashAccounts] = await Promise.all([
    db.accountingJournalEntry.findMany({
      where: { organizationId, entryDate: { gte: previousFrom, lte: to } },
      select: {
        id: true,
        entryDate: true,
        sourceType: true,
        reversalOf: { select: { sourceType: true } },
        lines: { select: { debit: true, credit: true, account: { select: { type: true } } } },
      },
      orderBy: { entryDate: "asc" },
    }),
    db.accountingInvoice.aggregate({
      where: { organizationId, status: "OVERDUE" },
      _count: { _all: true },
      _sum: { amount: true },
    }),
    db.accountingExpense.findMany({
      where: { organizationId, status: { in: ["PENDING", "APPROVED"] } },
      select: { amount: true },
    }),
    db.accountingAccount.findMany({
      where: { organizationId, liquidityType: { not: "NONE" } },
      select: { type: true, journalLines: { select: { debit: true, credit: true } } },
    }),
  ]);

  const revenueBySource = new Map<string, Prisma.Decimal>();
  const series = new Map<string, { revenue: Prisma.Decimal; expenses: Prisma.Decimal }>();
  let revenue = new Prisma.Decimal(0);
  let expenses = new Prisma.Decimal(0);
  let previousRevenue = new Prisma.Decimal(0);
  let previousExpenses = new Prisma.Decimal(0);
  let revenueTransactions = 0;

  for (const entry of entries) {
    const entryRevenue = entry.lines.reduce(
      (sum, line) => line.account.type === "REVENUE" ? sum.plus(line.credit).minus(line.debit) : sum,
      new Prisma.Decimal(0),
    );
    const entryExpenses = entry.lines.reduce(
      (sum, line) => line.account.type === "EXPENSE" ? sum.plus(line.debit).minus(line.credit) : sum,
      new Prisma.Decimal(0),
    );
    if (entry.entryDate < from) {
      previousRevenue = previousRevenue.plus(entryRevenue);
      previousExpenses = previousExpenses.plus(entryExpenses);
      continue;
    }

    revenue = revenue.plus(entryRevenue);
    expenses = expenses.plus(entryExpenses);
    if (entryRevenue.isPositive()) revenueTransactions++;
    const source = entry.reversalOf?.sourceType ?? entry.sourceType ?? "MANUAL";
    revenueBySource.set(source, (revenueBySource.get(source) ?? new Prisma.Decimal(0)).plus(entryRevenue));
    const key = bucketKey(entry.entryDate, period);
    const bucket = series.get(key) ?? { revenue: new Prisma.Decimal(0), expenses: new Prisma.Decimal(0) };
    bucket.revenue = bucket.revenue.plus(entryRevenue);
    bucket.expenses = bucket.expenses.plus(entryExpenses);
    series.set(key, bucket);
  }

  const cashBalance = cashAccounts.reduce((total, account) => {
    const balance = account.journalLines.reduce(
      (sum, line) => sum.plus(line.debit).minus(line.credit),
      new Prisma.Decimal(0),
    );
    return total.plus(balance);
  }, new Prisma.Decimal(0));

  const sources = [...revenueBySource.entries()]
    .map(([sourceType, amount]) => ({ sourceType, label: SOURCE_LABELS[sourceType] ?? sourceType.replaceAll("_", " ").toLowerCase(), amount: round(amount) }))
    .filter((source) => source.amount !== 0)
    .sort((a, b) => b.amount - a.amount);

  return {
    period,
    from: from.toISOString(),
    to: to.toISOString(),
    revenue: round(revenue),
    expenses: round(expenses),
    netIncome: round(revenue.minus(expenses)),
    cashBalance: round(cashBalance),
    revenueTransactions,
    averageRevenueTransaction: revenueTransactions > 0 ? round(revenue.div(revenueTransactions)) : 0,
    revenueChangePercent: percentageChange(revenue, previousRevenue),
    expenseChangePercent: percentageChange(expenses, previousExpenses),
    overdueInvoiceCount: overdueInvoices._count._all,
    overdueInvoiceTotal: Number(overdueInvoices._sum.amount ?? 0),
    pendingExpenseCount: pendingExpenses.length,
    pendingExpenseTotal: round(pendingExpenses.reduce((sum, expense) => sum.plus(expense.amount), new Prisma.Decimal(0))),
    sources,
    series: [...series.entries()].map(([key, values]) => ({
      key,
      label: bucketLabel(key, period),
      revenue: round(values.revenue),
      expenses: round(values.expenses),
    })),
  };
}

export type AccountingInsights = Awaited<ReturnType<typeof getAccountingInsights>>;
