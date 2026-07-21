import { AppShell } from "@/components/layout/app-shell";
import { getWorkspaceNavigation } from "@/platform/modules/workspace-navigation";
import { requireCurrentTenant } from "@/lib/tenant";

export default async function OverviewLayout({ children }: { children: React.ReactNode }) {
  const tenant = await requireCurrentTenant();

  return (
    <AppShell
      sectionLabel="Workspace"
      navigation={getWorkspaceNavigation(tenant)}
      enabledModuleKeys={tenant.accessibleModuleKeys}
      organization={{ organizationId: tenant.organizationId, memberships: tenant.memberships }}
    >
      {children}
    </AppShell>
  );
}
