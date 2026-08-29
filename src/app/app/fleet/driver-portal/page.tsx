import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PeriodicTrendChart } from "@/components/dashboard/charts";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getServerAuthSession } from "@/lib/auth/session";
import { getFleetDriverWorkspace, getFleetDriverTrends } from "@/modules/fleet/service";
import { DriverCollectionForm } from "./collection-form";
import { payFleetObligationOnline } from "./actions";
import { getSettlementProfile } from "@/lib/payments/operational";
import { AlertTriangle, Banknote, CarFront, CheckCircle2, Clock3, Wrench } from "lucide-react";

const ERROR_MESSAGES: Record<string, string> = {
  forbidden: "Your role does not include driver self-service.",
  "missing-fields": "Complete all required payment fields.",
  "invalid-type": "Choose an available payment obligation.",
  "invalid-amount": "Enter an amount greater than zero.",
  "invalid-target": "That payment does not match the selected vehicle's remittance schedule or active Work & Pay contract.",
  "invalid-evidence": "Choose a supported payment method and enter its transaction reference. Cash references are optional.",
  "invalid-date": "Use today or an earlier date for a completed payment and its obligation period.",
  "duplicate-period": "A pending or approved remittance already exists for that vehicle and payment period.",
  "not-found": "The selected vehicle or contract is no longer assigned to you.",
  "online-unavailable": "Online collections are not active. Pay the company using another method and record it below.",
  "online-failed": "Secure checkout could not be started. No payment was taken. Please try again.",
};

const TYPE_LABELS: Record<string, string> = {
  DAILY_SALES: "Daily vehicle remittance",
  WEEKLY_SALES: "Weekly vehicle remittance",
  WORK_AND_PAY: "Work & Pay instalment",
};

export default async function DriverPortalPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const { saved, error } = await searchParams;
  const tenant = await requireModuleAccess("fleet");
  if (!hasPermission(tenant, PERMISSIONS.FLEET_DRIVER_SELF_SERVICE)) redirect("/app/fleet");
  const session = await getServerAuthSession();
  if (!session?.user?.id) redirect("/login");
  const driver = await getFleetDriverWorkspace(tenant.organizationId, session.user.id);
  if (!driver) {
    return (
      <div className="space-y-6">
        <PageHeader title="Driver workspace" description="Your assigned vehicles, tasks, and payment obligations." />
        <p className="rounded-md border p-4 text-sm">Your administrator must link this login to an active driver profile.</p>
      </div>
    );
  }

  const vehicleOptions = driver.assignedVehicles.map((vehicle) => ({
    id: vehicle.id,
    plateNumber: vehicle.plateNumber,
    salesTargetPeriod: vehicle.salesTargetPeriod,
    salesTargetAmount: vehicle.salesTargetAmount?.toString() ?? null,
    contracts: vehicle.workAndPayContracts.map((contract) => ({
      id: contract.id,
      name: contract.contractName,
      paymentSchedule: contract.paymentSchedule,
      scheduledAmount: (contract.scheduledPaymentAmount ?? contract.weeklyPaymentAmount).toString(),
    })),
  }));
  const currency = tenant.organization.currency ?? "GHS";
  const settlement = await getSettlementProfile(tenant.organizationId);
  const onlineAvailable = settlement?.status === "ACTIVE" && settlement.onlineCollectionsEnabled;
  const today = new Date().toISOString().slice(0, 10);
  const openMaintenanceCount = driver.assignedVehicles.reduce(
    (total, vehicle) => total + vehicle.maintenanceRequests.filter((request) => !["COMPLETED", "CANCELLED"].includes(request.progressStatus)).length,
    0,
  );
  const pendingCount = driver.paymentSubmissions.filter((item) => item.status === "PENDING").length;
  const configuredObligations = vehicleOptions.reduce((total, vehicle) => total + (vehicle.salesTargetPeriod ? 1 : 0) + vehicle.contracts.length, 0);

  const vehicleIds = driver.assignedVehicles.map((vehicle) => vehicle.id);
  const contractIds = driver.assignedVehicles.flatMap((vehicle) => vehicle.workAndPayContracts.map((contract) => contract.id));
  const hasWorkAndPay = contractIds.length > 0;
  const trends = vehicleIds.length > 0 ? await getFleetDriverTrends(tenant.organizationId, { vehicleIds, contractIds }) : null;

  return (
    <div className="space-y-6">
      <PageHeader title={`Welcome, ${driver.name}`} description="See what needs attention, make or record payments, and track manager verification." />
      {saved ? <p role="status" className="flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-800 dark:text-emerald-300"><CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />Payment recorded. A manager will verify it before it is approved.</p> : null}
      {error && ERROR_MESSAGES[error] ? <p role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"><AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />{ERROR_MESSAGES[error]}</p> : null}

      <section aria-label="Workspace summary" className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border bg-card p-4"><div className="flex items-center gap-2 text-sm text-muted-foreground"><CarFront className="size-4" aria-hidden="true" />Assigned vehicles</div><p className="mt-2 text-2xl font-semibold">{driver.assignedVehicles.length}</p></div>
        <div className="rounded-xl border bg-card p-4"><div className="flex items-center gap-2 text-sm text-muted-foreground"><Clock3 className="size-4" aria-hidden="true" />Awaiting verification</div><p className="mt-2 text-2xl font-semibold">{pendingCount}</p></div>
        <div className="rounded-xl border bg-card p-4"><div className="flex items-center gap-2 text-sm text-muted-foreground"><Wrench className="size-4" aria-hidden="true" />Open maintenance</div><p className="mt-2 text-2xl font-semibold">{openMaintenanceCount}</p></div>
      </section>

      {driver.assignedVehicles.length === 0 ? (
        <p className="rounded-md border p-4 text-sm text-muted-foreground">No vehicle is currently assigned to you.</p>
      ) : (
        <section aria-labelledby="vehicles-heading" className="space-y-3">
          <div><h2 id="vehicles-heading" className="text-lg font-semibold">My vehicles</h2><p className="text-sm text-muted-foreground">Assignments, obligations, and maintenance at a glance.</p></div>
          <div className="grid gap-4 lg:grid-cols-2">
          {driver.assignedVehicles.map((vehicle) => {
            const openMaintenance = vehicle.maintenanceRequests.filter((request) => !["COMPLETED", "CANCELLED"].includes(request.progressStatus));
            return (
              <Card key={vehicle.id} className="overflow-hidden">
                <CardHeader>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <CardTitle>{vehicle.plateNumber}</CardTitle>
                      <CardDescription>{[vehicle.make, vehicle.model].filter(Boolean).join(" ") || vehicle.assetTag}</CardDescription>
                    </div>
                    <Badge variant={openMaintenance.length ? "secondary" : "outline"}>{openMaintenance.length} open task{openMaintenance.length === 1 ? "" : "s"}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="grid grid-cols-2 gap-3 rounded-lg bg-muted/40 p-3">
                    <div><p className="text-xs uppercase tracking-wide text-muted-foreground">Mileage</p><p className="mt-1 font-medium">{vehicle.mileage !== null ? Number(vehicle.mileage).toLocaleString() : "Not recorded"}</p></div>
                    <div><p className="text-xs uppercase tracking-wide text-muted-foreground">Remittance</p><p className="mt-1 font-medium">{vehicle.salesTargetPeriod && vehicle.salesTargetAmount ? `${currency} ${Number(vehicle.salesTargetAmount).toFixed(2)} / ${vehicle.salesTargetPeriod === "DAILY" ? "day" : "week"}` : "Not configured"}</p></div>
                  </div>
                  {onlineAvailable && vehicle.salesTargetPeriod && vehicle.salesTargetAmount ? <form action={payFleetObligationOnline}><input type="hidden" name="vehicleId" value={vehicle.id} /><input type="hidden" name="submissionType" value={vehicle.salesTargetPeriod === "DAILY" ? "DAILY_SALES" : "WEEKLY_SALES"} /><input type="hidden" name="periodStart" value={today} /><Button type="submit" className="w-full">Pay {currency} {Number(vehicle.salesTargetAmount).toFixed(2)} securely</Button></form> : null}
                  {vehicle.workAndPayContracts.map((contract) => {
                    const percentPaid = Math.min(Math.max(Number(contract.completionPercentage), 0), 100);
                    return (
                      <div key={contract.id} className="rounded-lg border p-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-medium">{contract.contractName}</p>
                          <p className="text-xs font-medium text-muted-foreground">{percentPaid.toFixed(0)}% paid</p>
                        </div>
                        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full bg-primary" style={{ width: `${percentPaid}%` }} />
                        </div>
                        <p className="mt-2 text-muted-foreground">{currency} {Number(contract.outstandingBalance).toFixed(2)} left to pay. {currency} {Number(contract.scheduledPaymentAmount ?? contract.weeklyPaymentAmount).toFixed(2)} per {contract.paymentSchedule === "DAILY" ? "day" : "week"}.</p>
                        {onlineAvailable ? <form action={payFleetObligationOnline} className="mt-3"><input type="hidden" name="vehicleId" value={vehicle.id} /><input type="hidden" name="contractId" value={contract.id} /><input type="hidden" name="submissionType" value="WORK_AND_PAY" /><input type="hidden" name="periodStart" value={today} /><Button type="submit" size="sm">Pay Work &amp; Pay instalment</Button></form> : null}
                      </div>
                    );
                  })}
                  <Button className="min-h-11 w-full sm:w-auto" variant="outline" nativeButton={false} render={<Link href="/app/fleet/maintenance" />}><Wrench aria-hidden="true" />Report maintenance concern</Button>
                </CardContent>
              </Card>
            );
          })}
          </div>
        </section>
      )}

      {trends ? (
        <Card>
          <CardHeader>
            <CardTitle>My revenue</CardTitle>
            <CardDescription>
              What you&apos;ve remitted from your assigned vehicle{driver.assignedVehicles.length === 1 ? "" : "s"}
              {hasWorkAndPay ? ", and what you've paid toward your Work & Pay contract" : ""}. Only your own figures, not the organization&apos;s.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {hasWorkAndPay ? (
              <Tabs defaultValue="vehicle">
                <TabsList variant="line">
                  <TabsTrigger value="vehicle">Vehicle remittance</TabsTrigger>
                  <TabsTrigger value="contract">Work & Pay</TabsTrigger>
                </TabsList>
                <TabsContent value="vehicle" className="mt-6">
                  <PeriodicTrendChart data={trends.vehicleRevenue} series={[{ key: "revenue", label: "Remitted" }]} currency={currency} />
                </TabsContent>
                <TabsContent value="contract" className="mt-6">
                  <PeriodicTrendChart data={trends.workAndPay} series={[{ key: "revenue", label: "Paid" }]} currency={currency} />
                </TabsContent>
              </Tabs>
            ) : (
              <PeriodicTrendChart data={trends.vehicleRevenue} series={[{ key: "revenue", label: "Remitted" }]} currency={currency} />
            )}
          </CardContent>
        </Card>
      ) : null}

      <section id="record-payment" className="scroll-mt-6 rounded-xl border bg-card p-4 sm:p-6">
        <div className="mb-5 flex items-start gap-3"><div className="rounded-lg bg-primary/10 p-2 text-primary"><Banknote className="size-5" aria-hidden="true" /></div><div><h2 className="text-lg font-semibold">Record a completed payment</h2><p className="text-sm text-muted-foreground">Use this after you have paid outside the app. Choose the obligation, add the payment evidence, then send it for verification.</p></div></div>
        <DriverCollectionForm vehicles={vehicleOptions} currency={currency} />
      </section>

      <section className="rounded-xl border bg-card p-4 sm:p-6">
        <div className="flex items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">Payment history</h2><p className="text-sm text-muted-foreground">Your 20 most recent submissions.</p></div>{configuredObligations > 0 ? <Badge variant="outline">{configuredObligations} active obligation{configuredObligations === 1 ? "" : "s"}</Badge> : null}</div>
        {driver.paymentSubmissions.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">No payments recorded yet.</p> : (
          <div className="mt-3 space-y-2">
            {driver.paymentSubmissions.map((item) => {
              const variance = item.expectedAmount ? Number(item.amount) - Number(item.expectedAmount) : null;
              return (
                <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 border-b py-3 text-sm last:border-0">
                  <div>
                    <p className="font-medium">{item.vehicle?.plateNumber ?? "Assigned vehicle"}. {TYPE_LABELS[item.submissionType]}</p>
                    <p className="text-muted-foreground">{item.periodStart.toLocaleDateString()} to {item.periodEnd.toLocaleDateString()}. {currency} {Number(item.amount).toFixed(2)}{variance === null || variance === 0 ? "" : ` (${currency} ${Math.abs(variance).toFixed(2)} ${variance < 0 ? "short" : "over"})`}</p>
                  </div>
                  <Badge variant={item.status === "APPROVED" ? "default" : item.status === "REJECTED" ? "destructive" : "outline"}>{item.status === "PENDING" ? "Awaiting verification" : item.status === "APPROVED" ? "Approved" : "Rejected"}</Badge>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
