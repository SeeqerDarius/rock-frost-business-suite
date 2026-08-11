import { Truck, UserRound, Wrench, Handshake } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { OverviewMetricCard } from "@/components/dashboard/overview-metric-card";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { getFleetSummary } from "@/modules/fleet/service";

export default async function FleetOverviewPage() {
  const tenant = await requireModuleAccess("fleet");
  const summary = await getFleetSummary(tenant.organizationId);

  const stats = [
    { label: "Vehicles", value: summary.vehicleCount, description: "Vehicles registered in the fleet", icon: <Truck className="size-4" />, href: "/app/fleet/vehicles" },
    { label: "Active drivers", value: summary.activeDriverCount, description: "Drivers currently assigned to vehicles", icon: <UserRound className="size-4" />, href: "/app/fleet/drivers" },
    { label: "Pending maintenance", value: summary.pendingMaintenanceCount, description: "Maintenance requests awaiting action", icon: <Wrench className="size-4" />, href: "/app/fleet/maintenance" },
    { label: "Active work & pay contracts", value: summary.activeContractCount, description: "Contracts currently in effect", icon: <Handshake className="size-4" />, href: "/app/fleet/work-and-pay" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Fleet Overview" description="Vehicles, drivers, owners, and maintenance at a glance." />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => <OverviewMetricCard key={stat.label} {...stat} />)}
      </div>
    </div>
  );
}
