import { NextResponse } from "next/server";
import { getCurrentTenant } from "@/lib/tenant";
import { canAccessModule, hasPermission } from "@/lib/auth/permissions";
import { REPORT_REGISTRY } from "@/lib/reports/registry";
import { summaryToReportInput } from "@/lib/reports/summary-to-report";
import { buildReportExcelWorkbook, buildReportPdf } from "@/lib/reports/export";

/**
 * One shared download endpoint for every module's Reports page rather than
 * a route per module per format - ?format=pdf|xlsx, gated the same way the
 * Reports page itself is (module enabled + that module's *_REPORTS_VIEW
 * permission), then renders the same stats the page already shows as
 * cards into a downloadable table.
 */
export async function GET(request: Request, { params }: { params: Promise<{ moduleKey: string }> }) {
  const tenant = await getCurrentTenant();
  if (!tenant) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { moduleKey } = await params;
  const entry = REPORT_REGISTRY[moduleKey];
  if (!entry) return NextResponse.json({ error: "Unknown report" }, { status: 404 });
  if (!canAccessModule(tenant, entry.moduleKey) || !hasPermission(tenant, entry.permission)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const format = new URL(request.url).searchParams.get("format");
  if (format !== "pdf" && format !== "xlsx") {
    return NextResponse.json({ error: "format must be pdf or xlsx" }, { status: 400 });
  }

  const summary = await entry.getSummary(tenant.organizationId);
  const generatedAt = new Date();
  const input = summaryToReportInput({ title: entry.title, subtitle: tenant.organization.name, generatedAt, summary });
  const filenameBase = `${moduleKey}-report-${generatedAt.toISOString().slice(0, 10)}`;

  if (format === "xlsx") {
    const buffer = await buildReportExcelWorkbook(input);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filenameBase}.xlsx"`,
        "Cache-Control": "private, no-store",
      },
    });
  }

  const buffer = await buildReportPdf(input);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filenameBase}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
