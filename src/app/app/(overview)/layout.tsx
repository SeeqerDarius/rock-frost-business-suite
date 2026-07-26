import { AppShell } from "@/components/layout/app-shell";
import { getWorkspaceNavigation } from "@/platform/modules/workspace-navigation";
import { requireCurrentTenant } from "@/lib/tenant";
import { isPlatformOperator } from "@/lib/auth/permissions";
import { redirect } from "next/navigation";

export default async function OverviewLayout({ children }: { children: React.ReactNode }) {
  const tenant = await requireCurrentTenant();
  if (isPlatformOperator(tenant)) redirect("/app/platform/dashboard");

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
