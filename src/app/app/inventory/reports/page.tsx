import { Lock, AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { formatMoney } from "@/lib/currency";
import { getInventorySummary } from "@/modules/inventory/service";
import { ReportExportLinks } from "@/components/reports/report-export-links";

export default async function InventoryReportsPage() {
  const tenant = await requireModuleAccess("inventory");

  if (!hasPermission(tenant, PERMISSIONS.INVENTORY_REPORTS_VIEW)) {
    return (
      <div className="space-y-6">
        <PageHeader title="Reports" description="Stock valuation, low-stock alerts, and movement activity." />
        <EmptyState icon={Lock} title="You don't have access to this page" description="Inventory reports are limited to roles with reporting permissions." />
      </div>
    );
  }

  const summary = await getInventorySummary(tenant.organizationId);

  const stats = [
    { label: "Total stock value", value: formatMoney(summary.totalStockValue, tenant.organization.currency) },
    { label: "Active items", value: `${summary.activeItemCount} / ${summary.itemCount}` },
    { label: "Warehouses", value: summary.warehouseCount },
    { label: "Movements this month", value: summary.movementsThisMonth },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Reports" description="Stock valuation, low-stock alerts, and movement activity." actions={<ReportExportLinks moduleKey="inventory" />} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardHeader>
              <CardDescription>{stat.label}</CardDescription>
              <CardTitle className="text-2xl">{stat.value}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="size-5 text-muted-foreground" />
            <CardTitle>Low stock items</CardTitle>
          </div>
          <CardDescription>Items at or below their reorder point, across all warehouses.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {summary.lowStockItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing is low on stock right now.</p>
          ) : (
            summary.lowStockItems.map((item) => (
              <div key={item.id} className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="text-sm font-medium">{item.name}</p>
                  <p className="text-xs text-muted-foreground">{item.sku}</p>
                </div>
                <Badge variant="destructive">
                  {item.totalQuantity} on hand (reorder at {item.reorderPoint})
                </Badge>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
