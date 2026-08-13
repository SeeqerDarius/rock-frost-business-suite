import { Lock } from "lucide-react";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentTenant } from "@/lib/tenant";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { EmptyState } from "@/components/feedback/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { BackupControls } from "./backup-controls";
import { resolveActiveTenantModuleKeys } from "@/lib/active-tenant-modules";
import { BACKUP_MODULES, type BackupModule } from "@/lib/backup/scopes";

export default async function OrganizationBackupsPage() {
  const tenant = await getCurrentTenant();
  if (!tenant) redirect("/login");
  const canExport = hasPermission(tenant, PERMISSIONS.ORG_DATA_EXPORT);
  const canRestore = hasPermission(tenant, PERMISSIONS.ORG_SETTINGS_MANAGE);
  if (!canExport && !canRestore) return <EmptyState icon={Lock} title="Access denied" description="Your role does not include data export or backup restore access." />;
  const [user, activeKeys] = await Promise.all([
    db.user.findUnique({ where: { id: tenant.userId }, select: { twoFactorEnabled: true } }),
    resolveActiveTenantModuleKeys(tenant.organizationId, tenant.enabledModuleKeys),
  ]);
  const activeModules = activeKeys.filter((key): key is BackupModule => BACKUP_MODULES.includes(key as BackupModule));
  return <div className="space-y-6">
    <PageHeader title="Module data backup" description="Portable, tenant-isolated exports and protected merge restores for every business module." />
    <BackupControls tenantCode={tenant.organization.tenantCode} twoFactorEnabled={user?.twoFactorEnabled ?? false} activeModules={activeModules} canExport={canExport} canRestore={canRestore} />
  </div>;
}
