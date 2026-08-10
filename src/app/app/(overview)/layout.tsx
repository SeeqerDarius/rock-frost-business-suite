import { AppShell } from "@/components/layout/app-shell";
import { getWorkspaceNavigation } from "@/platform/modules/workspace-navigation";
import { getCurrentTenant } from "@/lib/tenant";
import { isPlatformOperator } from "@/lib/auth/permissions";
import { redirect } from "next/navigation";

export default async function OverviewLayout({ children }: { children: React.ReactNode }) {
  const tenant = await getCurrentTenant();
  if (!tenant) {
    return (
      <main id="main-content" tabIndex={-1} className="flex min-h-screen items-center justify-center px-6 text-center">
        <div className="max-w-md space-y-3">
          <h1 className="text-2xl font-semibold">No organization access</h1>
          <p className="text-sm text-muted-foreground">Your account is not assigned to an organization yet. Contact an administrator to be added to a workspace.</p>
        </div>
      </main>
    );
  }
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
