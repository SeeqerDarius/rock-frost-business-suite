import type { AccountingInsights } from "@/modules/accounting/insights";

export function InsightsChart({ series }: { series: AccountingInsights["series"] }) {
  const data = series.length > 0 ? series : [{ key: "empty", label: "No data", revenue: 0, expenses: 0 }];
  const width = 760;
  const height = 260;
  const padding = 28;
  const maximum = Math.max(1, ...data.flatMap((point) => [point.revenue, point.expenses]));
  const x = (index: number) => padding + (index * (width - padding * 2)) / Math.max(1, data.length - 1);
  const y = (value: number) => height - padding - (Math.max(0, value) / maximum) * (height - padding * 2);
  const revenuePoints = data.map((point, index) => `${x(index)},${y(point.revenue)}`).join(" ");
  const expensePoints = data.map((point, index) => `${x(index)},${y(point.expenses)}`).join(" ");
  const labelIndexes = [...new Set([0, Math.floor((data.length - 1) / 2), data.length - 1])];

  return (
    <div className="space-y-3">
      <div className="flex gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-primary" />Revenue</span>
        <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-amber-500" />Expenses</span>
      </div>
      <div className="overflow-hidden rounded-lg border bg-card p-2">
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Revenue and expense trend" className="h-auto w-full">
          {[0, 0.25, 0.5, 0.75, 1].map((ratio) => (
            <line key={ratio} x1={padding} x2={width - padding} y1={y(maximum * ratio)} y2={y(maximum * ratio)} className="stroke-border" strokeWidth="1" />
          ))}
          <polyline points={revenuePoints} fill="none" className="stroke-primary" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
          <polyline points={expensePoints} fill="none" className="stroke-amber-500" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          {labelIndexes.map((index) => (
            <text key={index} x={x(index)} y={height - 5} textAnchor={index === 0 ? "start" : index === data.length - 1 ? "end" : "middle"} className="fill-muted-foreground text-[11px]">
              {data[index]?.label}
            </text>
          ))}
        </svg>
      </div>
    </div>
  );
}
