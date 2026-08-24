import Link from "next/link";
import { Store } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { IconBadge } from "@/components/ui/icon-badge";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { getPosSummary } from "@/modules/pos/service";

export async function PosDashboardWidget({ linkable = true }: { linkable?: boolean } = {}) {
  const tenant = await requireModuleAccess("pos");
  const summary = await getPosSummary(tenant.organizationId);

  return (
    <Card>
      <CardHeader>
        <IconBadge size="lg"><Store className="size-5" /></IconBadge>
        <CardTitle className="mt-3">Point of Sale</CardTitle>
        <CardDescription>
          {summary.openSessionCount} open session{summary.openSessionCount === 1 ? "" : "s"} · {summary.todaysSalesCount} sale{summary.todaysSalesCount === 1 ? "" : "s"} today · {summary.todaysSalesTotal.toFixed(2)}
        </CardDescription>
      </CardHeader>
      {linkable ? (
        <CardContent>
          <Button size="sm" variant="outline" nativeButton={false} render={<Link href="/app/pos" />}>
            Open POS
          </Button>
        </CardContent>
      ) : null}
    </Card>
  );
}
