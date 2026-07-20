import { Lock, Settings as SettingsIcon } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { requireCurrentTenant } from "@/lib/tenant";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";

export default async function ProjectsSettingsPage() {
  const tenant = await requireCurrentTenant();

  if (!hasPermission(tenant, PERMISSIONS.PROJECTS_SETTINGS_MANAGE)) {
    return (
      <div className="space-y-6">
        <PageHeader title="Projects Settings" description="Module-wide configuration for Project Management." />
        <EmptyState icon={Lock} title="You don't have access to this page" description="Projects settings are limited to roles with settings permissions." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Projects Settings" description="Module-wide configuration for Project Management." />
      <EmptyState
        icon={SettingsIcon}
        title="Nothing to configure yet"
        description="Project codes are generated automatically, and task/milestone statuses and priorities are fixed. There are no module-wide settings to manage yet — this page is reserved for future configuration."
      />
    </div>
  );
}
