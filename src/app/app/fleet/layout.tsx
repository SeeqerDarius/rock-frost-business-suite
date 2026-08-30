import { redirect } from "next/navigation";
import { Lock } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { EmptyState } from "@/components/feedback/empty-state";
import { getFleetNavigationForTenant } from "@/modules/fleet/navigation-access";
import { getFullModuleNavigation } from "@/platform/modules/full-navigation";
import { getCurrentTenant } from "@/lib/tenant";
import { canAccessModule, isNarrowFleetSelfServiceRole } from "@/lib/auth/permissions";

export default async function FleetLayout({ children }: { children: React.ReactNode }) {
  // getCurrentTenant() (not requireCurrentTenant()) - the root layout
  // (src/app/app/layout.tsx) already re-checked this moments earlier for the
  // same request, so a null result here reflects a transient tenant-lookup
  // failure rather than a real "no access" state; redirecting to sign back
  // in recovers cleanly instead of throwing a raw 500.
  const tenant = await getCurrentTenant();
  if (!tenant) redirect("/login");

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
      moduleSections={!isNarrowFleetSelfServiceRole(tenant) ? getFullModuleNavigation(tenant) : []}
      enabledModuleKeys={tenant.accessibleModuleKeys}
      organization={{ organizationId: tenant.organizationId, memberships: tenant.memberships }}
      showModuleLauncher={!isNarrowFleetSelfServiceRole(tenant)}
    >
      {children}
    </AppShell>
  );
}
