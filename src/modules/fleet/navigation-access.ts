import type { TenantContext } from "@/lib/tenant";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import type { ModuleNavItem } from "@/types/module";
import { fleetNavigation } from "@/modules/fleet/navigation";

/**
 * The single source of truth for which Fleet pages the current tenant can
 * open, by permission - both Fleet's own layout.tsx and the sidebar's
 * cross-module accordion (src/platform/modules/full-navigation.tsx) call
 * this, so a role's real page access can never drift between the two.
 *
 * Deliberately a separate file from src/modules/fleet/navigation.tsx (which
 * only holds the plain fleetNavigation array): that file is imported by
 * src/platform/modules/registry.ts, which is imported by the client
 * component AppShell for its module metadata. `@/lib/auth/permissions`
 * starts with `import "server-only"`, so pulling it into navigation.tsx
 * would poison AppShell's client bundle with a server-only dependency -
 * confirmed by a real Turbopack build failure when this was tried directly
 * in navigation.tsx. See the equivalent comment in
 * src/modules/inventory-procurement/navigation.tsx for the same constraint
 * on that module pair.
 */
export function getFleetNavigationForTenant(tenant: TenantContext): ModuleNavItem[] {
  const routeAccess: Array<[string, boolean]> = [
    ["/app/fleet", hasPermission(tenant, PERMISSIONS.FLEET_VIEW)],
    ["/app/fleet/vehicles", hasPermission(tenant, PERMISSIONS.FLEET_VEHICLES_MANAGE)],
    ["/app/fleet/drivers", hasPermission(tenant, PERMISSIONS.FLEET_DRIVERS_MANAGE)],
    ["/app/fleet/driver-portal", hasPermission(tenant, PERMISSIONS.FLEET_DRIVER_SELF_SERVICE)],
    ["/app/fleet/mechanic-portal", hasPermission(tenant, PERMISSIONS.FLEET_MECHANIC_SELF_SERVICE)],
    ["/app/fleet/owners", hasPermission(tenant, PERMISSIONS.FLEET_OWNERS_MANAGE)],
    ["/app/fleet/mechanics", hasPermission(tenant, PERMISSIONS.FLEET_MECHANICS_MANAGE)],
    ["/app/fleet/maintenance", hasPermission(tenant, PERMISSIONS.FLEET_MAINTENANCE_MANAGE) || hasPermission(tenant, PERMISSIONS.FLEET_VIEW) || hasPermission(tenant, PERMISSIONS.FLEET_DRIVER_SELF_SERVICE) || hasPermission(tenant, PERMISSIONS.FLEET_INVESTOR_VIEW)],
    ["/app/fleet/insurance-roadworthy", hasPermission(tenant, PERMISSIONS.FLEET_INSURANCE_MANAGE)],
    ["/app/fleet/payments", hasPermission(tenant, PERMISSIONS.FLEET_PAYMENTS_MANAGE)],
    ["/app/fleet/work-and-pay", hasPermission(tenant, PERMISSIONS.FLEET_WORKANDPAY_MANAGE)],
    ["/app/fleet/reports", hasPermission(tenant, PERMISSIONS.FLEET_REPORTS_VIEW)],
    ["/app/fleet/investor", hasPermission(tenant, PERMISSIONS.FLEET_INVESTOR_VIEW)],
    ["/app/fleet/settings", hasPermission(tenant, PERMISSIONS.FLEET_VEHICLES_MANAGE)],
  ];
  const allowedRoutes = new Set(routeAccess.filter(([, allowed]) => allowed).map(([href]) => href));
  return fleetNavigation.filter((item) => allowedRoutes.has(item.href));
}
