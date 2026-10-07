import { NextResponse } from "next/server";
import { getCurrentTenant } from "@/lib/tenant";
import { canAccessModule, PERMISSIONS } from "@/lib/auth/permissions";
import { logAuditEvent } from "@/lib/audit";
import { buildReportCsv, buildReportExcelWorkbook, type ReportExportInput } from "@/lib/reports/export";
import { CONTRACT_REPORTS, isContractReportKey, runContractReport } from "@/modules/contracts/reports";
import { actorFromTenant, ContractForbiddenError } from "@/modules/contracts/service";

const EXPORT_LIMIT = 10_000;

function parseDay(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Contract report export (CSV or Excel). Requires the Contracts module,
 * contracts.export, and, for financial reports and columns, contracts.view_financials.
 * Rows are limited to contracts the user can see. Every export is audited.
 */
export async function GET(request: Request, { params }: { params: Promise<{ report: string }> }) {
  const tenant = await getCurrentTenant();
  if (!tenant) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canAccessModule(tenant, "contracts")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const actor = actorFromTenant(tenant);
  if (!actor.permissions.includes(PERMISSIONS.CONTRACTS_EXPORT)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { report } = await params;
  if (!isContractReportKey(report)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const url = new URL(request.url);
  const format = url.searchParams.get("format") === "xlsx" ? "xlsx" : "csv";
  const filters = { from: parseDay(url.searchParams.get("from")), to: parseDay(url.searchParams.get("to")), days: Number(url.searchParams.get("days")) || null };

  let result;
  try {
    result = await runContractReport(actor, report, filters, EXPORT_LIMIT);
  } catch (error) {
    if (error instanceof ContractForbiddenError) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    throw error;
  }
  const generatedAt = new Date();
  const definition = CONTRACT_REPORTS[report];
  const input: ReportExportInput = {
    title: definition.title,
    subtitle: tenant.organization.name,
    generatedAt,
    summary: result.truncated ? [...result.summary, { label: "Note", value: `Limited to the first ${EXPORT_LIMIT} rows` }] : result.summary,
    columns: result.columns.map((column) => ({ key: column.key, header: column.header, align: column.align })),
    rows: result.rows,
  };
  await logAuditEvent({ organizationId: tenant.organizationId, userId: tenant.userId, module: "contracts", action: "contracts.report_exported", entityName: "ContractReport", entityId: report, metadata: { report, format, rows: result.rows.length, from: filters.from?.toISOString().slice(0, 10) ?? null, to: filters.to?.toISOString().slice(0, 10) ?? null } });
  const filename = `contracts-${report}-${generatedAt.toISOString().slice(0, 10)}`;
  const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
  if (format === "xlsx") {
    const buffer = await buildReportExcelWorkbook(input);
    return new NextResponse(new Uint8Array(buffer), { headers: { ...headers, "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${filename}.xlsx"` } });
  }
  return new NextResponse(buildReportCsv(input), { headers: { ...headers, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${filename}.csv"` } });
}
