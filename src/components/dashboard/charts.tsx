"use client";

import { Area, AreaChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { cn } from "@/lib/utils";

/** The same five chart tokens declared in globals.css for both themes - never a hardcoded hex here, so charts stay in sync with the active theme automatically. */
const CHART_COLORS = ["var(--color-chart-1)", "var(--color-chart-2)", "var(--color-chart-3)", "var(--color-chart-4)", "var(--color-chart-5)"];

const tooltipStyle = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  fontSize: 12,
  color: "var(--popover-foreground)",
};

function NoData({ label }: { label: string }) {
  return <div className="flex h-[220px] items-center justify-center text-sm text-muted-foreground">{label}</div>;
}

export function TrendAreaChart({
  data,
  series,
  valueFormatter,
}: {
  data: Record<string, string | number>[];
  series: { key: string; label: string }[];
  valueFormatter?: (value: number) => string;
}) {
  const hasData = data.some((row) => series.some((s) => Number(row[s.key]) > 0));
  if (!hasData) return <NoData label="No activity yet for this period." />;

  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
        <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} stroke="var(--muted-foreground)" />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={((value: number, name: string) => [valueFormatter ? valueFormatter(value) : value, name]) as (...args: unknown[]) => [string | number, string]}
        />
        {series.map((s, i) => (
          <Area
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.label}
            stroke={CHART_COLORS[i % CHART_COLORS.length]}
            fill={CHART_COLORS[i % CHART_COLORS.length]}
            fillOpacity={0.15}
            strokeWidth={2}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function BreakdownDonutChart({
  data,
  valueFormatter,
  className,
}: {
  data: { label: string; value: number }[];
  valueFormatter?: (value: number) => string;
  className?: string;
}) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  if (total <= 0) return <NoData label="No data available yet." />;

  return (
    <div className={cn("flex flex-col items-center gap-4 sm:flex-row", className)}>
      <ResponsiveContainer width={150} height={150} className="shrink-0">
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="label" innerRadius={42} outerRadius={64} paddingAngle={2} stroke="none">
            {data.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
          </Pie>
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={((value: number) => (valueFormatter ? valueFormatter(value) : value)) as (...args: unknown[]) => string | number}
          />
        </PieChart>
      </ResponsiveContainer>
      <ul className="w-full space-y-1.5 text-xs">
        {data.map((d, i) => (
          <li key={d.label} className="flex items-center gap-2">
            <span className="size-2 shrink-0 rounded-full" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} aria-hidden="true" />
            <span className="flex-1 truncate text-muted-foreground">{d.label}</span>
            <span className="font-medium tabular-nums">{Math.round((d.value / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
