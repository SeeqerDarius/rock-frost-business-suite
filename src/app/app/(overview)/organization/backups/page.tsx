import { Lock } from "lucide-react";
import { db } from "@/lib/db";
import { requireCurrentTenant } from "@/lib/tenant";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { EmptyState } from "@/components/feedback/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { BackupControls } from "./backup-controls";

export default async function OrganizationBackupsPage() {
  const tenant = await requireCurrentTenant();
  if (!hasPermission(tenant, PERMISSIONS.ORG_SETTINGS_MANAGE)) return <EmptyState icon={Lock} title="Access denied" description="Only organization administrators can manage backups." />;
  const user = await db.user.findUnique({ where: { id: tenant.userId }, select: { twoFactorEnabled: true } });
  return <div className="space-y-6">
    <PageHeader title="Module data backup" description="Portable, tenant-isolated exports and protected merge restores for every business module." />
    <BackupControls tenantCode={tenant.organization.tenantCode} twoFactorEnabled={user?.twoFactorEnabled ?? false} />
  </div>;
}
