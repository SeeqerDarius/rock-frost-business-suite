import { Lock } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { EmptyState } from "@/components/feedback/empty-state";
import { payrollNavigation } from "@/modules/payroll/navigation";
import { requireCurrentTenant } from "@/lib/tenant";
import { canAccessModule } from "@/lib/auth/permissions";

export default async function PayrollLayout({ children }: { children: React.ReactNode }) {
  const tenant = await requireCurrentTenant();

  if (!canAccessModule(tenant, "payroll")) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <EmptyState
          icon={Lock}
          title="Payroll isn't available to you"
          description="Either your organization hasn't enabled this module, or your role doesn't include Payroll access. Contact an administrator if you believe this is a mistake."
        />
      </div>
    );
  }

  return (
    <AppShell
      sectionLabel="Payroll"
      navigation={payrollNavigation}
      enabledModuleKeys={tenant.enabledModuleKeys}
      organization={{ organizationId: tenant.organizationId, memberships: tenant.memberships }}
    >
      {children}
    </AppShell>
  );
}
