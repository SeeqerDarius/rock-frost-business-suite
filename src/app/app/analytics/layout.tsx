import { Lock } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { EmptyState } from "@/components/feedback/empty-state";
import { analyticsNavigation } from "@/modules/analytics/navigation";
import { requireCurrentTenant } from "@/lib/tenant";
import { canAccessModule } from "@/lib/auth/permissions";

export default async function AnalyticsLayout({ children }: { children: React.ReactNode }) {
  const tenant = await requireCurrentTenant();

  if (!canAccessModule(tenant, "analytics")) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <EmptyState
          icon={Lock}
          title="Analytics isn't available to you"
          description="Either your organization hasn't enabled this module, or your role doesn't include Analytics access. Contact an administrator if you believe this is a mistake."
        />
      </div>
    );
  }

  return (
    <AppShell
      sectionLabel="Analytics"
      navigation={analyticsNavigation}
      enabledModuleKeys={tenant.accessibleModuleKeys}
      organization={{ organizationId: tenant.organizationId, memberships: tenant.memberships }}
    >
      {children}
    </AppShell>
  );
}
