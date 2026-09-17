import { Lock } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { EmptyState } from "@/components/feedback/empty-state";
import { getSchoolNavigationForTenant } from "@/modules/school/navigation-access";
import { requireCurrentTenant } from "@/lib/tenant";
import { canAccessModule, isNarrowSchoolPortalRole } from "@/lib/auth/permissions";
import { isSchoolPortalGranted } from "@/lib/platform-communications";

export default async function SchoolLayout({ children }: { children: React.ReactNode }) {
  const tenant = await requireCurrentTenant();
  if (!canAccessModule(tenant, "school")) return <div className="flex min-h-screen items-center justify-center px-6"><EmptyState icon={Lock} title="School Management isn't available to you" description="Your organization must enable School Management and your role must include School permissions." /></div>;
  const schoolPortalGranted = await isSchoolPortalGranted(tenant.organizationId);
  const navigation = getSchoolNavigationForTenant(tenant, schoolPortalGranted);
  return <AppShell sectionLabel="School Management" moduleKey="school" navigation={navigation} enabledModuleKeys={tenant.accessibleModuleKeys} organization={{ organizationId: tenant.organizationId, memberships: tenant.memberships }} showModuleLauncher={!isNarrowSchoolPortalRole(tenant)}>{children}</AppShell>;
}
