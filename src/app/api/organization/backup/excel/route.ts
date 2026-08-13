import { NextResponse } from "next/server";
import { getCurrentTenant } from "@/lib/tenant";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { BACKUP_MODULES, type BackupModule } from "@/lib/backup/scopes";
import { resolveActiveTenantModuleKeys } from "@/lib/active-tenant-modules";
import { parseBackupScope, readTenantModuleData, resolveBackupModules } from "@/lib/backup/tenant-backup";
import { buildTenantExcelWorkbook } from "@/lib/backup/tenant-excel";
import { logAuditEvent } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const tenant = await getCurrentTenant();
  if (!tenant) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(tenant, PERMISSIONS.ORG_DATA_EXPORT)) return NextResponse.json({ error: "You do not have permission to export organization data." }, { status: 403 });
  const scope = parseBackupScope(new URL(request.url).searchParams.get("module"));
  if (!scope) return NextResponse.json({ error: "Invalid module scope" }, { status: 400 });
  const activeKeys = await resolveActiveTenantModuleKeys(tenant.organizationId, tenant.enabledModuleKeys);
  const activeBackupModules = activeKeys.filter((key): key is BackupModule => BACKUP_MODULES.includes(key as BackupModule));
  const includedModules = resolveBackupModules(scope, activeBackupModules);
  if (!includedModules) return NextResponse.json({ error: "That module is not active for this organization." }, { status: 403 });

  const generatedAt = new Date();
  const models = await readTenantModuleData(tenant.organizationId, scope, includedModules);
  const workbook = await buildTenantExcelWorkbook({ tenantCode: tenant.organization.tenantCode, scope, includedModules, generatedAt, models });
  await logAuditEvent({
    organizationId: tenant.organizationId,
    userId: tenant.userId,
    module: "administration",
    action: "tenant_data.exported",
    entityName: "Organization",
    entityId: tenant.organizationId,
    metadata: { format: "xlsx", scope, includedModules },
  });
  return new NextResponse(workbook, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="rock-frost-${tenant.organization.tenantCode}-${scope}-${generatedAt.toISOString().slice(0, 10)}.xlsx"`,
      "Cache-Control": "private, no-store",
    },
  });
}
