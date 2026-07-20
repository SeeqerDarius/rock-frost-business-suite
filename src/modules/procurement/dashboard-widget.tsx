import Link from "next/link";
import { ShoppingCart } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { requireCurrentTenant } from "@/lib/tenant";
import { getProcurementSummary } from "@/modules/procurement/service";

export async function ProcurementDashboardWidget() {
  const tenant = await requireCurrentTenant();
  const summary = await getProcurementSummary(tenant.organizationId);

  return (
    <Card>
      <CardHeader>
        <ShoppingCart className="size-6 text-muted-foreground" />
        <CardTitle className="mt-3">Procurement</CardTitle>
        <CardDescription>
          {summary.pendingRequestCount} pending request{summary.pendingRequestCount === 1 ? "" : "s"} · {summary.openOrderCount} open order{summary.openOrderCount === 1 ? "" : "s"} · {summary.openOrderValue.toFixed(2)} outstanding
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button size="sm" variant="outline" nativeButton={false} render={<Link href="/app/procurement" />}>
          Open Procurement
        </Button>
      </CardContent>
    </Card>
  );
}
