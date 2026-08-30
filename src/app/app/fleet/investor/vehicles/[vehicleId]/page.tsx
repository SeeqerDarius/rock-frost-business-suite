import Link from "next/link";
import { ArrowLeft, CalendarClock, Car, FileWarning, Lock, ReceiptText, UserRound, Wrench } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/feedback/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Progress } from "@/components/ui/progress";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { getServerAuthSession } from "@/lib/auth/session";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { formatMoney } from "@/lib/currency";
import { getFleetOwnerVehicleWorkspace } from "@/modules/fleet/owner-workspace";

const formatDate = (value: Date) => new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "UTC" }).format(value);

export default async function OwnerVehiclePage({ params }: { params: Promise<{ vehicleId: string }> }) {
  const tenant = await requireModuleAccess("fleet");
  const session = await getServerAuthSession();
  if (!hasPermission(tenant, PERMISSIONS.FLEET_INVESTOR_VIEW) || tenant.role !== "Vehicle Owner" || !session?.user?.id) {
    return <EmptyState icon={Lock} title="Vehicle unavailable" description="This vehicle is not part of your owner portfolio." />;
  }
  const { vehicleId } = await params;
  const result = await getFleetOwnerVehicleWorkspace(tenant.organizationId, session.user.id, vehicleId);
  if (!result) return <EmptyState icon={Lock} title="Vehicle unavailable" description="This vehicle is not part of your owner portfolio." />;
  const { vehicle } = result;
  const currency = tenant.organization.currency ?? "GHS";
  const achieved = vehicle.obligation?.expectedAmount ? Math.min((vehicle.obligation.paidThisPeriod / vehicle.obligation.expectedAmount) * 100, 100) : 0;

  return <div className="space-y-6">
    <Button nativeButton={false} render={<Link href="/app/fleet/investor" />} variant="ghost" size="sm"><ArrowLeft className="size-4" />Owner Workspace</Button>
    <PageHeader title={vehicle.plateNumber} description={[vehicle.make, vehicle.model, vehicle.year, vehicle.assetTag].filter(Boolean).join(" · ")} />
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Card><CardHeader className="pb-2"><CardDescription>Vehicle status</CardDescription><CardTitle className="text-xl">{vehicle.status.replaceAll("_", " ")}</CardTitle></CardHeader></Card>
      <Card><CardHeader className="pb-2"><CardDescription>Current driver</CardDescription><CardTitle className="text-xl">{vehicle.assignedDriver?.name ?? "Not assigned"}</CardTitle></CardHeader></Card>
      <Card><CardHeader className="pb-2"><CardDescription>Verified collections</CardDescription><CardTitle className="text-xl">{formatMoney(vehicle.verifiedCollections, currency)}</CardTitle></CardHeader></Card>
      <Card><CardHeader className="pb-2"><CardDescription>Verified expenses</CardDescription><CardTitle className="text-xl">{formatMoney(vehicle.verifiedExpenses, currency)}</CardTitle></CardHeader></Card>
    </div>

    <div className="grid gap-4 lg:grid-cols-2">
      <Card><CardHeader><div className="flex items-center gap-2"><ReceiptText className="size-5" /><CardTitle>Remittance</CardTitle></div><CardDescription>The current server-derived obligation and verified payment progress.</CardDescription></CardHeader><CardContent className="space-y-4">{vehicle.obligation ? <><div className="grid grid-cols-2 gap-4 text-sm"><div><p className="text-muted-foreground">{vehicle.obligation.type === "DAILY" ? "Daily target" : "Weekly target"}</p><p className="font-semibold">{formatMoney(vehicle.obligation.expectedAmount, currency)}</p></div><div><p className="text-muted-foreground">Verified this period</p><p className="font-semibold">{formatMoney(vehicle.obligation.paidThisPeriod, currency)}</p></div><div><p className="text-muted-foreground">Remaining</p><p className="font-semibold">{formatMoney(vehicle.obligation.dueNow, currency)}</p></div><div><p className="text-muted-foreground">Overdue</p><p className="font-semibold">{formatMoney(vehicle.obligation.overdueAmount, currency)}</p></div></div><Progress value={achieved} /><p className="text-xs text-muted-foreground">{Math.round(achieved)}% achieved for the matching {vehicle.obligation.type.toLowerCase()} period.</p></> : <p className="rounded-lg border bg-muted/30 p-4 text-sm">No daily or weekly remittance target is configured for this vehicle.</p>}</CardContent></Card>
      <Card><CardHeader><div className="flex items-center gap-2"><UserRound className="size-5" /><CardTitle>Driver and assignment</CardTitle></div></CardHeader><CardContent>{vehicle.assignedDriver ? <div className="space-y-2 text-sm"><p className="font-semibold">{vehicle.assignedDriver.name}</p><Badge>{vehicle.assignedDriver.status}</Badge><p className="text-muted-foreground">Only operational identity and assignment status are shown. Private HR and disciplinary information remains restricted.</p></div> : <p className="text-sm text-muted-foreground">No driver is currently assigned. Contact Fleet management for operational follow-up.</p>}</CardContent></Card>
    </div>

    <Card><CardHeader><div className="flex items-center gap-2"><Wrench className="size-5" /><CardTitle>Maintenance</CardTitle></div><CardDescription>Owner approvals and verified repair history for this vehicle.</CardDescription></CardHeader><CardContent>{vehicle.maintenanceRequests.length === 0 ? <p className="text-sm text-muted-foreground">No maintenance activity recorded.</p> : <div className="space-y-3">{vehicle.maintenanceRequests.map((request) => <div key={request.id} className="rounded-lg border p-3 text-sm"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-medium">{request.faultDescription}</p><p className="text-xs text-muted-foreground">Reported {formatDate(request.requestedAt)}</p></div><div className="flex gap-2"><Badge variant="outline">{request.progressStatus.replaceAll("_", " ")}</Badge>{request.ownerApprovalRequired ? <Badge variant={request.ownerApprovalStatus === "REJECTED" ? "destructive" : "secondary"}>Owner {request.ownerApprovalStatus.toLowerCase()}</Badge> : null}</div></div>{request.repairCost ? <p className="mt-2">Repair cost: <strong>{formatMoney(request.repairCost, currency)}</strong>{request.progressStatus === "VERIFIED" ? " · Verified" : " · Awaiting completion verification"}</p> : null}{request.attachments.length > 0 ? <p className="mt-2 flex flex-wrap gap-2 text-xs">{request.attachments.map((attachment, index) => <a key={attachment.id} className="underline underline-offset-2 hover:text-foreground" href={`/api/fleet/maintenance/attachments/${attachment.id}`} target="_blank" rel="noreferrer">Photo {index + 1}</a>)}</p> : null}</div>)}</div>}</CardContent></Card>

    <div className="grid gap-4 lg:grid-cols-2"><Card><CardHeader><div className="flex items-center gap-2"><FileWarning className="size-5" /><CardTitle>Documents</CardTitle></div></CardHeader><CardContent>{vehicle.documents.length === 0 ? <p className="text-sm text-muted-foreground">No insurance or roadworthy document is recorded.</p> : <div className="space-y-3">{vehicle.documents.map((document) => <div key={document.id} className="rounded-lg border p-3 text-sm"><div className="flex justify-between gap-3"><p className="font-medium">{document.provider}</p><Badge variant={document.renewalStatus === "DUE" ? "destructive" : "outline"}>{document.renewalStatus}</Badge></div><p className="mt-2 text-muted-foreground">Insurance: {formatDate(document.insuranceExpiresAt)}</p><p className="text-muted-foreground">Roadworthy: {formatDate(document.roadworthyExpiresAt)}</p></div>)}</div>}</CardContent></Card><Card><CardHeader><div className="flex items-center gap-2"><CalendarClock className="size-5" /><CardTitle>Settlement and activity</CardTitle></div></CardHeader><CardContent className="space-y-4"><div className="rounded-lg border bg-muted/30 p-3 text-sm"><p className="font-medium">Settlement calculation not configured</p><p className="mt-1 text-muted-foreground">Verified collections and expenses are visible, but no owner agreement defines an entitlement or payment schedule.</p></div><div><p className="mb-2 text-sm font-medium">Recent verified payments</p>{vehicle.payments.length === 0 ? <p className="text-sm text-muted-foreground">No verified payments yet.</p> : <div className="space-y-2">{vehicle.payments.slice(0, 8).map((payment) => <div key={payment.id} className="flex justify-between gap-3 border-b py-2 text-sm last:border-0"><span>{formatDate(payment.date)} · {payment.reference}</span><strong>{formatMoney(payment.amount, currency)}</strong></div>)}</div>}</div></CardContent></Card></div>
    <Card><CardHeader><div className="flex items-center gap-2"><Car className="size-5" /><CardTitle>Ownership history</CardTitle></div></CardHeader><CardContent>{vehicle.ownershipHistory.length === 0 ? <p className="text-sm text-muted-foreground">No ownership changes recorded.</p> : <div className="space-y-2 text-sm">{vehicle.ownershipHistory.map((event) => <p key={event.id}>{formatDate(event.changedAt)} · Linked to {event.newOwnerName ?? "an owner"}</p>)}</div>}</CardContent></Card>
  </div>;
}
