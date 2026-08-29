import Link from "next/link";
import { AlertTriangle, ArrowRight, Car, CircleDollarSign, Landmark, Lock, MessageSquareText, ReceiptText, ShieldCheck, Wrench } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { PeriodicTrendChart } from "@/components/dashboard/charts";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getServerAuthSession } from "@/lib/auth/session";
import { formatMoney } from "@/lib/currency";
import { getFleetInvestorSummary, getFleetInvestorTrends } from "@/modules/fleet/service";
import { getFleetOwnerWorkspace } from "@/modules/fleet/owner-workspace";

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  return status === "ASSIGNED" || status === "AVAILABLE" ? "default" : status === "MAINTENANCE" ? "destructive" : "secondary";
}

export default async function FleetInvestorPage() {
  const tenant = await requireModuleAccess("fleet");
  if (!hasPermission(tenant, PERMISSIONS.FLEET_INVESTOR_VIEW)) {
    return <div className="space-y-6"><PageHeader title="Owner Workspace" description="Your vehicle portfolio and financial activity." /><EmptyState icon={Lock} title="Owner access required" description="Your role does not include access to vehicle-owner reporting." /></div>;
  }
  const session = await getServerAuthSession();
  if (tenant.role === "Vehicle Owner") {
    const workspace = session?.user?.id ? await getFleetOwnerWorkspace(tenant.organizationId, session.user.id) : null;
    return <OwnerWorkspace workspace={workspace} currency={tenant.organization.currency ?? "GHS"} />;
  }

  const [rows, trends] = await Promise.all([getFleetInvestorSummary(tenant.organizationId), getFleetInvestorTrends(tenant.organizationId)]);
  const totals = rows.reduce((sum, row) => ({ vehicles: sum.vehicles + row.vehicleCount, collected: sum.collected + row.amountCollected, outstanding: sum.outstanding + row.outstanding, maintenance: sum.maintenance + row.maintenanceCost, net: sum.net + row.netCashPosition }), { vehicles: 0, collected: 0, outstanding: 0, maintenance: 0, net: 0 });
  const currency = tenant.organization.currency ?? "GHS";
  return <div className="space-y-6"><PageHeader title="Owner Portfolio Overview" description="Organization-level owner portfolios, verified collections and operating position." /><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">{[["Vehicles", totals.vehicles.toString()], ["Collected", formatMoney(totals.collected, currency)], ["Outstanding contracts", formatMoney(totals.outstanding, currency)], ["Maintenance", formatMoney(totals.maintenance, currency)], ["Operating position", formatMoney(totals.net, currency)]].map(([label, value]) => <Card key={label}><CardHeader className="pb-2"><CardDescription>{label}</CardDescription><CardTitle>{value}</CardTitle></CardHeader></Card>)}</div><Card><CardHeader><CardTitle>Collections trend</CardTitle><CardDescription>Verified payments across linked owner portfolios.</CardDescription></CardHeader><CardContent><PeriodicTrendChart data={trends.trends} series={[{ key: "revenue", label: "Collected" }]} currency={currency} /></CardContent></Card><div className="grid gap-4 lg:grid-cols-2">{rows.map((row) => <Card key={row.owner.id}><CardHeader><CardTitle>{row.owner.name}</CardTitle><CardDescription>{row.owner.businessName ?? "Individual owner"}</CardDescription></CardHeader><CardContent className="grid grid-cols-2 gap-3 text-sm"><div><p className="text-muted-foreground">Vehicles</p><p className="font-medium">{row.vehicleCount}</p></div><div><p className="text-muted-foreground">Open repairs</p><p className="font-medium">{row.maintenanceOpenCount}</p></div><div><p className="text-muted-foreground">Verified collections</p><p className="font-medium">{formatMoney(row.amountCollected, currency)}</p></div><div><p className="text-muted-foreground">Operating position</p><p className="font-medium">{formatMoney(row.netCashPosition, currency)}</p></div></CardContent></Card>)}</div></div>;
}

type OwnerWorkspaceData = NonNullable<Awaited<ReturnType<typeof getFleetOwnerWorkspace>>>;

function OwnerWorkspace({ workspace, currency }: { workspace: OwnerWorkspaceData | null; currency: string }) {
  if (!workspace) return <div className="space-y-6"><PageHeader title="Owner Workspace" description="Your vehicles, remittances and maintenance." /><EmptyState icon={Landmark} title="No owner portfolio linked" description="Ask Fleet management to link your login to your vehicle-owner record." /></div>;
  const { totals } = workspace;
  return <div className="space-y-6">
    <PageHeader title="Owner Workspace" description={`Welcome, ${workspace.owner.name}. See what your vehicles earned, what needs attention and what Fleet management must resolve.`} />
    {totals.attentionCount > 0 ? <Card className="border-amber-500/40 bg-amber-500/5"><CardHeader className="pb-3"><div className="flex items-start gap-3"><AlertTriangle className="mt-0.5 size-5 text-amber-600" /><div><CardTitle>Needs your attention</CardTitle><CardDescription>{totals.attentionCount} vehicle issue{totals.attentionCount === 1 ? "" : "s"} need review, including overdue remittances, approvals, driver gaps or expiring documents.</CardDescription></div></div></CardHeader></Card> : null}
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[
      { label: "My vehicles", value: totals.vehicleCount.toString(), note: `${totals.activeCount} active`, icon: Car },
      { label: "Expected this period", value: formatMoney(totals.expectedThisPeriod, currency), note: `${formatMoney(totals.remainingThisPeriod, currency)} remaining`, icon: CircleDollarSign },
      { label: "Verified this period", value: formatMoney(totals.paidThisPeriod, currency), note: totals.overdueAmount > 0 ? `${formatMoney(totals.overdueAmount, currency)} overdue` : "No overdue balance", icon: ShieldCheck },
      { label: "Verified expenses", value: formatMoney(totals.verifiedExpenses, currency), note: `${totals.maintenanceCount} vehicles in maintenance`, icon: Wrench },
    ].map(({ label, value, note, icon: Icon }) => <Card key={label}><CardHeader className="pb-2"><div className="flex items-center justify-between"><CardDescription>{label}</CardDescription><Icon className="size-4 text-muted-foreground" /></div><CardTitle className="text-2xl">{value}</CardTitle><p className="text-xs text-muted-foreground">{note}</p></CardHeader></Card>)}</div>
    <div className="grid gap-4 lg:grid-cols-[1fr_0.72fr]"><Card><CardHeader><CardTitle>Portfolio performance</CardTitle><CardDescription>Verified collections, completed maintenance expenses and operating position. These figures are not an owner settlement calculation.</CardDescription></CardHeader><CardContent><PeriodicTrendChart data={workspace.trends} series={[{ key: "collected", label: "Verified collections" }, { key: "expenses", label: "Verified expenses" }, { key: "operatingPosition", label: "Operating position" }]} currency={currency} defaultPeriod="weeks" /></CardContent></Card><Card><CardHeader><CardTitle>Owner settlement</CardTitle><CardDescription>What can currently be calculated safely.</CardDescription></CardHeader><CardContent className="space-y-4"><div className="rounded-lg border bg-muted/30 p-4"><p className="font-medium">Settlement calculation not configured</p><p className="mt-1 text-sm text-muted-foreground">No approved owner agreement defines revenue share, management fees, expense responsibility or settlement frequency. Rock Frost will not estimate your entitlement.</p></div><div className="grid grid-cols-2 gap-3 text-sm"><div><p className="text-muted-foreground">Verified collections</p><p className="font-semibold">{formatMoney(totals.verifiedCollections, currency)}</p></div><div><p className="text-muted-foreground">Operating position</p><p className="font-semibold">{formatMoney(totals.operatingPosition, currency)}</p></div></div></CardContent></Card></div>
    <section className="space-y-3" aria-labelledby="owner-vehicles"><div className="flex flex-wrap items-end justify-between gap-3"><div><h2 id="owner-vehicles" className="text-xl font-semibold">My vehicles</h2><p className="text-sm text-muted-foreground">Open a vehicle to review its driver, remittance, expenses, maintenance and documents.</p></div><Button nativeButton={false} render={<Link href="/app/support" />} variant="outline"><MessageSquareText className="size-4" />Contact support</Button></div>
      {workspace.vehicles.length === 0 ? <EmptyState icon={Car} title="No vehicles linked" description="Fleet management must link a vehicle to your owner profile before it appears here." /> : <div className="grid gap-4 lg:grid-cols-2">{workspace.vehicles.map((vehicle) => {
        const achieved = vehicle.obligation?.expectedAmount ? Math.min((vehicle.obligation.paidThisPeriod / vehicle.obligation.expectedAmount) * 100, 100) : 0;
        return <Card key={vehicle.id} className={vehicle.attentionCount > 0 ? "border-amber-500/30" : undefined}><CardHeader><div className="flex items-start justify-between gap-3"><div><CardTitle>{vehicle.plateNumber}</CardTitle><CardDescription>{[vehicle.make, vehicle.model, vehicle.year].filter(Boolean).join(" ") || vehicle.assetTag}</CardDescription></div><Badge variant={statusVariant(vehicle.status)}>{vehicle.status.replaceAll("_", " ")}</Badge></div></CardHeader><CardContent className="space-y-4"><div className="grid grid-cols-2 gap-3 text-sm"><div><p className="text-muted-foreground">Current driver</p><p className="font-medium">{vehicle.assignedDriver?.name ?? "Not assigned"}</p></div><div><p className="text-muted-foreground">Schedule</p><p className="font-medium">{vehicle.obligation ? `${vehicle.obligation.type === "DAILY" ? "Daily" : "Weekly"} · ${formatMoney(vehicle.obligation.expectedAmount, currency)}` : "Not configured"}</p></div><div><p className="text-muted-foreground">Paid this period</p><p className="font-medium">{formatMoney(vehicle.obligation?.paidThisPeriod ?? 0, currency)}</p></div><div><p className="text-muted-foreground">Verified expenses</p><p className="font-medium">{formatMoney(vehicle.verifiedExpenses, currency)}</p></div></div>{vehicle.obligation ? <div className="space-y-1.5"><div className="flex justify-between text-xs"><span>{Math.round(achieved)}% of target</span><span>{formatMoney(vehicle.obligation.dueNow, currency)} remaining</span></div><Progress value={achieved} /></div> : null}<div className="flex items-center justify-between gap-3"><div className="flex flex-wrap gap-2">{vehicle.attentionCount > 0 ? <Badge variant="outline">{vehicle.attentionCount} need attention</Badge> : <Badge variant="outline">Up to date</Badge>}{vehicle.openMaintenanceCount > 0 ? <Badge variant="secondary">{vehicle.openMaintenanceCount} open repairs</Badge> : null}</div><Button nativeButton={false} render={<Link href={`/app/fleet/investor/vehicles/${vehicle.id}`} />} size="sm">View vehicle<ArrowRight className="size-4" /></Button></div></CardContent></Card>;
      })}</div>}
    </section>
    <Card><CardHeader><div className="flex items-center gap-2"><ReceiptText className="size-5" /><CardTitle>Financial meaning</CardTitle></div><CardDescription>Only verified payments count as collected. Only completed and verified repair costs count as expenses. Pending, rejected or reversed records are excluded.</CardDescription></CardHeader></Card>
  </div>;
}
