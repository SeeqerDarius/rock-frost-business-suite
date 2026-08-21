import { Lock } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { EmptyState } from "@/components/feedback/empty-state";
import { fleetNavigation } from "@/modules/fleet/navigation";
import { requireCurrentTenant } from "@/lib/tenant";
import { canAccessModule, hasPermission, PERMISSIONS } from "@/lib/auth/permissions";

export default async function FleetLayout({ children }: { children: React.ReactNode }) {
  const tenant = await requireCurrentTenant();

  if (!canAccessModule(tenant, "fleet")) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <EmptyState
          icon={Lock}
          title="Fleet Management isn't available to you"
          description="Either your organization hasn't enabled this module, or your role doesn't include Fleet access. Contact an administrator if you believe this is a mistake."
        />
      </div>
    );
  }
  const routeAccess: Array<[string, boolean]> = [
      ["/app/fleet", hasPermission(tenant, PERMISSIONS.FLEET_VIEW)],
      ["/app/fleet/vehicles", hasPermission(tenant, PERMISSIONS.FLEET_VEHICLES_MANAGE)],
      ["/app/fleet/drivers", hasPermission(tenant, PERMISSIONS.FLEET_DRIVERS_MANAGE)],
      ["/app/fleet/driver-portal", hasPermission(tenant, PERMISSIONS.FLEET_DRIVER_SELF_SERVICE)],
      ["/app/fleet/owners", hasPermission(tenant, PERMISSIONS.FLEET_OWNERS_MANAGE)],
      ["/app/fleet/maintenance", hasPermission(tenant, PERMISSIONS.FLEET_MAINTENANCE_MANAGE) || hasPermission(tenant, PERMISSIONS.FLEET_VIEW) || hasPermission(tenant, PERMISSIONS.FLEET_DRIVER_SELF_SERVICE) || hasPermission(tenant, PERMISSIONS.FLEET_INVESTOR_VIEW)],
      ["/app/fleet/insurance-roadworthy", hasPermission(tenant, PERMISSIONS.FLEET_INSURANCE_MANAGE)],
      ["/app/fleet/payments", hasPermission(tenant, PERMISSIONS.FLEET_PAYMENTS_MANAGE)],
      ["/app/fleet/work-and-pay", hasPermission(tenant, PERMISSIONS.FLEET_WORKANDPAY_MANAGE)],
      ["/app/fleet/reports", hasPermission(tenant, PERMISSIONS.FLEET_REPORTS_VIEW)],
      ["/app/fleet/investor", hasPermission(tenant, PERMISSIONS.FLEET_INVESTOR_VIEW)],
      ["/app/fleet/settings", hasPermission(tenant, PERMISSIONS.FLEET_VEHICLES_MANAGE)],
    ];
  const allowedRoutes = new Set(routeAccess.filter(([, allowed]) => allowed).map(([href]) => href));
  const navigation = fleetNavigation.filter((item) => allowedRoutes.has(item.href));

  return (
    <AppShell
      sectionLabel="Fleet Management"
      navigation={navigation}
      enabledModuleKeys={tenant.accessibleModuleKeys}
      organization={{ organizationId: tenant.organizationId, memberships: tenant.memberships }}
    >
      {children}
    </AppShell>
  );
}
