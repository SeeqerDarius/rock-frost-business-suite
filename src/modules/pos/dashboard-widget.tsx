import Link from "next/link";
import { Store } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { requireCurrentTenant } from "@/lib/tenant";
import { getPosSummary } from "@/modules/pos/service";

export async function PosDashboardWidget() {
  const tenant = await requireCurrentTenant();
  const summary = await getPosSummary(tenant.organizationId);

  return (
    <Card>
      <CardHeader>
        <Store className="size-6 text-muted-foreground" />
        <CardTitle className="mt-3">Point of Sale</CardTitle>
        <CardDescription>
          {summary.openSessionCount} open session{summary.openSessionCount === 1 ? "" : "s"} · {summary.todaysSalesCount} sale{summary.todaysSalesCount === 1 ? "" : "s"} today · {summary.todaysSalesTotal.toFixed(2)}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button size="sm" variant="outline" nativeButton={false} render={<Link href="/app/pos" />}>
          Open POS
        </Button>
      </CardContent>
    </Card>
  );
}
