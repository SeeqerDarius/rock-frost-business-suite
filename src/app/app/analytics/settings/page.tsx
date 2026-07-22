import { Lock, Settings as SettingsIcon } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";

export default async function AnalyticsSettingsPage() {
  const tenant = await requireModuleAccess("analytics");

  if (!hasPermission(tenant, PERMISSIONS.ANALYTICS_SETTINGS_MANAGE)) {
    return (
      <div className="space-y-6">
        <PageHeader title="Analytics Settings" description="Module-wide configuration for Analytics." />
        <EmptyState icon={Lock} title="You don't have access to this page" description="Analytics settings are limited to roles with settings permissions." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Analytics Settings" description="Module-wide configuration for Analytics." />
      <EmptyState
        icon={SettingsIcon}
        title="Nothing to configure yet"
        description="Analytics is a read-only aggregation layer over every other enabled module's own data. It has no settings of its own; each source module's own Settings page controls what Analytics reflects here."
      />
    </div>
  );
}
