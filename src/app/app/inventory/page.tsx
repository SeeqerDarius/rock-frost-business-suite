import { Package, Warehouse, AlertTriangle, ArrowLeftRight } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { OverviewMetricCard } from "@/components/dashboard/overview-metric-card";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { getInventorySummary } from "@/modules/inventory/service";

export default async function InventoryOverviewPage() {
  const tenant = await requireModuleAccess("inventory");
  const summary = await getInventorySummary(tenant.organizationId);

  const stats = [
    { label: "Active items", value: summary.activeItemCount, description: "SKUs currently tracked in the catalog", icon: <Package className="size-4" />, href: "/app/inventory/items" },
    { label: "Warehouses", value: summary.warehouseCount, description: "Stock locations in use", icon: <Warehouse className="size-4" />, href: "/app/inventory/warehouses" },
    { label: "Low stock items", value: summary.lowStockItems.length, description: "Items at or below their reorder point", icon: <AlertTriangle className="size-4" />, href: "/app/inventory/stock" },
    { label: "Movements this month", value: summary.movementsThisMonth, description: "Receipts, issues, adjustments, and transfers", icon: <ArrowLeftRight className="size-4" />, href: "/app/inventory/movements" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Inventory Overview" description="Stock levels, warehouses, and movement activity at a glance." />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => <OverviewMetricCard key={stat.label} {...stat} />)}
      </div>
    </div>
  );
}
