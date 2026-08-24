import Link from "next/link";
import { ShoppingCart } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { IconBadge } from "@/components/ui/icon-badge";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { getProcurementSummary } from "@/modules/procurement/service";

export async function ProcurementDashboardWidget({ linkable = true }: { linkable?: boolean } = {}) {
  const tenant = await requireModuleAccess("procurement");
  const summary = await getProcurementSummary(tenant.organizationId);

  return (
    <Card>
      <CardHeader>
        <IconBadge size="lg"><ShoppingCart className="size-5" /></IconBadge>
        <CardTitle className="mt-3">Procurement</CardTitle>
        <CardDescription>
          {summary.pendingRequestCount} pending request{summary.pendingRequestCount === 1 ? "" : "s"} · {summary.openOrderCount} open order{summary.openOrderCount === 1 ? "" : "s"} · {summary.openOrderValue.toFixed(2)} outstanding
        </CardDescription>
      </CardHeader>
      {linkable ? (
        <CardContent>
          <Button size="sm" variant="outline" nativeButton={false} render={<Link href="/app/procurement" />}>
            Open Procurement
          </Button>
        </CardContent>
      ) : null}
    </Card>
  );
}
