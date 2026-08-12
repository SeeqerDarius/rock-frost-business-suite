import { Lock } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { EmptyState } from "@/components/feedback/empty-state";
import { hospitalNavigation } from "@/modules/hospital/navigation";
import { requireCurrentTenant } from "@/lib/tenant";
import { canAccessModule } from "@/lib/auth/permissions";

export default async function HospitalLayout({ children }: { children: React.ReactNode }) {
  const tenant = await requireCurrentTenant().catch((error: unknown) => {
    if (error instanceof Error && error.message === "No organization membership found for the current user.") return null;
    throw error;
  });
  if (!tenant) return null;
  if (!canAccessModule(tenant, "hospital")) return <div className="flex min-h-screen items-center justify-center px-6"><EmptyState icon={Lock} title="Hospital Management isn't available to you" description="Your organization must enable Hospital Management and your role must include Hospital permissions." /></div>;
  return <AppShell sectionLabel="Hospital Management" navigation={hospitalNavigation} enabledModuleKeys={tenant.accessibleModuleKeys} organization={{ organizationId: tenant.organizationId, memberships: tenant.memberships }}>{children}</AppShell>;
}
