import Link from "next/link";
import { Truck } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { IconBadge } from "@/components/ui/icon-badge";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getFleetDriverDashboardSummary, getFleetInvestorSummary, getFleetSummary } from "@/modules/fleet/service";

export async function FleetDashboardWidget({ linkable = true }: { linkable?: boolean } = {}) {
  const tenant = await requireModuleAccess("fleet");
  const isDriverOnly =
    hasPermission(tenant, PERMISSIONS.FLEET_DRIVER_SELF_SERVICE) &&
    !hasPermission(tenant, PERMISSIONS.FLEET_VIEW);
  const isOwnerOnly =
    hasPermission(tenant, PERMISSIONS.FLEET_INVESTOR_VIEW) &&
    !hasPermission(tenant, PERMISSIONS.FLEET_VIEW) &&
    !isDriverOnly;
  const driverSummary = isDriverOnly ? await getFleetDriverDashboardSummary(tenant.organizationId, tenant.userId) : null;
  const ownerRows = isOwnerOnly
    ? await getFleetInvestorSummary(tenant.organizationId, tenant.role === "Vehicle Owner" ? tenant.userId : undefined)
    : null;
  const summary = !isDriverOnly && !isOwnerOnly ? await getFleetSummary(tenant.organizationId) : null;
  const ownerTotals = ownerRows?.reduce(
    (total, row) => ({ vehicles: total.vehicles + row.vehicleCount, outstanding: total.outstanding + row.outstanding }),
    { vehicles: 0, outstanding: 0 },
  );
  const description = driverSummary
    ? `${driverSummary.assignedVehicleCount} assigned vehicle${driverSummary.assignedVehicleCount === 1 ? "" : "s"}. ${driverSummary.openMaintenanceCount} open maintenance task${driverSummary.openMaintenanceCount === 1 ? "" : "s"}. ${driverSummary.pendingSubmissionCount} pending collection${driverSummary.pendingSubmissionCount === 1 ? "" : "s"}.`
    : ownerTotals
      ? `${ownerTotals.vehicles} vehicle${ownerTotals.vehicles === 1 ? "" : "s"} in your portfolio. ${tenant.organization.currency ?? "GHS"} ${ownerTotals.outstanding.toFixed(2)} outstanding.`
      : `${summary?.vehicleCount ?? 0} vehicle${summary?.vehicleCount === 1 ? "" : "s"}. ${summary?.activeDriverCount ?? 0} active driver${summary?.activeDriverCount === 1 ? "" : "s"}. ${summary?.pendingMaintenanceCount ?? 0} pending maintenance request${summary?.pendingMaintenanceCount === 1 ? "" : "s"}.`;
  const href = isDriverOnly ? "/app/fleet/driver-portal" : isOwnerOnly ? "/app/fleet/investor" : "/app/fleet";

  return (
    <Card>
      <CardHeader>
        <IconBadge size="lg"><Truck className="size-5" /></IconBadge>
        <CardTitle className="mt-3">Fleet Management</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      {linkable ? (
        <CardContent>
          <Button size="sm" variant="outline" nativeButton={false} render={<Link href={href} />}>
            Open Fleet Management
          </Button>
        </CardContent>
      ) : null}
    </Card>
  );
}
