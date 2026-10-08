import { NextResponse } from "next/server";
import { getCurrentTenant } from "@/lib/tenant";
import { canAccessModule, hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getExemptionReport, getOssReturn, getTaxReport, type TaxReportView } from "@/modules/tax/reports";

const VIEWS: TaxReportView[] = ["jurisdiction", "level", "kind", "authority", "period"];

function csvCell(value: string) {
  // Neutralize spreadsheet formula injection and quote every cell.
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}

export async function GET(request: Request) {
  const tenant = await getCurrentTenant();
  if (!tenant) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canAccessModule(tenant, "accounting") || !hasPermission(tenant, PERMISSIONS.ACCOUNTING_REPORTS_VIEW)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const url = new URL(request.url);
  const from = url.searchParams.get("from") ?? "";
  const to = url.searchParams.get("to") ?? "";
  const view = url.searchParams.get("view") ?? "jurisdiction";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return NextResponse.json({ error: "Invalid period" }, { status: 400 });

  let lines: string[][];
  if (view === "oss") {
    const oss = await getOssReturn(tenant.organizationId, { from, to });
    lines = [["Member state of consumption", "VAT rate", "Taxable amount", "VAT", "Documents", "Currency"], ...oss.rows.map((row) => [row.memberState, row.rate.toString(), row.taxableAmount.toFixed(2), row.vatAmount.toFixed(2), String(row.documents), oss.baseCurrency]), ["Total", "", "", oss.totalVat.toFixed(2), "", oss.baseCurrency]];
  } else if (view === "exemptions") {
    const rows = await getExemptionReport(tenant.organizationId, { from, to });
    lines = [["Customer", "Certificates", "Documents", "Exempt sales"], ...rows.map((row) => [row.customer, row.certificates.join("; "), row.documents.join(" "), row.exemptSales.toFixed(2)])];
  } else if ((VIEWS as string[]).includes(view)) {
    const report = await getTaxReport(tenant.organizationId, { from, to, view: view as TaxReportView });
    lines = [
      ["Group", "Level", "Taxable sales", "Zero-rated", "Exempt", "Non-taxable", "Reverse charge", "Tax collected", "Input tax", "Self-assessed", "Adjustments", "Net payable", "Currency"],
      ...[...report.rows, report.totals].map((row) => [row.label, row.level ?? "", row.taxableSales, row.zeroRatedSales, row.exemptSales, row.nonTaxableSales, row.reverseChargeSales, row.taxCollected, row.inputTax, row.selfAssessed, row.adjustments, row.netPayable].map((cell) => (typeof cell === "string" ? cell : cell.toFixed(2))).concat(report.baseCurrency)),
    ];
  } else {
    return NextResponse.json({ error: "Unknown report" }, { status: 400 });
  }
  const body = lines.map((line) => line.map(csvCell).join(",")).join("\r\n");
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="tax-${view}-${from}-to-${to}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
