import { ShieldAlert } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { EmptyState } from "@/components/feedback/empty-state";
import { platformFooterNavigation, getPlatformNavigation } from "@/platform/modules/platform-navigation";
import { getCurrentTenant } from "@/lib/tenant";
import { isPlatformOperator } from "@/lib/auth/permissions";

/**
 * Platform Administration is Rock Frost's own operator surface across every
 * tenant organization — not a tenant-facing feature. Gated on the "Super
 * Admin" system role specifically: Organization Owner holds every
 * permission a tenant can have, but must never reach this section.
 */
export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const tenant = await getCurrentTenant();

  if (!tenant || !isPlatformOperator(tenant)) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <EmptyState
          icon={ShieldAlert}
          title="Platform Administration is restricted"
          description="This area is reserved for Rock Frost operators. If you believe you should have access, contact your Rock Frost account representative."
        />
      </div>
    );
  }

  return (
    <AppShell
      sectionLabel="Platform Administration"
      navigation={getPlatformNavigation()}
      footerNavigation={platformFooterNavigation}
      homeHref="/app/platform/dashboard"
      showModuleLauncher={false}
    >
      {children}
    </AppShell>
  );
}
