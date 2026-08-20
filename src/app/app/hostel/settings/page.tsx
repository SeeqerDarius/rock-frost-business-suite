import { Lock, Settings2 } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";

export default async function HostelSettingsPage() {
  const tenant = await requireModuleAccess("hostel");
  const canManage = hasPermission(tenant, PERMISSIONS.HOSTEL_SETTINGS_MANAGE);

  if (!canManage) {
    return (
      <div className="space-y-6">
        <PageHeader title="Hostel Settings" description="Module-wide configuration for Hostel Management." />
        <EmptyState icon={Lock} title="You don't have access to this page" description="Hostel settings are limited to roles with settings permissions." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Hostel Settings" description="Module-wide configuration for Hostel Management." />
      <EmptyState
        icon={Settings2}
        title="No hostel-wide settings yet"
        description="Building, room, warden, and fee configuration all live on their own pages today. A dedicated settings surface (invoice numbering prefix, default check-in/out policy, and similar) will appear here once there's real configuration behind it."
      />
    </div>
  );
}
