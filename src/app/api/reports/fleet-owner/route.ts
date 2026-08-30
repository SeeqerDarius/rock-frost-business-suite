import { NextResponse } from "next/server";
import { getCurrentTenant } from "@/lib/tenant";
import { getServerAuthSession } from "@/lib/auth/session";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getFleetOwnerWorkspace } from "@/modules/fleet/owner-workspace";
import { buildFleetOwnerReport, buildFleetOwnerReportExportInput } from "@/modules/fleet/owner-reports";
import { buildReportExcelWorkbook, buildReportPdf } from "@/lib/reports/export";

/**
 * A bespoke export route rather than a REPORT_REGISTRY entry: the registry
 * resolves a report by organizationId alone, but an owner statement must
 * also resolve to one specific owner's own record - the same
 * (organizationId, userId) scope getFleetOwnerWorkspace already enforces for
 * the on-screen Reports tab, re-checked here independently rather than
 * trusted from the page.
 */
export async function GET(request: Request) {
  const tenant = await getCurrentTenant();
  if (!tenant) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(tenant, PERMISSIONS.FLEET_INVESTOR_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const session = await getServerAuthSession();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const format = new URL(request.url).searchParams.get("format");
  if (format !== "pdf" && format !== "xlsx") {
    return NextResponse.json({ error: "format must be pdf or xlsx" }, { status: 400 });
  }

  const workspace = await getFleetOwnerWorkspace(tenant.organizationId, userId);
  if (!workspace) return NextResponse.json({ error: "No owner portfolio linked" }, { status: 404 });

  const report = buildFleetOwnerReport(workspace);
  const currency = tenant.organization.currency ?? "GHS";
  const input = buildFleetOwnerReportExportInput(report, currency, tenant.organization.name);
  const filenameBase = `fleet-owner-statement-${report.generatedAt.toISOString().slice(0, 10)}`;

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
