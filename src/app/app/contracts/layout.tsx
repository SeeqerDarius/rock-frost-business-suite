import { Lock } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { EmptyState } from "@/components/feedback/empty-state";
import { contractsNavigation } from "@/modules/contracts/navigation";
import { requireCurrentTenant } from "@/lib/tenant";
import { canAccessModule } from "@/lib/auth/permissions";

export default async function ContractsLayout({ children }: { children: React.ReactNode }) {
  const tenant = await requireCurrentTenant();

  if (!canAccessModule(tenant, "contracts")) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <EmptyState
          icon={Lock}
          title="Contract Management isn't available to you"
          description="Either your organization hasn't enabled this module, or your role doesn't include Contract Management access. Contact an administrator if you believe this is a mistake."
        />
      </div>
    );
  }

  return (
    <AppShell
      sectionLabel="Contract Management"
      moduleKey="contracts"
      navigation={contractsNavigation}
      enabledModuleKeys={tenant.accessibleModuleKeys}
      organization={{ organizationId: tenant.organizationId, memberships: tenant.memberships }}
    >
      {children}
    </AppShell>
  );
}
