import { redirect } from "next/navigation";
import { Truck, UserRound, Users, Wrench, Handshake, Receipt, ShieldAlert, WalletCards } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { OverviewMetricCard } from "@/components/dashboard/overview-metric-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getFleetSummary } from "@/modules/fleet/service";

export default async function FleetOverviewPage() {
  const tenant = await requireModuleAccess("fleet");
  if (!hasPermission(tenant, PERMISSIONS.FLEET_VIEW)) {
    if (hasPermission(tenant, PERMISSIONS.FLEET_DRIVER_SELF_SERVICE)) redirect("/app/fleet/driver-portal");
    if (hasPermission(tenant, PERMISSIONS.FLEET_INVESTOR_VIEW)) redirect("/app/fleet/investor");
    redirect("/app/dashboard");
  }
  const summary = await getFleetSummary(tenant.organizationId);
  const currency = tenant.organization.currency ?? "GHS";

  const stats = [
    { label: "Vehicles", value: summary.vehicleCount, description: "Vehicles registered in the fleet", icon: <Truck className="size-4" />, href: "/app/fleet/vehicles" },
    { label: "Active drivers", value: summary.activeDriverCount, description: "Active driver profiles", icon: <UserRound className="size-4" />, href: "/app/fleet/drivers" },
    { label: "Vehicle owners", value: summary.ownerCount, description: "Owner portfolios", icon: <Users className="size-4" />, href: "/app/fleet/owners" },
    { label: "Under maintenance", value: summary.maintenanceVehicleCount, description: "Vehicles with open repairs", icon: <Wrench className="size-4" />, href: "/app/fleet/maintenance" },
    { label: "Pending requests", value: summary.pendingMaintenanceCount, description: "Maintenance requests awaiting completion", icon: <Wrench className="size-4" />, href: "/app/fleet/maintenance" },
    { label: "Pending remittances", value: summary.pendingDriverSubmissionCount, description: "Driver-recorded payments awaiting verification", icon: <Receipt className="size-4" />, href: "/app/fleet/payments" },
    { label: "Expiring documents", value: summary.expiringDocumentCount, description: "Insurance or roadworthy attention", icon: <ShieldAlert className="size-4" />, href: "/app/fleet/insurance-roadworthy" },
    { label: "Active Work & Pay", value: summary.activeContractCount, description: "Contracts currently in effect", icon: <Handshake className="size-4" />, href: "/app/fleet/work-and-pay" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Fleet Overview" description="Vehicles, drivers, owners, maintenance, remittances, and obligations at a glance." />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => <OverviewMetricCard key={stat.label} {...stat} />)}
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Card><CardHeader><CardDescription>Verified revenue, last 7 days</CardDescription><CardTitle>{currency} {summary.weeklyRevenue.toFixed(2)}</CardTitle></CardHeader></Card>
        <Card><CardHeader><CardDescription>Verified revenue this month</CardDescription><CardTitle>{currency} {summary.monthlyRevenue.toFixed(2)}</CardTitle></CardHeader></Card>
        <Card><CardHeader><CardDescription>Outstanding Work & Pay balance</CardDescription><CardTitle>{currency} {summary.outstandingBalance.toFixed(2)}</CardTitle></CardHeader></Card>
      </div>
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2"><WalletCards className="size-5 text-muted-foreground" /><CardTitle>Recent payments</CardTitle></div>
          <CardDescription>Latest fleet payment activity across driver remittances, contracts, payouts, and maintenance.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {summary.recentPayments.length === 0 ? <p className="text-sm text-muted-foreground">No fleet payments recorded yet.</p> : summary.recentPayments.map((payment) => (
            <div key={payment.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 text-sm">
              <div><p className="font-medium">{payment.reference}</p><p className="text-muted-foreground">{payment.type.replaceAll("_", " ")}. {payment.date.toLocaleDateString()}</p></div>
              <div className="flex items-center gap-3"><span className="font-medium">{currency} {Number(payment.amount).toFixed(2)}</span><Badge variant={payment.status === "VERIFIED" ? "default" : "outline"}>{payment.status}</Badge></div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
