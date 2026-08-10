import { NextResponse } from "next/server";
import { getCurrentTenant } from "@/lib/tenant";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { buildTenantBackup, parseBackupScope } from "@/lib/backup/tenant-backup";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const tenant = await getCurrentTenant();
  if (!tenant) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(tenant, PERMISSIONS.ORG_SETTINGS_MANAGE)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const scope = parseBackupScope(new URL(request.url).searchParams.get("module"));
  if (!scope) return NextResponse.json({ error: "Invalid module scope" }, { status: 400 });
  const backup = await buildTenantBackup(tenant.organizationId, tenant.organization.tenantCode, scope);
  const date = backup.generatedAt.slice(0, 10);
  return new NextResponse(JSON.stringify(backup), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="rock-frost-${tenant.organization.tenantCode}-${scope}-${date}.json"`,
      "Cache-Control": "private, no-store",
    },
  });
}
