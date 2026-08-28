import { Lock } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { EmptyState } from "@/components/feedback/empty-state";
import { getFleetNavigationForTenant } from "@/modules/fleet/navigation-access";
import { getFullModuleNavigation } from "@/platform/modules/full-navigation";
import { requireCurrentTenant } from "@/lib/tenant";
import { canAccessModule, isFleetDriverRole } from "@/lib/auth/permissions";

export default async function FleetLayout({ children }: { children: React.ReactNode }) {
  const tenant = await requireCurrentTenant();

  if (!canAccessModule(tenant, "fleet")) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <EmptyState
          icon={Lock}
          title="Fleet Management isn't available to you"
          description="Either your organization hasn't enabled this module, or your role doesn't include Fleet access. Contact an administrator if you believe this is a mistake."
        />
      </div>
    );
  }
  const navigation = getFleetNavigationForTenant(tenant);

  return (
    <AppShell
      sectionLabel="Fleet Management"
      moduleKey="fleet"
      navigation={navigation}
      moduleSections={!isFleetDriverRole(tenant) ? getFullModuleNavigation(tenant) : []}
      enabledModuleKeys={tenant.accessibleModuleKeys}
      organization={{ organizationId: tenant.organizationId, memberships: tenant.memberships }}
      showModuleLauncher={!isFleetDriverRole(tenant)}
    >
      {children}
    </AppShell>
  );
}
