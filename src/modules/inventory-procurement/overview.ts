import "server-only";

import type { TenantContext } from "@/lib/tenant";
import { canAccessModule, hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getInventorySummary } from "@/modules/inventory/service";
import { getProcurementSummary } from "@/modules/procurement/service";

/**
 * Composes the combined Inventory & Procurement overview shown at
 * /app/inventory from each module's own public summary function — this
 * file owns no database tables and never queries Prisma directly, the same
 * pattern Analytics uses for cross-module reporting (see
 * docs/MODULE_BOUNDARIES.md). Every field this returns is already scoped to
 * what the current viewer is permitted to see, so the page component can
 * render its result directly without re-deriving permission logic.
 */
export async function getInventoryProcurementOverview(tenant: TenantContext) {
  const hasProcurement = canAccessModule(tenant, "procurement");
  const canViewInventoryReports = hasPermission(tenant, PERMISSIONS.INVENTORY_REPORTS_VIEW);

  const [inventory, procurement] = await Promise.all([
    getInventorySummary(tenant.organizationId),
    hasProcurement ? getProcurementSummary(tenant.organizationId) : Promise.resolve(null),
  ]);

  return {
    hasProcurement,
    inventory,
    // The detailed low-stock breakdown (item names/SKUs) stays behind the
    // same INVENTORY_REPORTS_VIEW permission the dedicated Reports page
    // already requires for it — only the aggregate count above is shown
    // otherwise. null (not []) distinguishes "hidden" from "none low".
    lowStockItems: canViewInventoryReports ? inventory.lowStockItems.slice(0, 5) : null,
    procurement,
    quickActions: {
      canManageItems: hasPermission(tenant, PERMISSIONS.INVENTORY_ITEMS_MANAGE),
      canManageWarehouses: hasPermission(tenant, PERMISSIONS.INVENTORY_WAREHOUSES_MANAGE),
      canManageMovements: hasPermission(tenant, PERMISSIONS.INVENTORY_MOVEMENTS_MANAGE),
      canManageVendors: hasProcurement && hasPermission(tenant, PERMISSIONS.PROCUREMENT_VENDORS_MANAGE),
      canManageRequests: hasProcurement && hasPermission(tenant, PERMISSIONS.PROCUREMENT_REQUESTS_MANAGE),
      canManageOrders: hasProcurement && hasPermission(tenant, PERMISSIONS.PROCUREMENT_ORDERS_MANAGE),
    },
    setup: {
      hasWarehouse: inventory.warehouseCount > 0,
      hasItems: inventory.itemCount > 0,
      // Treated as already "done" when Procurement isn't part of this
      // viewer's access — an inventory-only tenant's checklist should never
      // dangle on a step it cannot take.
      hasVendors: procurement ? procurement.vendorCount > 0 : true,
      hasPurchaseActivity: procurement ? procurement.totalRequestCount > 0 || procurement.totalOrderCount > 0 : true,
      hasReceivedStock: inventory.totalStockValue > 0,
    },
  };
}

export type InventoryProcurementOverview = Awaited<ReturnType<typeof getInventoryProcurementOverview>>;
