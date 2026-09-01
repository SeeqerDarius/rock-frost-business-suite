import { Lock } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { EmptyState } from "@/components/feedback/empty-state";
import { getInventoryProcurementNavigation, getInventoryProcurementSectionLabel } from "@/modules/inventory-procurement/navigation";
import { requireCurrentTenant } from "@/lib/tenant";
import { canAccessModule } from "@/lib/auth/permissions";

export default async function ProcurementLayout({ children }: { children: React.ReactNode }) {
  const tenant = await requireCurrentTenant();

  if (!canAccessModule(tenant, "procurement")) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <EmptyState
          icon={Lock}
          title="Procurement isn't available to you"
          description="Either your organization hasn't enabled this module, or your role doesn't include Procurement access. Contact an administrator if you believe this is a mistake."
        />
      </div>
    );
  }

  const access = { hasInventory: canAccessModule(tenant, "inventory"), hasProcurement: true };

  return (
    <AppShell
      sectionLabel={getInventoryProcurementSectionLabel(access)}
      moduleKey="procurement"
      navigation={getInventoryProcurementNavigation(access)}
      enabledModuleKeys={tenant.accessibleModuleKeys}
      organization={{ organizationId: tenant.organizationId, memberships: tenant.memberships }}
    >
      {children}
    </AppShell>
  );
}
