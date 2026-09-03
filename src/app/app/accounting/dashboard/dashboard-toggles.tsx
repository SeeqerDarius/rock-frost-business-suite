"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { PeriodicTrendChart, PeriodicComposedTrendChart } from "@/components/dashboard/charts";
import type { TrendGranularity } from "@/lib/trend-buckets";
import type { RevenueTrendPoint, ProfitLossTrendPoint } from "@/modules/accounting/dashboard-service";

function ToggleGroup<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (value: T) => void }) {
  return (
    <div role="group" className="inline-flex rounded-lg bg-muted p-0.5 text-xs">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          aria-pressed={value === option.value}
          className={cn(
            "rounded-md px-2.5 py-1 font-medium transition-colors",
            value === option.value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Invoices|Overdue is a pure client-side series selection on data already
 * fetched together (getRevenueBreakdownTrend returns every field for every
 * bucket up front) - switching view never re-queries or changes the
 * underlying values, per docs/DASHBOARD_KPI_STANDARD.md.
 */
export function RevenueTrendSection({ data, currency }: { data: Record<TrendGranularity, RevenueTrendPoint[]>; currency?: string | null }) {
  const [view, setView] = useState<"invoices" | "overdue">("invoices");
  const series = view === "invoices"
    ? [{ key: "total", label: "Total" }, { key: "paid", label: "Paid" }, { key: "unpaid", label: "Unpaid" }, { key: "refund", label: "Refund" }]
    : [{ key: "overdue", label: "Overdue" }];
  const mapped: Record<TrendGranularity, Record<string, string | number>[]> = {
    days: data.days.map(revenuePointToRecord),
    weeks: data.weeks.map(revenuePointToRecord),
    months: data.months.map(revenuePointToRecord),
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <ToggleGroup value={view} options={[{ value: "invoices", label: "Invoices" }, { value: "overdue", label: "Overdue" }]} onChange={setView} />
      </div>
      <PeriodicTrendChart data={mapped} series={series} currency={currency} />
    </div>
  );
}

/**
 * Accrual|Cash is the same client-side selection principle: getProfitLossTrend
 * buckets both an accrual series (revenue/expense journal lines by entry
 * date) and a cash series (liquidity-account journal lines by debit/credit)
 * for every bucket up front, so the toggle only changes which fields render.
 */
export function ProfitLossSection({ data, currency }: { data: Record<TrendGranularity, ProfitLossTrendPoint[]>; currency?: string | null }) {
  const [basis, setBasis] = useState<"accrual" | "cash">("accrual");
  const mapped: Record<TrendGranularity, Record<string, string | number>[]> = {
    days: mapPoints(data.days, basis),
    weeks: mapPoints(data.weeks, basis),
    months: mapPoints(data.months, basis),
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <ToggleGroup value={basis} options={[{ value: "accrual", label: "Accrual" }, { value: "cash", label: "Cash" }]} onChange={setBasis} />
      </div>
      <PeriodicComposedTrendChart
        data={mapped}
        bars={[{ key: "income", label: "Income" }, { key: "expenses", label: "Expenses" }]}
        line={{ key: "profit", label: "Profit" }}
        currency={currency}
      />
    </div>
  );
}

function revenuePointToRecord(point: RevenueTrendPoint): Record<string, string | number> {
  return { label: point.label, total: point.total, paid: point.paid, unpaid: point.unpaid, refund: point.refund, overdue: point.overdue };
}

function mapPoints(points: ProfitLossTrendPoint[], basis: "accrual" | "cash") {
  return points.map((point) => ({
    label: point.label,
    income: basis === "accrual" ? point.incomeAccrual : point.incomeCash,
    expenses: basis === "accrual" ? point.expensesAccrual : point.expensesCash,
    profit: basis === "accrual" ? point.profitAccrual : point.profitCash,
  }));
}
