import { LayoutGrid, Package, Warehouse, Layers, ArrowLeftRight, BarChart3, Settings, Building2, FileText, PackageCheck, ClipboardCheck, ReceiptText, FileCheck2 } from "lucide-react";
import type { ModuleNavItem } from "@/types/module";

/**
 * Shared navigation for the combined customer-facing "Inventory &
 * Procurement" product experience. Both src/app/app/inventory/layout.tsx and
 * src/app/app/procurement/layout.tsx render this same list so moving between
 * the two existing route trees (/app/inventory/**, /app/procurement/**)
 * feels like staying inside one product. See
 * docs/INVENTORY_PROCUREMENT_CONSOLIDATION.md.
 *
 * The two route trees, their permission prefixes ("inventory."/
 * "procurement."), their database tables, and their service functions are
 * unchanged and unrenamed — this file only changes what the sidebar shows.
 *
 * Deliberately takes plain booleans rather than a full TenantContext, and
 * does not import from @/lib/auth/permissions itself: this file is reached
 * from src/platform/modules/registry.ts (via the re-exports in
 * src/modules/inventory/navigation.tsx and src/modules/procurement/navigation.tsx),
 * and permissions.ts itself imports registry.ts — importing permissions.ts
 * back from here would be a real module cycle, not just a hypothetical one.
 * Each caller computes canAccessModule(tenant, "inventory"/"procurement")
 * itself and passes the result in.
 */

const OVERVIEW_ITEM: ModuleNavItem = { label: "Overview", href: "/app/inventory", icon: <LayoutGrid className="size-4" /> };

/** Used only when a tenant has Procurement but not Inventory — points at Procurement's own, unchanged overview page rather than the combined one, which that tenant cannot reach. */
const PROCUREMENT_ONLY_OVERVIEW_ITEM: ModuleNavItem = { label: "Overview", href: "/app/procurement", icon: <LayoutGrid className="size-4" /> };

const INVENTORY_ITEMS: ModuleNavItem[] = [
  { label: "Items", group: "Inventory", href: "/app/inventory/items", icon: <Package className="size-4" /> },
  { label: "Warehouses", group: "Inventory", href: "/app/inventory/warehouses", icon: <Warehouse className="size-4" /> },
  { label: "Stock", group: "Inventory", href: "/app/inventory/stock", icon: <Layers className="size-4" /> },
  { label: "Stock Counts", group: "Inventory", href: "/app/inventory/counts", icon: <ClipboardCheck className="size-4" /> },
  { label: "Movements", group: "Inventory", href: "/app/inventory/movements", icon: <ArrowLeftRight className="size-4" /> },
  { label: "Inventory Reports", group: "Inventory", href: "/app/inventory/reports", icon: <BarChart3 className="size-4" /> },
  { label: "Inventory Settings", group: "Inventory", href: "/app/inventory/settings", icon: <Settings className="size-4" /> },
];

const PROCUREMENT_ITEMS: ModuleNavItem[] = [
  { label: "Vendors", group: "Procurement", href: "/app/procurement/vendors", icon: <Building2 className="size-4" /> },
  { label: "Requests", group: "Procurement", href: "/app/procurement/requests", icon: <FileText className="size-4" /> },
  { label: "Orders", group: "Procurement", href: "/app/procurement/orders", icon: <PackageCheck className="size-4" /> },
  { label: "Goods Receipts", group: "Procurement", href: "/app/procurement/receipts", icon: <ReceiptText className="size-4" /> },
  { label: "Supplier Invoices", group: "Procurement", href: "/app/procurement/invoices", icon: <FileCheck2 className="size-4" /> },
  { label: "Procurement Reports", group: "Procurement", href: "/app/procurement/reports", icon: <BarChart3 className="size-4" /> },
  { label: "Procurement Settings", group: "Procurement", href: "/app/procurement/settings", icon: <Settings className="size-4" /> },
];

/**
 * Full, unfiltered definition covering both modules. src/platform/modules/registry.ts
 * (owned centrally, not part of this change) imports this shape indirectly
 * through src/modules/inventory/navigation.tsx and src/modules/procurement/navigation.tsx's
 * existing exported names as generic module metadata, not as the live
 * sidebar — see getInventoryProcurementNavigation for what actually renders.
 */
export const inventoryProcurementNavigation: ModuleNavItem[] = [OVERVIEW_ITEM, ...INVENTORY_ITEMS, ...PROCUREMENT_ITEMS];

export interface InventoryProcurementAccess {
  hasInventory: boolean;
  hasProcurement: boolean;
}

/**
 * The navigation actually rendered in the sidebar. A tenant holding both
 * modules sees one combined list. A tenant holding only one of the two
 * (module not enabled for the org, or the signed-in role lacks any
 * permission under that module's prefix) sees exactly that module's own
 * items, unchanged from before this consolidation — the shared nav never
 * links to a route the current viewer cannot reach.
 */
export function getInventoryProcurementNavigation({ hasInventory, hasProcurement }: InventoryProcurementAccess): ModuleNavItem[] {
  if (hasInventory && hasProcurement) return [OVERVIEW_ITEM, ...INVENTORY_ITEMS, ...PROCUREMENT_ITEMS];
  if (hasInventory) return [OVERVIEW_ITEM, ...INVENTORY_ITEMS];
  if (hasProcurement) return [PROCUREMENT_ONLY_OVERVIEW_ITEM, ...PROCUREMENT_ITEMS];
  return [];
}

/**
 * The sidebar section label shown above the nav list. Only "Inventory &
 * Procurement" when the tenant genuinely has both — otherwise the original
 * single-module label, so a single-module tenant's experience reads exactly
 * as it did before this consolidation.
 */
export function getInventoryProcurementSectionLabel({ hasInventory, hasProcurement }: InventoryProcurementAccess): string {
  if (hasInventory && hasProcurement) return "Inventory & Procurement";
  if (hasInventory) return "Inventory Management";
  return "Procurement";
}
