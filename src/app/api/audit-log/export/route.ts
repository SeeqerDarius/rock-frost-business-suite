import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireCurrentTenant } from "@/lib/tenant";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getServerAuthSession } from "@/lib/auth/session";
import { logAuditEvent } from "@/lib/audit";
import type { Prisma } from "@prisma/client";
import { tenantAuditWhere } from "@/lib/audit-scope";

function csvEscape(value: unknown): string {
  let str = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@]/.test(str)) str = `'${str}`;
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Streams the current organization's audit log as CSV, respecting the same
 * filters the viewer page (src/app/app/(overview)/administration/audit-log/page.tsx)
 * applies — this route reads the identical query-string keys. Gated on
 * audit.export (distinct from audit.view, per the spec: viewing and
 * exporting are separate privileges). The export itself is audited.
 */
export async function GET(request: NextRequest) {
  let tenant;
  try {
    tenant = await requireCurrentTenant();
  } catch {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  if (!hasPermission(tenant, PERMISSIONS.AUDIT_EXPORT)) {
    return NextResponse.json({ error: "You don't have permission to export the audit log." }, { status: 403 });
  }

  const params = request.nextUrl.searchParams;
  const where: Prisma.AuditLogWhereInput = tenantAuditWhere(tenant.organizationId);
  const from = params.get("from");
  const to = params.get("to");
  if (from) where.createdAt = { ...(where.createdAt as object), gte: new Date(`${from}T00:00:00`) };
  if (to) where.createdAt = { ...(where.createdAt as object), lte: new Date(`${to}T23:59:59`) };
  const moduleParam = params.get("module");
  if (moduleParam) where.module = moduleParam;
  const action = params.get("action");
  if (action) where.action = { contains: action, mode: "insensitive" };
  const entityName = params.get("entityName");
  if (entityName) where.entityName = entityName;
  const status = params.get("status");
  if (status === "SUCCESS" || status === "FAILURE") where.status = status;
  const actorId = params.get("actorId");
  if (actorId) where.userId = actorId;

  const entries = await db.auditLog.findMany({
    where,
    include: { user: true },
    orderBy: { createdAt: "desc" },
    take: 10_000,
  });

  const header = ["Timestamp", "Actor", "Module", "Action", "Entity type", "Entity ID", "Status", "Correlation ID"];
  const rows = entries.map((entry) => [
    entry.createdAt.toISOString(),
    entry.user?.name ?? entry.user?.email ?? "System",
    entry.module ?? "",
    entry.action,
    entry.entityName,
    entry.entityId ?? "",
    entry.status,
    entry.correlationId ?? "",
  ]);
  const csv = [header, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");

  const session = await getServerAuthSession();
  await logAuditEvent({
    organizationId: tenant.organizationId,
    userId: session?.user?.id,
    module: "administration",
    action: "audit_log.exported",
    entityName: "AuditLog",
    metadata: { rowCount: entries.length, filters: Object.fromEntries(params.entries()) },
  });

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="audit-log-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
