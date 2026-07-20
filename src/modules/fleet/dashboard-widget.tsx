import Link from "next/link";
import { Truck } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { requireCurrentTenant } from "@/lib/tenant";
import { getFleetSummary } from "@/modules/fleet/service";

export async function FleetDashboardWidget() {
  const tenant = await requireCurrentTenant();
  const summary = await getFleetSummary(tenant.organizationId);

  return (
    <Card>
      <CardHeader>
        <Truck className="size-6 text-muted-foreground" />
        <CardTitle className="mt-3">Fleet Management</CardTitle>
        <CardDescription>
          {summary.vehicleCount} vehicle{summary.vehicleCount === 1 ? "" : "s"} · {summary.activeDriverCount} active driver
          {summary.activeDriverCount === 1 ? "" : "s"} · {summary.pendingMaintenanceCount} pending maintenance request
          {summary.pendingMaintenanceCount === 1 ? "" : "s"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button size="sm" variant="outline" nativeButton={false} render={<Link href="/app/fleet" />}>
          Open Fleet Management
        </Button>
      </CardContent>
    </Card>
  );
}
