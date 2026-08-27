import { Lock, Truck } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { formatMoney } from "@/lib/currency";
import { getOperationsOverview } from "@/modules/analytics/service";

export default async function AnalyticsOperationsPage() {
  const tenant = await requireModuleAccess("analytics");

  if (!hasPermission(tenant, PERMISSIONS.ANALYTICS_OPERATIONS_VIEW)) {
    return (
      <div className="space-y-6">
        <PageHeader title="Operations" description="Fleet, inventory, and procurement rolled up." />
        <EmptyState icon={Lock} title="You don't have access to this page" description="Operations analytics are limited to roles with operations-reporting permissions." />
      </div>
    );
  }

  const { fleet, inventory, procurement } = await getOperationsOverview(tenant.organizationId, tenant.enabledModuleKeys);
  const money = (value: Parameters<typeof formatMoney>[0]) => formatMoney(value, tenant.organization.currency);

  if (!fleet && !inventory && !procurement) {
    return (
      <div className="space-y-6">
        <PageHeader title="Operations" description="Fleet, inventory, and procurement rolled up." />
        <EmptyState icon={Truck} title="No operations modules enabled" description="Enable Fleet Management, Inventory, and/or Procurement for this organization to see operations analytics here." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Operations" description="Fleet, inventory, and procurement rolled up." />

      {fleet ? (
        <Card>
          <CardHeader>
            <CardTitle>Fleet Management</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3">
            <div>
              <p className="text-xs text-muted-foreground">Vehicles</p>
              <p className="text-lg font-medium">{fleet.vehicleCount}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Active drivers</p>
              <p className="text-lg font-medium">{fleet.activeDriverCount}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Pending maintenance</p>
              <p className="text-lg font-medium">{fleet.pendingMaintenanceCount}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Active work &amp; pay contracts</p>
              <p className="text-lg font-medium">{fleet.activeContractCount}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Payments this month</p>
              <p className="text-lg font-medium">{money(fleet.paymentsThisMonthTotal)}</p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {inventory ? (
        <Card>
          <CardHeader>
            <CardTitle>Inventory</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3">
            <div>
              <p className="text-xs text-muted-foreground">Active items</p>
              <p className="text-lg font-medium">{inventory.activeItemCount} / {inventory.itemCount}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Warehouses</p>
              <p className="text-lg font-medium">{inventory.warehouseCount}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total stock value</p>
              <p className="text-lg font-medium">{money(inventory.totalStockValue)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Low stock items</p>
              <p className="text-lg font-medium">{inventory.lowStockItems.length}</p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {procurement ? (
        <Card>
          <CardHeader>
            <CardTitle>Procurement</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3">
            <div>
              <p className="text-xs text-muted-foreground">Pending requests</p>
              <p className="text-lg font-medium">{procurement.pendingRequestCount}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Open orders</p>
              <p className="text-lg font-medium">{procurement.openOrderCount}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Open order value</p>
              <p className="text-lg font-medium">{money(procurement.openOrderValue)}</p>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
