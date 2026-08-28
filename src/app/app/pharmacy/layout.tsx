import { Lock } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { EmptyState } from "@/components/feedback/empty-state";
import { pharmacyNavigation } from "@/modules/pharmacy/navigation";
import { getFullModuleNavigation } from "@/platform/modules/full-navigation";
import { requireCurrentTenant } from "@/lib/tenant";
import { canAccessModule } from "@/lib/auth/permissions";

export default async function PharmacyLayout({ children }: { children: React.ReactNode }) {
  const tenant = await requireCurrentTenant().catch((error: unknown) => {
    if (error instanceof Error && error.message === "No organization membership found for the current user.") return null;
    throw error;
  });
  if (!tenant) return null;
  if (!canAccessModule(tenant, "pharmacy")) return <div className="flex min-h-screen items-center justify-center px-6"><EmptyState icon={Lock} title="Pharmacy isn't available to you" description="Your organization must activate Pharmacy and your role must include Pharmacy access." /></div>;
  return <AppShell sectionLabel="Pharmacy Management" moduleKey="pharmacy" navigation={pharmacyNavigation} moduleSections={getFullModuleNavigation(tenant)} enabledModuleKeys={tenant.accessibleModuleKeys} organization={{ organizationId: tenant.organizationId, memberships: tenant.memberships }}>{children}</AppShell>;
}
