import { Lock } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { EmptyState } from "@/components/feedback/empty-state";
import { getInventoryProcurementNavigation, getInventoryProcurementSectionLabel } from "@/modules/inventory-procurement/navigation";
import { requireCurrentTenant } from "@/lib/tenant";
import { canAccessModule } from "@/lib/auth/permissions";

export default async function InventoryLayout({ children }: { children: React.ReactNode }) {
  const tenant = await requireCurrentTenant();

  if (!canAccessModule(tenant, "inventory")) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <EmptyState
          icon={Lock}
          title="Inventory isn't available to you"
          description="Either your organization hasn't enabled this module, or your role doesn't include Inventory access. Contact an administrator if you believe this is a mistake."
        />
      </div>
    );
  }

  const access = { hasInventory: true, hasProcurement: canAccessModule(tenant, "procurement") };

  return (
    <AppShell
      sectionLabel={getInventoryProcurementSectionLabel(access)}
      moduleKey="inventory"
      navigation={getInventoryProcurementNavigation(access)}
      enabledModuleKeys={tenant.accessibleModuleKeys}
      organization={{ organizationId: tenant.organizationId, memberships: tenant.memberships }}
    >
      {children}
    </AppShell>
  );
}
