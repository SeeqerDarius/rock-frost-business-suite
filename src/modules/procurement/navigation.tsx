/**
 * Re-exports the shared Inventory & Procurement navigation definition under
 * this module's existing name, since src/platform/modules/registry.ts
 * imports `procurementNavigation` by this exact name and path (registry.ts
 * is centrally owned and not edited here). The live sidebar is actually
 * built by getInventoryProcurementNavigation(tenant) in
 * src/modules/inventory-procurement/navigation.tsx, consumed directly by
 * src/app/app/procurement/layout.tsx.
 */
export { inventoryProcurementNavigation as procurementNavigation } from "@/modules/inventory-procurement/navigation";
