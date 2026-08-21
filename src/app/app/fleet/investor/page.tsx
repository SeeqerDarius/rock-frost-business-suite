import { Landmark, Lock } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getServerAuthSession } from "@/lib/auth/session";
import { getFleetInvestorSummary, listFleetOwners } from "@/modules/fleet/service";

export default async function FleetInvestorPage() {
  const tenant = await requireModuleAccess("fleet");
  if (!hasPermission(tenant, PERMISSIONS.FLEET_INVESTOR_VIEW)) {
    return (
      <div className="space-y-6">
        <PageHeader title="Investor Dashboard" description="Owner-level fleet performance and investment position." />
        <EmptyState icon={Lock} title="Investor access required" description="Your role does not include access to fleet investor reporting." />
      </div>
    );
  }

  const session = await getServerAuthSession();
  const owners = await listFleetOwners(tenant.organizationId);
  const linkedOwner = owners.find((owner) => owner.userId === session?.user?.id);
  const rows = tenant.role === "Vehicle Owner" && !linkedOwner
    ? []
    : await getFleetInvestorSummary(tenant.organizationId, linkedOwner ? session?.user?.id : undefined);
  const totals = rows.reduce(
    (sum, row) => ({
      vehicles: sum.vehicles + row.vehicleCount,
      collected: sum.collected + row.amountCollected,
      outstanding: sum.outstanding + row.outstanding,
      maintenance: sum.maintenance + row.maintenanceCost,
      net: sum.net + row.netCashPosition,
    }),
    { vehicles: 0, collected: 0, outstanding: 0, maintenance: 0, net: 0 },
  );

  return (
    <div className="space-y-6">
      <PageHeader title="Investor Dashboard" description="Vehicle portfolio, remittances, obligations, maintenance costs and net cash position." />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {[
          ["Vehicles", totals.vehicles.toString()],
          ["Collected", totals.collected.toFixed(2)],
          ["Outstanding", totals.outstanding.toFixed(2)],
          ["Maintenance", totals.maintenance.toFixed(2)],
          ["Net cash", totals.net.toFixed(2)],
        ].map(([label, value]) => (
          <Card key={label}><CardHeader className="pb-2"><CardDescription>{label}</CardDescription><CardTitle>{value}</CardTitle></CardHeader></Card>
        ))}
      </div>
      {rows.length === 0 ? (
        <EmptyState icon={Landmark} title="No owner portfolio linked" description="Link this login to a vehicle owner or add vehicles to the owner portfolio." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {rows.map((row) => (
            <Card key={row.owner.id}>
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <div><CardTitle>{row.owner.name}</CardTitle><CardDescription>{row.owner.businessName ?? "Individual owner"}</CardDescription></div>
                  <Badge variant={row.maintenanceOpenCount > 0 ? "secondary" : "default"}>{row.maintenanceOpenCount} open repairs</Badge>
                </div>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-3 text-sm">
                <div><p className="text-muted-foreground">Vehicles active</p><p className="font-medium">{row.activeVehicleCount} / {row.vehicleCount}</p></div>
                <div><p className="text-muted-foreground">Active agreements</p><p className="font-medium">{row.activeContractCount}</p></div>
                <div><p className="text-muted-foreground">Contract value</p><p className="font-medium">{row.contractValue.toFixed(2)}</p></div>
                <div><p className="text-muted-foreground">Collections</p><p className="font-medium">{row.amountCollected.toFixed(2)}</p></div>
                <div><p className="text-muted-foreground">Outstanding</p><p className="font-medium">{row.outstanding.toFixed(2)}</p></div>
                <div><p className="text-muted-foreground">Net cash</p><p className="font-medium">{row.netCashPosition.toFixed(2)}</p></div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
