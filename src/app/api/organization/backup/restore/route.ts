import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logAuditEvent } from "@/lib/audit";
import { requireCurrentTenant } from "@/lib/tenant";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { verifyCurrentPassword } from "@/lib/auth/verify-password";
import { decryptTotpSecret, verifyTotpCode } from "@/lib/auth/totp";
import { mergeTenantBackup, validateTenantBackup } from "@/lib/backup/tenant-backup";

const MAX_BACKUP_BYTES = 4 * 1024 * 1024;

export async function POST(request: Request) {
  const tenant = await requireCurrentTenant();
  if (!hasPermission(tenant, PERMISSIONS.ORG_SETTINGS_MANAGE)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const formData = await request.formData();
  if (String(formData.get("confirmation") ?? "").trim() !== `RESTORE ${tenant.organization.tenantCode}`) {
    return NextResponse.json({ error: `Type RESTORE ${tenant.organization.tenantCode} to confirm.` }, { status: 400 });
  }
  if (!(await verifyCurrentPassword(tenant.userId, String(formData.get("currentPassword") ?? "")))) {
    return NextResponse.json({ error: "Current password is incorrect." }, { status: 403 });
  }
  const user = await db.user.findUnique({ where: { id: tenant.userId }, select: { twoFactorEnabled: true, twoFactorSecret: true } });
  if (user?.twoFactorEnabled) {
    let valid = false;
    try { valid = !!user.twoFactorSecret && verifyTotpCode(decryptTotpSecret(user.twoFactorSecret), String(formData.get("twoFactorCode") ?? "")); } catch { valid = false; }
    if (!valid) return NextResponse.json({ error: "A valid authenticator code is required." }, { status: 403 });
  }
  const file = formData.get("backup");
  if (!(file instanceof File) || !file.size || file.size > MAX_BACKUP_BYTES) return NextResponse.json({ error: "Choose a backup file no larger than 4 MB." }, { status: 400 });
  let parsed: unknown;
  try { parsed = JSON.parse(await file.text()); } catch { return NextResponse.json({ error: "Invalid backup JSON." }, { status: 400 }); }
  if (!validateTenantBackup(parsed, tenant.organizationId, tenant.organization.tenantCode)) return NextResponse.json({ error: "This backup does not belong to the active organization or contains invalid data." }, { status: 400 });
  const result = await mergeTenantBackup(parsed);
  await logAuditEvent({ organizationId: tenant.organizationId, userId: tenant.userId, module: "administration", action: "tenant_backup.restored", entityName: "Organization", entityId: tenant.organizationId, metadata: { scope: parsed.scope, restored: result.restored, models: result.models, generatedAt: parsed.generatedAt } });
  return NextResponse.json({ ok: true, ...result });
}
