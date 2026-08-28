import type { TenantContext } from "@/lib/tenant";
import type { ModuleNavItem } from "@/types/module";
import { canAccessModule } from "@/lib/auth/permissions";
import { catalogueModuleRegistry } from "@/platform/modules/registry";
import { getEnabledModuleTiles } from "@/platform/modules/enabled-module-tiles";
import { getFleetNavigationForTenant } from "@/modules/fleet/navigation-access";
import { getInstallmentNavigationForTenant } from "@/modules/installment/navigation-access";
import { getPeopleAndPayrollNavigation } from "@/modules/people/navigation";
import { getInventoryProcurementNavigation } from "@/modules/inventory-procurement/navigation";

export interface ModuleNavSection {
  key: string;
  name: string;
  icon: React.ReactNode;
  routePrefix: string;
  items: ModuleNavItem[];
}

/**
 * Every enabled module's own permission-filtered page list, computed once
 * server-side so the sidebar can render a real accordion - clicking any
 * enabled module, not just the one currently open, expands its actual
 * pages in place. Most modules only gate at the module level (see their
 * own layout.tsx's plain `canAccessModule` check), so the catalogue's raw
 * `navigation` array already is exactly what a member with module access
 * may open. Fleet, Installment, HR (paired with Payroll), and Inventory
 * (paired with Procurement) additionally filter page-by-page or combine two
 * route trees, so those route through the exact same functions their own
 * layout.tsx already calls - one source of truth per module, never a
 * second copy that could drift.
 *
 * This file must never be imported by src/platform/modules/registry.ts or
 * by anything registry.ts pulls into the client bundle (AppShell): several
 * of the functions above import `@/lib/auth/permissions`, which starts
 * with `import "server-only"` - see the comment on
 * src/modules/fleet/navigation-access.ts for the real build failure this
 * caused when tried directly in a file registry.ts imports.
 */
export function getFullModuleNavigation(tenant: TenantContext): ModuleNavSection[] {
  const tiles = getEnabledModuleTiles(tenant.accessibleModuleKeys);
  return tiles.map((tile) => {
    const registryModule = catalogueModuleRegistry.find((mod) => mod.key === tile.key);
    let items: ModuleNavItem[] = registryModule?.navigation ?? [];
    if (tile.key === "fleet") items = getFleetNavigationForTenant(tenant);
    if (tile.key === "installment") items = getInstallmentNavigationForTenant(tenant);
    if (tile.key === "hr") items = getPeopleAndPayrollNavigation(tenant);
    if (tile.key === "inventory") {
      items = getInventoryProcurementNavigation({
        hasInventory: canAccessModule(tenant, "inventory"),
        hasProcurement: canAccessModule(tenant, "procurement"),
      });
    }
    return {
      key: tile.key,
      name: tile.name,
      icon: <tile.icon className="size-4" />,
      routePrefix: tile.routePrefix,
      items,
    };
  });
}
