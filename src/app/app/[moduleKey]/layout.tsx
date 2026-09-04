import { notFound } from "next/navigation";
import { Lock } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { EmptyState } from "@/components/feedback/empty-state";
import { requireCurrentTenant, type TenantContext } from "@/lib/tenant";
import { canAccessModule } from "@/lib/auth/permissions";
import { getModuleTeamConfig, type ModuleTeamKey } from "@/modules/staff/module-team-config";
import type { ModuleNavItem } from "@/types/module";
import { crmNavigation } from "@/modules/crm/navigation";
import { getInventoryProcurementNavigation, getInventoryProcurementSectionLabel } from "@/modules/inventory-procurement/navigation";
import { accountingNavigation } from "@/modules/accounting/navigation";
import { getPeopleAndPayrollNavigation } from "@/modules/people/navigation";
import { analyticsNavigation } from "@/modules/analytics/navigation";
import { posNavigation } from "@/modules/pos/navigation";
import { projectsNavigation } from "@/modules/projects/navigation";
import { hotelNavigation } from "@/modules/hotel/navigation";
import { pharmacyNavigation } from "@/modules/pharmacy/navigation";
import { hospitalNavigation } from "@/modules/hospital/navigation";

/**
 * Backs the shared Team directory at /app/<moduleKey>/staff for every module
 * in module-team-config.ts (crm, inventory, accounting, payroll, procurement,
 * analytics, pos, projects, hotel, pharmacy, hospital). Without this layout,
 * that page rendered directly under the bare authenticated app layout with
 * no AppShell at all - no sidebar, no width constraint - since [moduleKey]
 * had no layout.tsx of its own the way every real module route does.
 *
 * sectionLabel/navigation are computed the same way each module's own real
 * layout.tsx computes them (see e.g. src/app/app/inventory/layout.tsx,
 * src/app/app/payroll/layout.tsx), reusing their exact helper functions
 * where those modules have module-specific logic, so the Team page's
 * sidebar matches that module's real pages exactly rather than drifting.
 */
function getSectionChrome(moduleKey: ModuleTeamKey, tenant: TenantContext): { sectionLabel: string; navigation: ModuleNavItem[] } {
  switch (moduleKey) {
    case "crm":
      return { sectionLabel: "Customer Relationship Management", navigation: crmNavigation };
    case "inventory": {
      const access = { hasInventory: true, hasProcurement: canAccessModule(tenant, "procurement") };
      return { sectionLabel: getInventoryProcurementSectionLabel(access), navigation: getInventoryProcurementNavigation(access) };
    }
    case "procurement": {
      const access = { hasInventory: canAccessModule(tenant, "inventory"), hasProcurement: true };
      return { sectionLabel: getInventoryProcurementSectionLabel(access), navigation: getInventoryProcurementNavigation(access) };
    }
    case "accounting":
      return { sectionLabel: "Accounting", navigation: accountingNavigation };
    case "payroll":
      return { sectionLabel: "Human Resources & Payroll", navigation: getPeopleAndPayrollNavigation(tenant) };
    case "analytics":
      return { sectionLabel: "Analytics", navigation: analyticsNavigation };
    case "pos":
      return { sectionLabel: "Point of Sale", navigation: posNavigation };
    case "projects":
      return { sectionLabel: "Project Management", navigation: projectsNavigation };
    case "hotel":
      return { sectionLabel: "Hotel Management", navigation: hotelNavigation };
    case "pharmacy":
      return { sectionLabel: "Pharmacy Management", navigation: pharmacyNavigation };
    case "hospital":
      return { sectionLabel: "Hospital Management", navigation: hospitalNavigation };
  }
}

export default async function ModuleTeamLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ moduleKey: string }>;
}) {
  const { moduleKey } = await params;
  const config = getModuleTeamConfig(moduleKey);
  if (!config) notFound();

  const tenant = await requireCurrentTenant();

  if (!canAccessModule(tenant, config.key)) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <EmptyState
          icon={Lock}
          title={`${config.label} isn't available to you`}
          description={`Either your organization hasn't enabled this module, or your role doesn't include ${config.label} access. Contact an administrator if you believe this is a mistake.`}
        />
      </div>
    );
  }

  const { sectionLabel, navigation } = getSectionChrome(config.key, tenant);

  return (
    <AppShell
      sectionLabel={sectionLabel}
      moduleKey={config.key}
      navigation={navigation}
      enabledModuleKeys={tenant.accessibleModuleKeys}
      organization={{ organizationId: tenant.organizationId, memberships: tenant.memberships }}
    >
      {children}
    </AppShell>
  );
}
