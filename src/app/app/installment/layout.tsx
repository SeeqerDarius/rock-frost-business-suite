import { Lock } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { EmptyState } from "@/components/feedback/empty-state";
import { getInstallmentNavigationForTenant } from "@/modules/installment/navigation-access";
import { requireCurrentTenant } from "@/lib/tenant";
import { canAccessModule } from "@/lib/auth/permissions";

export default async function InstallmentLayout({ children }: { children: React.ReactNode }) {
  const tenant = await requireCurrentTenant();

  if (!canAccessModule(tenant, "installment")) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <EmptyState
          icon={Lock}
          title="Installment Management isn't available to you"
          description="Either your organization hasn't enabled this module, or your role doesn't include Installment access. Contact an administrator if you believe this is a mistake."
        />
      </div>
    );
  }

  const navigation = getInstallmentNavigationForTenant(tenant);

  return (
    <AppShell
      sectionLabel="Installment Management"
      moduleKey="installment"
      navigation={navigation}
      enabledModuleKeys={tenant.accessibleModuleKeys}
      organization={{ organizationId: tenant.organizationId, memberships: tenant.memberships }}
    >
      {children}
    </AppShell>
  );
}
