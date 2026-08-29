"use client";

import { useState, useSyncExternalStore } from "react";
import { Area, AreaChart, Bar, BarChart, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/currency";
import type { TrendGranularity } from "@/lib/trend-buckets";

const PERIOD_LABELS: Record<TrendGranularity, string> = {
  days: "Last 6 days",
  weeks: "Last 6 weeks",
  months: "Last 6 months",
};

/** The same five chart tokens declared in globals.css for both themes - never a hardcoded hex here, so charts stay in sync with the active theme automatically. */
const CHART_COLORS = ["var(--color-chart-1)", "var(--color-chart-2)", "var(--color-chart-3)", "var(--color-chart-4)", "var(--color-chart-5)"];
export type TrendChartStyle = "curved" | "zigzag" | "bars";
const STYLE_STORAGE_KEY = "rock-frost-trend-chart-style";
const STYLE_OPTIONS: { value: TrendChartStyle; label: string; description: string }[] = [
  { value: "curved", label: "Curved", description: "Shows the overall direction with a smooth line." },
  { value: "zigzag", label: "Zigzag", description: "Shows direct period-to-period changes." },
  { value: "bars", label: "Bars", description: "Compares the value of each period." },
];

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

/**
 * Recharts renders to an unlabeled <svg> with no data exposed to assistive
 * tech - this sr-only table is the only way a screen reader user gets the
 * actual numbers behind a chart. Built from the same data already passed to
 * the visual chart, so every existing caller gets this for free with no
 * prop or call-site change.
 */
function ChartDataTable({ caption, columns, rows }: { caption: string; columns: string[]; rows: { label: string; values: string[] }[] }) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <thead>
        <tr>
          <th scope="col" />
          {columns.map((column) => <th key={column} scope="col">{column}</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.label}>
            <th scope="row">{row.label}</th>
            {row.values.map((value, i) => <td key={columns[i]}>{value}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * Formats a tooltip value as money directly inside this client component,
 * rather than accepting a formatter function as a prop - a function passed
 * from a Server Component parent can't cross the client-component boundary
 * (confirmed live in production: "Functions cannot be passed directly to
 * Client Components"). A currency code is a plain, serializable string, so
 * it passes through the RSC boundary safely.
 */
function ChartStyleToggle({ value, onChange }: { value: TrendChartStyle; onChange: (value: TrendChartStyle) => void }) {
  return <div role="group" aria-label="Chart style" className="inline-flex rounded-lg border bg-muted/60 p-0.5 text-xs">
    {STYLE_OPTIONS.map((option) => <button key={option.value} type="button" title={option.description} aria-label={`${option.label}. ${option.description}`} aria-pressed={value === option.value} onClick={() => onChange(option.value)} className={cn("min-h-8 rounded-md px-2.5 font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", value === option.value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>{option.label}</button>)}
  </div>;
}

function useTrendChartStyle() {
  const subscribe = (onChange: () => void) => {
    window.addEventListener("rock-frost-chart-style", onChange);
    return () => window.removeEventListener("rock-frost-chart-style", onChange);
  };
  const getSnapshot = (): TrendChartStyle => {
    const stored = sessionStorage.getItem(STYLE_STORAGE_KEY);
    return stored === "zigzag" || stored === "bars" ? stored : "curved";
  };
  const style = useSyncExternalStore<TrendChartStyle>(subscribe, getSnapshot, (): TrendChartStyle => "curved");
  const setStyle = (next: TrendChartStyle) => {
    sessionStorage.setItem(STYLE_STORAGE_KEY, next);
    window.dispatchEvent(new Event("rock-frost-chart-style"));
  };
  return [style, setStyle] as const;
}

export function TrendChart({
  data,
  series,
  currency,
  valueFormat = "money",
}: {
  data: Record<string, string | number>[];
  series: { key: string; label: string }[];
  currency?: string | null;
  valueFormat?: "money" | "count" | "percentage";
}) {
  const [style, setStyle] = useTrendChartStyle();
  const hasData = data.length > 0 && data.some((row) => series.some((s) => row[s.key] !== undefined && row[s.key] !== null && Number.isFinite(Number(row[s.key]))));
  if (!hasData) return <NoData label="No activity yet for this period." />;
  const formatValue = (value: number) => valueFormat === "money" ? formatMoney(value, currency) : valueFormat === "percentage" ? `${value}%` : new Intl.NumberFormat("en-US").format(value);
  const common = <><XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} stroke="var(--muted-foreground)" /><YAxis width={8} tick={false} axisLine={false} tickLine={false} /><Tooltip contentStyle={tooltipStyle} formatter={((value: number, name: string) => [formatValue(value), name]) as (...args: unknown[]) => [string, string]} /><Legend wrapperStyle={{ fontSize: 12 }} /></>;

  return (
    <div className="space-y-3">
      <div className="flex justify-end"><ChartStyleToggle value={style} onChange={setStyle} /></div>
      <div role="img" aria-label={`${STYLE_OPTIONS.find((option) => option.value === style)?.label} trend chart`} className="h-[220px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          {style === "bars" ? <BarChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>{common}{series.map((s, i) => <Bar key={s.key} dataKey={s.key} name={s.label} fill={CHART_COLORS[i % CHART_COLORS.length]} radius={[4, 4, 0, 0]} isAnimationActive={false} />)}</BarChart>
            : style === "zigzag" ? <LineChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>{common}{series.map((s, i) => <Line key={s.key} type="linear" dataKey={s.key} name={s.label} stroke={CHART_COLORS[i % CHART_COLORS.length]} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} isAnimationActive={false} />)}</LineChart>
              : <AreaChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>{common}{series.map((s, i) => <Area key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={CHART_COLORS[i % CHART_COLORS.length]} fill={CHART_COLORS[i % CHART_COLORS.length]} fillOpacity={0.15} strokeWidth={2} isAnimationActive={false} />)}</AreaChart>}
        </ResponsiveContainer>
      </div>
      <ChartDataTable caption={`Trend data: ${series.map((s) => s.label).join(", ")}`} columns={series.map((s) => s.label)} rows={data.map((row) => ({ label: String(row.label), values: series.map((s) => formatValue(Number(row[s.key]))) }))} />
    </div>
  );
}

export const TrendAreaChart = TrendChart;

/**
 * Wraps TrendAreaChart with a day/week/month period switcher. All three
 * granularities are pre-computed server-side and handed over together, so
 * switching between them is instant - no extra request, no loading state.
 */
export function PeriodicTrendChart({
  data,
  series,
  currency,
  defaultPeriod = "months",
}: {
  data: Record<TrendGranularity, Record<string, string | number>[]>;
  series: { key: string; label: string }[];
  currency?: string | null;
  defaultPeriod?: TrendGranularity;
}) {
  const [period, setPeriod] = useState<TrendGranularity>(defaultPeriod);

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <div className="inline-flex rounded-lg bg-muted p-0.5 text-xs">
          {(Object.keys(PERIOD_LABELS) as TrendGranularity[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              aria-pressed={period === p}
              className={cn(
                "rounded-md px-2.5 py-1 font-medium transition-colors",
                period === p ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
      </div>
      <TrendChart data={data[period]} series={series} currency={currency} />
    </div>
  );
}

export function BreakdownDonutChart({
  data,
  currency,
  className,
  valueFormat = "money",
}: {
  data: { label: string; value: number }[];
  currency?: string | null;
  className?: string;
  /** "count" renders the tooltip as a plain number (e.g. vehicles by status) instead of running it through formatMoney. */
  valueFormat?: "money" | "count";
}) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  if (total <= 0) return <NoData label="No data available yet." />;
  const formatValue = (value: number) => (valueFormat === "count" ? new Intl.NumberFormat("en-US").format(value) : formatMoney(value, currency));

  return (
    <div className={cn("flex flex-col items-center gap-4 sm:flex-row", className)}>
      <ResponsiveContainer width={150} height={150} className="shrink-0">
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="label" innerRadius={42} outerRadius={64} paddingAngle={2} stroke="none">
            {data.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
          </Pie>
          <Tooltip contentStyle={tooltipStyle} formatter={((value: number) => formatValue(value)) as (...args: unknown[]) => string} />
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
      <ChartDataTable
        caption="Breakdown data"
        columns={["Value", "Share"]}
        rows={data.map((d) => ({ label: d.label, values: [formatValue(d.value), `${Math.round((d.value / total) * 100)}%`] }))}
      />
    </div>
  );
}
