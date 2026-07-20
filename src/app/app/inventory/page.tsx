import Link from "next/link";
import { Package, Warehouse, AlertTriangle, ArrowLeftRight } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { requireCurrentTenant } from "@/lib/tenant";
import { getInventorySummary } from "@/modules/inventory/service";

export default async function InventoryOverviewPage() {
  const tenant = await requireCurrentTenant();
  const summary = await getInventorySummary(tenant.organizationId);

  const stats = [
    { label: "Active items", value: summary.activeItemCount, icon: Package, href: "/app/inventory/items" },
    { label: "Warehouses", value: summary.warehouseCount, icon: Warehouse, href: "/app/inventory/warehouses" },
    { label: "Low stock items", value: summary.lowStockItems.length, icon: AlertTriangle, href: "/app/inventory/stock" },
    { label: "Movements this month", value: summary.movementsThisMonth, icon: ArrowLeftRight, href: "/app/inventory/movements" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Inventory Overview" description="Stock levels, warehouses, and movement activity at a glance." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardDescription>{stat.label}</CardDescription>
                <stat.icon className="size-4 text-muted-foreground" />
              </div>
              <CardTitle className="text-3xl">{stat.value}</CardTitle>
            </CardHeader>
            <CardContent>
              <Button size="sm" variant="outline" nativeButton={false} render={<Link href={stat.href as never} />}>
                View
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
