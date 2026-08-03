import { Lock } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { EmptyState } from "@/components/feedback/empty-state";
import { hotelNavigation } from "@/modules/hotel/navigation";
import { requireCurrentTenant } from "@/lib/tenant";
import { canAccessModule } from "@/lib/auth/permissions";

export default async function HotelLayout({ children }: { children: React.ReactNode }) {
  const tenant = await requireCurrentTenant();
  if (!canAccessModule(tenant, "hotel")) return <div className="flex min-h-screen items-center justify-center px-6"><EmptyState icon={Lock} title="Hotel Management isn't available to you" description="Your organization must enable Hotel Management and your role must include Hotel permissions." /></div>;
  return <AppShell sectionLabel="Hotel Management" navigation={hotelNavigation} enabledModuleKeys={tenant.accessibleModuleKeys} organization={{ organizationId: tenant.organizationId, memberships: tenant.memberships }}>{children}</AppShell>;
}
