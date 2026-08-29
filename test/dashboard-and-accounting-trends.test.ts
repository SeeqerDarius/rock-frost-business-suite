import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * User request: reskin the app's dashboards to include tabbed chart widgets
 * (like a competitor's Sales/Payments panel), after seeing that competitor's
 * live app. Built with real Rock Frost data (posted revenue, real invoices),
 * a small charting library (recharts, the user's own explicit choice over
 * hand-built SVG charts), and the existing Tabs component for the tab style.
 */
describe("dashboard and Accounting overview trend widgets", () => {
  const dashboard = readFileSync("src/app/app/(overview)/dashboard/page.tsx", "utf8");
  const accountingPage = readFileSync("src/app/app/accounting/page.tsx", "utf8");
  const accountingService = readFileSync("src/modules/accounting/service.ts", "utf8");
  const accountingIntegration = readFileSync("src/lib/accounting-integration.ts", "utf8");
  const sidebarNav = readFileSync("src/components/navigation/sidebar-nav.tsx", "utf8");

  it("names the new Accounting overview data function distinctly from the existing, unrelated Accounting Insights page", () => {
    // src/modules/accounting/insights.ts already exports getAccountingInsights
    // for the separate, AI-assistant-backed /app/accounting/insights page -
    // reusing that name here would be a real collision risk for future edits.
    expect(accountingService).toContain("export async function getAccountingOverviewTrends(");
    expect(accountingService).not.toContain("export async function getAccountingInsights(");
    expect(accountingPage).toContain("getAccountingOverviewTrends");
    expect(accountingPage).not.toContain("<CardTitle>Insights</CardTitle>");
  });

  it("gives the Accounting overview page a tabbed Trends card matching the requested tab set", () => {
    for (const tab of ["Invoices", "Profit &amp; Loss", "Recent Invoices", "Overdue Invoices"]) {
      expect(accountingPage).toContain(tab);
    }
    expect(accountingPage).toContain("PeriodicTrendChart");
    expect(accountingPage).toContain("BreakdownDonutChart");
  });

  it("gives the main Dashboard a cross-module revenue widget, only shown when Accounting is actually active", () => {
    expect(dashboard).toContain("getRevenueInsights(tenant.organizationId)");
    expect(dashboard).toContain("revenueInsights ?");
    expect(accountingIntegration).toContain("export async function getRevenueInsights(organizationId: string): Promise<RevenueInsights | null> {");
    expect(accountingIntegration).toContain('if (!(await isModuleActiveForOrg(db, organizationId, "accounting"))) return null;');
  });

  it("keeps the sidebar's icon treatment to one consistent accent color rather than a distinct color per item", () => {
    // Matching IconBadge's own stated rule elsewhere in this codebase: one
    // RF-blue treatment everywhere an icon represents something, not a
    // different color per item the way the reference competitor's menu does.
    expect(sidebarNav).toContain("function NavIcon(");
    expect(sidebarNav).not.toMatch(/bg-(red|green|orange|pink|purple|yellow)-/);
  });

  it("never passes a function prop from a Server Component into the client chart components", () => {
    // Regression coverage for a real production crash: a `valueFormatter`
    // function prop (a server-side closure) can't cross the Server-to-Client
    // Component boundary - "Functions cannot be passed directly to Client
    // Components." The chart components now format currency themselves from
    // a plain, serializable `currency` string instead.
    const charts = readFileSync("src/components/dashboard/charts.tsx", "utf8");
    expect(charts).not.toContain("valueFormatter");
    expect(charts).toContain("currency?: string | null");
    expect(charts).toContain('import { formatMoney } from "@/lib/currency"');
    expect(dashboard).not.toContain("valueFormatter");
    expect(dashboard).toContain("currency={tenant.organization.currency}");
    expect(accountingPage).not.toContain("valueFormatter");
    expect(accountingPage).toContain("currency={tenant.organization.currency}");
  });

  it("lets the user switch every trend chart between last 6 days, weeks, and months", () => {
    // Follow-up user request: the trend period was hardcoded to 6 months.
    // Both data functions now fetch once against the widest lookback window
    // and bucket the same rows three ways, so the client-side switcher needs
    // no extra request when the user picks a different granularity.
    const buckets = readFileSync("src/lib/trend-buckets.ts", "utf8");
    const charts = readFileSync("src/components/dashboard/charts.tsx", "utf8");
    expect(buckets).toContain('export type TrendGranularity = "days" | "weeks" | "months"');
    expect(charts).toContain("export function PeriodicTrendChart(");
    expect(accountingIntegration).toContain("trends: { days: buildSeries(\"days\"), weeks: buildSeries(\"weeks\"), months: buildSeries(\"months\") }");
    expect(accountingService).toContain("trends: { days: buildSeries(\"days\"), weeks: buildSeries(\"weeks\"), months: buildSeries(\"months\") }");
    expect(dashboard).toContain("PeriodicTrendChart");
    expect(accountingPage).toContain("PeriodicTrendChart");
  });

  it("uses one accessible, remembered Curved, Zigzag, and Bars selector across trend charts", () => {
    const charts = readFileSync("src/components/dashboard/charts.tsx", "utf8");
    const insightsChart = readFileSync("src/app/app/accounting/insights/insights-chart.tsx", "utf8");
    for (const label of ["Curved", "Zigzag", "Bars"]) expect(charts).toContain(`label: "${label}"`);
    expect(charts).toContain('role="group" aria-label="Chart style"');
    expect(charts).toContain('aria-pressed={value === option.value}');
    expect(charts).toContain('type="monotone"');
    expect(charts).toContain('type="linear"');
    expect(charts).toContain("<BarChart");
    expect(charts).toContain("sessionStorage.setItem(STYLE_STORAGE_KEY, next)");
    expect(insightsChart).toContain("<TrendChart");
    expect(charts).toContain("tickFormatter={valueFormat === \"money\" ? compactMoney : undefined}");
    expect(charts).toContain("<ReferenceLine y={target.amount}");
    expect(charts).toContain("Below target");
  });
});
