"use client";

import { useState, useSyncExternalStore } from "react";
import { Area, AreaChart, Bar, BarChart, Cell, ComposedChart, Legend, Line, LineChart, Pie, PieChart, PolarAngleAxis, RadialBar, RadialBarChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
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
  target,
}: {
  data: Record<string, string | number>[];
  series: { key: string; label: string }[];
  currency?: string | null;
  valueFormat?: "money" | "count" | "percentage";
  target?: { amount: number; label: string; actualKey: string };
}) {
  const [style, setStyle] = useTrendChartStyle();
  const hasData = data.length > 0 && data.some((row) => series.some((s) => row[s.key] !== undefined && row[s.key] !== null && Number.isFinite(Number(row[s.key]))));
  if (!hasData) return <NoData label="No activity yet for this period." />;
  const formatValue = (value: number) => valueFormat === "money" ? formatMoney(value, currency) : valueFormat === "percentage" ? `${value}%` : new Intl.NumberFormat("en-US").format(value);
  const compactMoney = (value: number) => `${currency ?? "GHS"} ${Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value)}`;
  const latest = data[data.length - 1];
  const actual = target && latest ? Number(latest[target.actualKey] ?? 0) : 0;
  const remaining = target ? Math.max(target.amount - actual, 0) : 0;
  const achieved = target?.amount ? (actual / target.amount) * 100 : 0;
  const targetStatus = actual > (target?.amount ?? 0) ? "Exceeded" : actual === (target?.amount ?? 0) ? "Met" : "Below target";
  const common = <><XAxis dataKey="label" interval="preserveStartEnd" minTickGap={24} tickLine={false} axisLine={false} fontSize={12} stroke="var(--muted-foreground)" /><YAxis width={72} tickFormatter={valueFormat === "money" ? compactMoney : undefined} tickLine={false} axisLine={false} fontSize={11} stroke="var(--muted-foreground)" /><Tooltip labelFormatter={(label) => `Period: ${label}`} contentStyle={tooltipStyle} formatter={((value: number, name: string) => [formatValue(value), name]) as (...args: unknown[]) => [string, string]} /><Legend wrapperStyle={{ fontSize: 12 }} />{target ? <ReferenceLine y={target.amount} stroke="var(--destructive)" strokeDasharray="5 4" label={{ value: `${target.label}: ${formatValue(target.amount)}`, position: "insideTopLeft", fill: "var(--foreground)", fontSize: 11 }} /> : null}</>;

  return (
    <div className="space-y-3">
      <div className="flex justify-end"><ChartStyleToggle value={style} onChange={setStyle} /></div>
      {target ? <div className="grid grid-cols-2 gap-2 rounded-lg border bg-muted/30 p-3 text-xs sm:grid-cols-4"><span><span className="text-muted-foreground">Target</span><strong className="block">{formatValue(target.amount)}</strong></span><span><span className="text-muted-foreground">Actual</span><strong className="block">{formatValue(actual)}</strong></span><span><span className="text-muted-foreground">Remaining</span><strong className="block">{formatValue(remaining)}</strong></span><span><span className="text-muted-foreground">Achievement</span><strong className="block">{Math.round(achieved)}% · {targetStatus}</strong></span></div> : null}
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

type GaugeUnit = "percent" | "ratio" | "days" | "money";
type GaugeTone = "red" | "amber" | "green" | "neutral";

/** Not CSS variables like CHART_COLORS - a gauge's color carries semantic meaning (red/amber/green), not theme identity, so it must render the same hue in both themes rather than following the theme's own accent palette. */
const GAUGE_TONE_COLORS: Record<GaugeTone, string> = {
  red: "var(--destructive)",
  amber: "#f59e0b",
  green: "#10b981",
  neutral: "var(--muted-foreground)",
};

function formatGaugeBound(value: number, unit: GaugeUnit, currency?: string | null) {
  if (unit === "percent") return `${value.toFixed(0)}%`;
  if (unit === "ratio") return `${value.toFixed(1)}x`;
  if (unit === "days") return `${value.toFixed(0)}d`;
  return formatMoney(value, currency);
}

/**
 * A semicircular benchmark gauge: value's own fill color (red/amber/green)
 * carries the tone, rather than a multi-color band drawn behind it - simpler
 * to build correctly and reads just as clearly as a colored-zone track.
 */
export function GaugeChart({
  value,
  displayValue,
  min,
  max,
  unit,
  currency,
  tone,
  label,
  formula,
  interpretation,
}: {
  value: number | null;
  displayValue: string;
  min: number;
  max: number;
  unit: GaugeUnit;
  currency?: string | null;
  tone: GaugeTone;
  label: string;
  formula: string;
  interpretation: string;
}) {
  const clamped = value === null ? min : Math.min(max, Math.max(min, value));
  const color = GAUGE_TONE_COLORS[tone];

  return (
    <div className="flex flex-col gap-2 rounded-lg border p-4">
      <p className="text-sm font-medium">{label}</p>
      <div className="relative h-[100px] w-full" role="img" aria-label={`${label}: ${displayValue}`}>
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart cx="50%" cy="95%" innerRadius="70%" outerRadius="100%" barSize={12} data={[{ value: clamped }]} startAngle={180} endAngle={0}>
            <PolarAngleAxis type="number" domain={[min, max]} angleAxisId={0} tick={false} />
            <RadialBar background={{ fill: "var(--muted)" }} dataKey="value" cornerRadius={6} fill={color} isAnimationActive={false} />
          </RadialBarChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-x-3 bottom-0 flex items-end justify-between text-[10px] text-muted-foreground">
          <span>{formatGaugeBound(min, unit, currency)}</span>
          <span>{formatGaugeBound(max, unit, currency)}</span>
        </div>
        <div className="pointer-events-none absolute inset-x-0 top-1/2 text-center text-lg font-semibold tabular-nums" style={{ color }}>
          {displayValue}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{formula}</p>
      <p className="text-xs text-muted-foreground">{interpretation}</p>
    </div>
  );
}

/** N bars + one overlaid line on a shared category axis - Recharts's ComposedChart, following the same color/tooltip/a11y conventions as TrendChart. */
export function ComposedTrendChart({
  data,
  bars,
  line,
  currency,
}: {
  data: Record<string, string | number>[];
  bars: { key: string; label: string }[];
  line: { key: string; label: string };
  currency?: string | null;
}) {
  const hasData = data.length > 0 && data.some((row) => [...bars.map((b) => b.key), line.key].some((key) => row[key] !== undefined && row[key] !== null && Number.isFinite(Number(row[key]))));
  if (!hasData) return <NoData label="No activity yet for this period." />;
  const compactMoney = (value: number) => `${currency ?? "GHS"} ${Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value)}`;

  return (
    <div className="space-y-3">
      <div role="img" aria-label="Income, expenses, and profit chart" className="h-[220px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
            <XAxis dataKey="label" interval="preserveStartEnd" minTickGap={24} tickLine={false} axisLine={false} fontSize={12} stroke="var(--muted-foreground)" />
            <YAxis width={72} tickFormatter={compactMoney} tickLine={false} axisLine={false} fontSize={11} stroke="var(--muted-foreground)" />
            <Tooltip labelFormatter={(label) => `Period: ${label}`} contentStyle={tooltipStyle} formatter={((value: number, name: string) => [formatMoney(value, currency), name]) as (...args: unknown[]) => [string, string]} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {bars.map((bar, i) => <Bar key={bar.key} dataKey={bar.key} name={bar.label} fill={CHART_COLORS[i % CHART_COLORS.length]} radius={[4, 4, 0, 0]} isAnimationActive={false} />)}
            <Line type="monotone" dataKey={line.key} name={line.label} stroke={CHART_COLORS[bars.length % CHART_COLORS.length]} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <ChartDataTable
        caption={`Trend data: ${[...bars.map((b) => b.label), line.label].join(", ")}`}
        columns={[...bars.map((b) => b.label), line.label]}
        rows={data.map((row) => ({ label: String(row.label), values: [...bars.map((b) => formatMoney(Number(row[b.key]), currency)), formatMoney(Number(row[line.key]), currency)] }))}
      />
    </div>
  );
}

/** Wraps ComposedTrendChart with the same day/week/month period switcher as PeriodicTrendChart, duplicated rather than generalizing the already-shipped component - zero blast radius on its existing call sites. */
export function PeriodicComposedTrendChart({
  data,
  bars,
  line,
  currency,
  defaultPeriod = "months",
}: {
  data: Record<TrendGranularity, Record<string, string | number>[]>;
  bars: { key: string; label: string }[];
  line: { key: string; label: string };
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
      <ComposedTrendChart data={data[period]} bars={bars} line={line} currency={currency} />
    </div>
  );
}
