import Link from "next/link";
import {
  Package,
  Warehouse,
  AlertTriangle,
  ArrowLeftRight,
  Building2,
  FileText,
  PackageCheck,
  Clock,
  CircleCheck,
  Circle,
  Plus,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { OverviewMetricCard } from "@/components/dashboard/overview-metric-card";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { getInventoryProcurementOverview } from "@/modules/inventory-procurement/overview";

interface SetupStep {
  label: string;
  description: string;
  done: boolean;
  actionHref?: string;
  actionLabel?: string;
}

function formatDate(date: Date) {
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default async function InventoryProcurementOverviewPage() {
  const tenant = await requireModuleAccess("inventory");
  const overview = await getInventoryProcurementOverview(tenant);
  const { inventory, procurement, hasProcurement, lowStockItems, quickActions, setup } = overview;

  const setupSteps: SetupStep[] = [
    {
      label: "Create a warehouse",
      description: "A stock location to receive and hold items.",
      done: setup.hasWarehouse,
      actionHref: quickActions.canManageWarehouses ? "/app/inventory/warehouses" : undefined,
      actionLabel: "Add warehouse",
    },
    {
      label: "Add your items",
      description: "The catalog of stock-keeping units you track, optionally grouped into categories.",
      done: setup.hasItems,
      actionHref: quickActions.canManageItems ? "/app/inventory/items" : undefined,
      actionLabel: "Add item",
    },
  ];
  if (hasProcurement) {
    setupSteps.push(
      {
        label: "Add a vendor",
        description: "The suppliers your organization purchases from.",
        done: setup.hasVendors,
        actionHref: quickActions.canManageVendors ? "/app/procurement/vendors" : undefined,
        actionLabel: "Add vendor",
      },
      {
        label: "Create a purchase request or order",
        description: "An inventory item is optional. Services and one-off purchases can be ordered too.",
        done: setup.hasPurchaseActivity,
        actionHref: quickActions.canManageRequests
          ? "/app/procurement/requests"
          : quickActions.canManageOrders
            ? "/app/procurement/orders"
            : undefined,
        actionLabel: "New request or order",
      },
    );
  }
  setupSteps.push({
    label: "Receive goods into stock",
    description: hasProcurement
      ? "Record a movement, or receive a linked purchase order line into a warehouse."
      : "Record a receipt movement to add quantity to a warehouse.",
    done: setup.hasReceivedStock,
    actionHref: quickActions.canManageMovements ? "/app/inventory/movements" : undefined,
    actionLabel: "Record movement",
  });
  const setupIncomplete = setupSteps.some((step) => !step.done);

  const inventoryStats = [
    { label: "Active items", value: inventory.activeItemCount, description: "SKUs currently tracked in the catalog", icon: <Package className="size-4" />, href: "/app/inventory/items" },
    { label: "Warehouses", value: inventory.warehouseCount, description: "Stock locations in use", icon: <Warehouse className="size-4" />, href: "/app/inventory/warehouses" },
    { label: "Low stock items", value: inventory.lowStockItems.length, description: "Items at or below their reorder point", icon: <AlertTriangle className="size-4" />, href: "/app/inventory/stock" },
    { label: "Movements this month", value: inventory.movementsThisMonth, description: "Receipts, issues, adjustments, and transfers", icon: <ArrowLeftRight className="size-4" />, href: "/app/inventory/movements" },
  ];

  const procurementStats = procurement
    ? [
        { label: "Vendors", value: procurement.vendorCount, description: `${procurement.activeVendorCount} active`, icon: <Building2 className="size-4" />, href: "/app/procurement/vendors" },
        { label: "Pending requests", value: procurement.pendingRequestCount, description: "Purchase requests awaiting approval", icon: <FileText className="size-4" />, href: "/app/procurement/requests" },
        { label: "Open orders", value: procurement.openOrderCount, description: "Purchase orders not yet fully received", icon: <PackageCheck className="size-4" />, href: "/app/procurement/orders" },
        { label: "Overdue receipts", value: procurement.overdueOrderCount, description: "Open orders past their expected date", icon: <Clock className="size-4" />, href: "/app/procurement/orders" },
      ]
    : [];

  const quickActionLinks = [
    quickActions.canManageItems ? { label: "Add item", href: "/app/inventory/items" } : null,
    quickActions.canManageWarehouses ? { label: "Add warehouse", href: "/app/inventory/warehouses" } : null,
    quickActions.canManageMovements ? { label: "Record movement", href: "/app/inventory/movements" } : null,
    hasProcurement && quickActions.canManageVendors ? { label: "Add vendor", href: "/app/procurement/vendors" } : null,
    hasProcurement && quickActions.canManageRequests ? { label: "New purchase request", href: "/app/procurement/requests" } : null,
    hasProcurement && quickActions.canManageOrders ? { label: "New purchase order", href: "/app/procurement/orders" } : null,
  ].filter((action): action is { label: string; href: string } => action !== null);

  return (
    <div className="space-y-6">
      <PageHeader
        title={hasProcurement ? "Inventory & Procurement" : "Inventory Overview"}
        description={
          hasProcurement
            ? "Stock levels, warehouses, vendors, and purchasing activity, all in one place."
            : "Stock levels, warehouses, and movement activity at a glance."
        }
      />

      {setupIncomplete ? (
        <Card>
          <CardHeader>
            <CardTitle>Getting started</CardTitle>
            <CardDescription>Complete these steps to get the most out of Inventory{hasProcurement ? " and Procurement" : ""}.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {setupSteps.map((step) => (
              <div key={step.label} className="flex items-center justify-between gap-4 rounded-lg border p-3">
                <div className="flex items-start gap-3">
                  {step.done ? (
                    <CircleCheck className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
                  ) : (
                    <Circle className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  )}
                  <div>
                    <p className={"text-sm font-medium" + (step.done ? " text-muted-foreground line-through" : "")}>{step.label}</p>
                    <p className="text-xs text-muted-foreground">{step.description}</p>
                  </div>
                </div>
                {!step.done && step.actionHref ? (
                  <Button size="sm" variant="outline" nativeButton={false} render={<Link href={step.actionHref} />} className="shrink-0">
                    <Plus />
                    {step.actionLabel}
                  </Button>
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <div>
        {hasProcurement ? <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Inventory</h2> : null}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {inventoryStats.map((stat) => <OverviewMetricCard key={stat.label} {...stat} />)}
        </div>
      </div>

      {procurement ? (
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Procurement</h2>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {procurementStats.map((stat) => <OverviewMetricCard key={stat.label} {...stat} />)}
          </div>
        </div>
      ) : null}

      {lowStockItems !== null || procurement ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {lowStockItems !== null ? (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <AlertTriangle className="size-5 text-muted-foreground" />
                  <CardTitle>Needs reorder</CardTitle>
                </div>
                <CardDescription>Items at or below their reorder point.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {lowStockItems.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nothing is low on stock right now.</p>
                ) : (
                  <>
                    {lowStockItems.map((item) => (
                      <div key={item.id} className="flex items-center justify-between rounded-lg border p-3">
                        <div>
                          <p className="text-sm font-medium">{item.name}</p>
                          <p className="text-xs text-muted-foreground">{item.sku}</p>
                        </div>
                        <Badge variant="destructive">{item.totalQuantity} on hand</Badge>
                      </div>
                    ))}
                    {inventory.lowStockItems.length > lowStockItems.length ? (
                      <Link href="/app/inventory/reports" className="block text-xs font-medium text-primary hover:underline">
                        View all {inventory.lowStockItems.length} in Reports
                      </Link>
                    ) : null}
                  </>
                )}
              </CardContent>
            </Card>
          ) : null}

          {procurement ? (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Clock className="size-5 text-muted-foreground" />
                  <CardTitle>Needs follow-up</CardTitle>
                </div>
                <CardDescription>Requests awaiting approval and orders overdue for receipt.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {procurement.pendingRequestsPreview.length === 0 && procurement.overdueOrdersPreview.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nothing needs follow-up right now.</p>
                ) : (
                  <>
                    {procurement.pendingRequestsPreview.map((request) => (
                      <div key={request.id} className="flex items-center justify-between rounded-lg border p-3">
                        <div>
                          <p className="text-sm font-medium">{request.description}</p>
                          <p className="text-xs text-muted-foreground">{request.requestNumber} · qty {request.quantity}</p>
                        </div>
                        <Badge variant="outline">Pending approval</Badge>
                      </div>
                    ))}
                    {procurement.overdueOrdersPreview.map((order) => (
                      <div key={order.id} className="flex items-center justify-between rounded-lg border p-3">
                        <div>
                          <p className="text-sm font-medium">{order.orderNumber}</p>
                          <p className="text-xs text-muted-foreground">{order.vendorName} · expected {formatDate(order.expectedDate)}</p>
                        </div>
                        <Badge variant="destructive">Overdue</Badge>
                      </div>
                    ))}
                    {procurement.pendingRequestCount > procurement.pendingRequestsPreview.length ||
                    procurement.overdueOrderCount > procurement.overdueOrdersPreview.length ? (
                      <div className="flex flex-wrap gap-3 pt-1">
                        {procurement.pendingRequestCount > procurement.pendingRequestsPreview.length ? (
                          <Link href="/app/procurement/requests" className="text-xs font-medium text-primary hover:underline">
                            View all pending requests
                          </Link>
                        ) : null}
                        {procurement.overdueOrderCount > procurement.overdueOrdersPreview.length ? (
                          <Link href="/app/procurement/orders" className="text-xs font-medium text-primary hover:underline">
                            View all overdue orders
                          </Link>
                        ) : null}
                      </div>
                    ) : null}
                  </>
                )}
              </CardContent>
            </Card>
          ) : null}
        </div>
      ) : null}

      {quickActionLinks.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Quick actions</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {quickActionLinks.map((action) => (
              <Button key={action.href + action.label} size="sm" variant="outline" nativeButton={false} render={<Link href={action.href} />}>
                <Plus />
                {action.label}
              </Button>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
