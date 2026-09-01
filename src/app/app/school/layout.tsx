import { Lock } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { EmptyState } from "@/components/feedback/empty-state";
import { schoolNavigation } from "@/modules/school/navigation";
import { requireCurrentTenant } from "@/lib/tenant";
import { canAccessModule } from "@/lib/auth/permissions";

export default async function SchoolLayout({ children }: { children: React.ReactNode }) {
  const tenant = await requireCurrentTenant();
  if (!canAccessModule(tenant, "school")) return <div className="flex min-h-screen items-center justify-center px-6"><EmptyState icon={Lock} title="School Management isn't available to you" description="Your organization must enable School Management and your role must include School permissions." /></div>;
  return <AppShell sectionLabel="School Management" moduleKey="school" navigation={schoolNavigation} enabledModuleKeys={tenant.accessibleModuleKeys} organization={{ organizationId: tenant.organizationId, memberships: tenant.memberships }}>{children}</AppShell>;
}
