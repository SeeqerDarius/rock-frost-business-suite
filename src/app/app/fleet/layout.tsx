import { Lock } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { EmptyState } from "@/components/feedback/empty-state";
import { fleetNavigation } from "@/modules/fleet/navigation";
import { requireCurrentTenant } from "@/lib/tenant";
import { canAccessModule } from "@/lib/auth/permissions";

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

  return (
    <AppShell
      sectionLabel="Fleet Management"
      navigation={fleetNavigation}
      enabledModuleKeys={tenant.accessibleModuleKeys}
      organization={{ organizationId: tenant.organizationId, memberships: tenant.memberships }}
    >
      {children}
    </AppShell>
  );
}
