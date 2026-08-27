import Link from "next/link";
import { Boxes } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { IconBadge } from "@/components/ui/icon-badge";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { formatMoney } from "@/lib/currency";
import { getInventorySummary } from "@/modules/inventory/service";

export async function InventoryDashboardWidget({ linkable = true }: { linkable?: boolean } = {}) {
  const tenant = await requireModuleAccess("inventory");
  const summary = await getInventorySummary(tenant.organizationId);

  return (
    <Card>
      <CardHeader>
        <IconBadge size="lg"><Boxes className="size-5" /></IconBadge>
        <CardTitle className="mt-3">Inventory Management</CardTitle>
        <CardDescription>
          {summary.activeItemCount} active item{summary.activeItemCount === 1 ? "" : "s"} · {summary.lowStockItems.length} low stock · {formatMoney(summary.totalStockValue, tenant.organization.currency)} on hand
        </CardDescription>
      </CardHeader>
      {linkable ? (
        <CardContent>
          <Button size="sm" variant="outline" nativeButton={false} render={<Link href="/app/inventory" />}>
            Open Inventory
          </Button>
        </CardContent>
      ) : null}
    </Card>
  );
}
