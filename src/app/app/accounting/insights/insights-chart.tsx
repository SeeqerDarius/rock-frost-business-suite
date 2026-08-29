"use client";

import { TrendChart } from "@/components/dashboard/charts";
import type { AccountingInsights } from "@/modules/accounting/insights";

export function InsightsChart({ series, currency }: { series: AccountingInsights["series"]; currency?: string | null }) {
  return <TrendChart data={series} series={[{ key: "revenue", label: "Revenue" }, { key: "expenses", label: "Expenses" }]} currency={currency} />;
}
