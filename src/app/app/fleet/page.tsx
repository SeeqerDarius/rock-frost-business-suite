import Link from "next/link";
import { Truck, UserRound, Wrench, Handshake } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { getFleetSummary } from "@/modules/fleet/service";

export default async function FleetOverviewPage() {
  const tenant = await requireModuleAccess("fleet");
  const summary = await getFleetSummary(tenant.organizationId);

  const stats = [
    { label: "Vehicles", value: summary.vehicleCount, icon: Truck, href: "/app/fleet/vehicles" },
    { label: "Active drivers", value: summary.activeDriverCount, icon: UserRound, href: "/app/fleet/drivers" },
    { label: "Pending maintenance", value: summary.pendingMaintenanceCount, icon: Wrench, href: "/app/fleet/maintenance" },
    { label: "Active work & pay contracts", value: summary.activeContractCount, icon: Handshake, href: "/app/fleet/work-and-pay" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Fleet Overview" description="Vehicles, drivers, owners, and maintenance at a glance." />
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
