import "server-only";

import type { ReportExportInput } from "@/lib/reports/export";

/** "totalEmployees" -> "Total employees", "on_leave_count" -> "On leave count". */
function humanizeKey(key: string): string {
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/_/g, " ").toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function formatSummaryValue(value: unknown): string {
  if (value == null) return "-";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "number") return Number.isInteger(value) ? value.toLocaleString() : value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

/**
 * Every module's getXSummary(organizationId) already returns exactly the
 * flat stats its Reports page renders as cards - mostly plain numbers,
 * occasionally one nested Record<string, number> breakdown (e.g. HR's
 * departmentCounts). Flattens both into a uniform two-column Metric/Value
 * table so a single report-export path (PDF/Excel) covers every module
 * without a bespoke exporter per module. A nested object's entries are
 * prefixed with their parent's label rather than joined with an em dash -
 * generated report content is customer-facing per AGENTS.md's punctuation
 * rule.
 */
export function summaryToReportInput(params: {
  title: string;
  subtitle?: string;
  generatedAt: Date;
  summary: Record<string, unknown>;
}): ReportExportInput {
  const rows: Record<string, unknown>[] = [];
  for (const [key, value] of Object.entries(params.summary)) {
    const label = humanizeKey(key);
    if (Array.isArray(value)) {
      rows.push({ metric: label, value: formatSummaryValue(value.length) });
    } else if (value !== null && typeof value === "object" && !(value instanceof Date)) {
      const entries = Object.entries(value as Record<string, unknown>);
      if (entries.length === 0) rows.push({ metric: label, value: "None" });
      for (const [subKey, subValue] of entries) rows.push({ metric: `${label}: ${subKey}`, value: formatSummaryValue(subValue) });
    } else {
      rows.push({ metric: label, value: formatSummaryValue(value) });
    }
  }

  return {
    title: params.title,
    subtitle: params.subtitle,
    generatedAt: params.generatedAt,
    columns: [
      { key: "metric", header: "Metric", width: 2 },
      { key: "value", header: "Value", width: 1, align: "right" },
    ],
    rows,
  };
}
