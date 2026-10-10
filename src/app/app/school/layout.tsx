import { Lock } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { EmptyState } from "@/components/feedback/empty-state";
import { getSchoolNavigationForTenant } from "@/modules/school/navigation-access";
import { requireCurrentTenant } from "@/lib/tenant";
import { canAccessModule, isNarrowSchoolPortalRole } from "@/lib/auth/permissions";
import { resolveModuleTier } from "@/platform/entitlements/resolve";
import { isSchoolAssignmentsGranted } from "@/lib/platform-communications";

export default async function SchoolLayout({ children }: { children: React.ReactNode }) {
  const tenant = await requireCurrentTenant();
  if (!canAccessModule(tenant, "school")) return <div className="flex min-h-screen items-center justify-center px-6"><EmptyState icon={Lock} title="School Management isn't available to you" description="Your organization must enable School Management and your role must include School permissions." /></div>;
  // The sidebar shows only the pages this organization's School plan
  // includes. One resolve call answers for the portal, guardian messaging
  // and every other feature a tier decides, replacing the separate boolean
  // reads. Assignments & Assessments is read on its own because it is a
  // priced add-on rather than a rung on the ladder. Each page still
  // re-checks server-side, so a hidden link is never the boundary.
  const [entitlement, assignmentsGranted] = await Promise.all([
    resolveModuleTier(tenant.organizationId, "school"),
    isSchoolAssignmentsGranted(tenant.organizationId),
  ]);
  const navigation = getSchoolNavigationForTenant(tenant, entitlement?.features ?? new Set(), assignmentsGranted);
  return <AppShell sectionLabel="School Management" moduleKey="school" navigation={navigation} enabledModuleKeys={tenant.accessibleModuleKeys} organization={{ organizationId: tenant.organizationId, memberships: tenant.memberships }} showModuleLauncher={!isNarrowSchoolPortalRole(tenant)}>{children}</AppShell>;
}
