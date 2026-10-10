import { ClipboardList, Lock, PackageSearch, Truck } from "lucide-react";
import { AttentionQueue, type AttentionQueueItem } from "@/components/dashboard/attention-queue";
import { BreakdownDonutChart } from "@/components/dashboard/charts";
import { OverviewMetricCard } from "@/components/dashboard/overview-metric-card";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

  const stats = [
    fleet ? { label: "Fleet vehicles", value: fleet.vehicleCount, description: `${fleet.activeDriverCount} active drivers and ${fleet.activeContractCount} active work-and-pay contracts.`, icon: <Truck className="size-4" />, href: "/app/fleet" } : null,
    fleet ? { label: "Fleet collections this month", value: money(fleet.paymentsThisMonthTotal), description: "Verified Fleet payments since the first day of the current month.", icon: <Truck className="size-4" />, href: "/app/fleet" } : null,
    inventory ? { label: "Stock value", value: money(inventory.totalStockValue), description: `${inventory.activeItemCount} active items across ${inventory.warehouseCount} warehouse${inventory.warehouseCount === 1 ? "" : "s"}.`, icon: <PackageSearch className="size-4" />, href: "/app/inventory" } : null,
    inventory ? { label: "Inventory movements this month", value: inventory.movementsThisMonth, description: "Stock movements recorded since the first day of the current month.", icon: <PackageSearch className="size-4" />, href: "/app/inventory" } : null,
    procurement ? { label: "Open purchase orders", value: procurement.openOrderCount, description: `${money(procurement.openOrderValue)} remains to be received across open orders.`, icon: <ClipboardList className="size-4" />, href: "/app/procurement" } : null,
    procurement ? { label: "Active suppliers", value: procurement.activeVendorCount, description: `${procurement.vendorCount} supplier${procurement.vendorCount === 1 ? "" : "s"} recorded in Procurement.`, icon: <ClipboardList className="size-4" />, href: "/app/procurement" } : null,
  ].filter((stat): stat is NonNullable<typeof stat> => stat !== null);

  const attentionCandidates: (AttentionQueueItem | null)[] = [
    fleet?.pendingMaintenanceCount ? { id: "pending-maintenance", title: "Pending fleet maintenance", value: fleet.pendingMaintenanceCount, description: `${fleet.maintenanceVehicleCount} vehicle${fleet.maintenanceVehicleCount === 1 ? " is" : "s are"} affected by an in-progress maintenance request.`, href: "/app/fleet/maintenance", severity: "urgent" } : null,
    fleet?.pendingDriverSubmissionCount ? { id: "pending-driver-submissions", title: "Driver payment submissions", value: fleet.pendingDriverSubmissionCount, description: "Driver-submitted payments are awaiting review.", href: "/app/fleet/driver-portal", severity: "review" } : null,
    fleet?.expiringDocumentCount ? { id: "expiring-fleet-documents", title: "Fleet documents nearing renewal", value: fleet.expiringDocumentCount, description: "Insurance or roadworthy records are inside the organization reminder window.", href: "/app/fleet", severity: "urgent" } : null,
    inventory && inventory.lowStockItems.length > 0 ? { id: "low-stock", title: "Low-stock items", value: inventory.lowStockItems.length, description: "Quantity is at or below the configured reorder point.", href: "/app/inventory", severity: "urgent" } : null,
    procurement?.overdueOrderCount ? { id: "overdue-orders", title: "Overdue purchase orders", value: procurement.overdueOrderCount, description: "Open orders have passed their expected delivery date.", href: "/app/procurement", severity: "urgent" } : null,
    procurement?.pendingRequestCount ? { id: "pending-requests", title: "Pending procurement requests", value: procurement.pendingRequestCount, description: "Requests are waiting for a purchasing decision.", href: "/app/procurement", severity: "review" } : null,
  ];
  const attentionItems = attentionCandidates.filter((item): item is AttentionQueueItem => item !== null);

  const vehicleStatuses = fleet ? fleet.vehiclesByStatus.map((entry) => ({ label: entry.status, value: entry._count })) : [];

  return (
    <div className="space-y-6">
      <PageHeader title="Operations" description="Current Fleet, inventory, and procurement snapshot. Source-module workflows remain the record of action." />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {stats.map((stat) => <OverviewMetricCard key={stat.label} {...stat} />)}
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(20rem,0.7fr)]">
        <AttentionQueue items={attentionItems} title="Operational follow-ups" description="Select a source-backed item to review it in the relevant workflow." emptyTitle="No tracked operational follow-ups" emptyDescription="There are no pending maintenance, inventory, or procurement exceptions in this snapshot." />
        {fleet ? (
          <Card>
            <CardHeader>
              <CardTitle>Fleet by status</CardTitle>
              <CardDescription>Current registered vehicles grouped by their Fleet status.</CardDescription>
            </CardHeader>
            <CardContent>
              <BreakdownDonutChart data={vehicleStatuses} valueFormat="count" />
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
