import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PeriodicTrendChart } from "@/components/dashboard/charts";
import { EntityDialog } from "@/components/forms/entity-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getServerAuthSession } from "@/lib/auth/session";
import { getFleetDriverWorkspace, getFleetDriverTrends } from "@/modules/fleet/service";
import { DriverCollectionForm } from "./collection-form";
import { payFleetObligationOnline, reportMaintenanceFromDriverPortal } from "./actions";
import { getSettlementProfile } from "@/lib/payments/operational";
import { AlertTriangle, Banknote, CarFront, CheckCircle2, Clock3, Plus, Wrench } from "lucide-react";

const ERROR_MESSAGES: Record<string, string> = {
  forbidden: "Your role does not include driver self-service.",
  "missing-fields": "Complete all required fields.",
  "invalid-type": "Choose an available payment obligation.",
  "invalid-amount": "Enter an amount greater than zero.",
  "invalid-target": "That payment does not match the selected vehicle's remittance schedule or active Work & Pay contract.",
  "invalid-evidence": "Choose a supported payment method and enter its transaction reference. Cash references are optional.",
  "invalid-date": "Use today or an earlier date for a completed payment and its obligation period.",
  "duplicate-period": "A pending or approved remittance already exists for that vehicle and payment period.",
  "not-found": "The selected vehicle or contract is no longer assigned to you.",
  "invalid-photo": "Use a JPEG, PNG, or WebP photo no larger than 1 MB.",
  "online-unavailable": "Online collections are not active. Pay the company using another method and record it below.",
  "online-failed": "Secure checkout could not be started. No payment was taken. Please try again.",
};

const TYPE_LABELS: Record<string, string> = {
  DAILY_SALES: "Daily vehicle remittance",
  WEEKLY_SALES: "Weekly vehicle remittance",
  WORK_AND_PAY: "Work & Pay instalment",
};

const PROGRESS_LABELS: Record<string, string> = {
  REPORTED: "Reported",
  REVIEWING: "Reviewing",
  APPROVED: "Approved",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
  CANCELLED: "Declined",
};

const PROGRESS_BADGE: Record<string, "default" | "outline" | "destructive" | "secondary"> = {
  REPORTED: "outline",
  REVIEWING: "secondary",
  APPROVED: "secondary",
  IN_PROGRESS: "secondary",
  COMPLETED: "default",
  CANCELLED: "destructive",
};

export default async function DriverPortalPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string; tab?: string; "maintenance-saved"?: string }>;
}) {
  const { saved, error, tab, "maintenance-saved": maintenanceSaved } = await searchParams;
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
  const vehicleItems: Record<string, string> = Object.fromEntries(vehicleOptions.map((v) => [v.id, v.plateNumber]));
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

  const maintenanceRequests = driver.assignedVehicles
    .flatMap((vehicle) => vehicle.maintenanceRequests.map((request) => ({ ...request, vehiclePlateNumber: vehicle.plateNumber })))
    .sort((a, b) => b.requestedAt.getTime() - a.requestedAt.getTime());

  const defaultTab = tab === "maintenance" || maintenanceSaved ? "maintenance" : "payment";
  const savedMessage = maintenanceSaved
    ? "Maintenance issue reported. A manager will review it."
    : saved
      ? "Payment recorded. A manager will verify it before it is approved."
      : null;

  return (
    <div className="space-y-6">
      <PageHeader title={`Welcome, ${driver.name}`} description="Your vehicle, balance, and revenue at a glance - then quick actions below." />
      {savedMessage ? <p role="status" className="flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-800 dark:text-emerald-300"><CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />{savedMessage}</p> : null}
      {error && ERROR_MESSAGES[error] ? <p role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"><AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />{ERROR_MESSAGES[error]}</p> : null}

      <section aria-labelledby="overview-heading" className="space-y-4">
        <h2 id="overview-heading" className="text-lg font-semibold">Overview</h2>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border bg-card p-4"><div className="flex items-center gap-2 text-sm text-muted-foreground"><CarFront className="size-4" aria-hidden="true" />Assigned vehicles</div><p className="mt-2 text-2xl font-semibold">{driver.assignedVehicles.length}</p></div>
          <div className="rounded-xl border bg-card p-4"><div className="flex items-center gap-2 text-sm text-muted-foreground"><Clock3 className="size-4" aria-hidden="true" />Awaiting verification</div><p className="mt-2 text-2xl font-semibold">{pendingCount}</p></div>
          <div className="rounded-xl border bg-card p-4"><div className="flex items-center gap-2 text-sm text-muted-foreground"><Wrench className="size-4" aria-hidden="true" />Open maintenance</div><p className="mt-2 text-2xl font-semibold">{openMaintenanceCount}</p></div>
        </div>

        {driver.assignedVehicles.length === 0 ? (
          <p className="rounded-md border p-4 text-sm text-muted-foreground">No vehicle is currently assigned to you.</p>
        ) : (
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
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            );
          })}
          </div>
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
      </section>

      <Tabs defaultValue={defaultTab}>
        <TabsList>
          <TabsTrigger value="payment"><Banknote aria-hidden="true" />Record a completed payment</TabsTrigger>
          <TabsTrigger value="maintenance"><Wrench aria-hidden="true" />Maintenance</TabsTrigger>
        </TabsList>

        <TabsContent value="payment" className="mt-4 space-y-6">
          {onlineAvailable ? (
            <div className="space-y-2 rounded-xl border bg-card p-4 sm:p-6">
              <h3 className="text-sm font-semibold">Pay online</h3>
              {driver.assignedVehicles.map((vehicle) => (
                <div key={vehicle.id} className="space-y-2">
                  {vehicle.salesTargetPeriod && vehicle.salesTargetAmount ? (
                    <form action={payFleetObligationOnline}>
                      <input type="hidden" name="vehicleId" value={vehicle.id} />
                      <input type="hidden" name="submissionType" value={vehicle.salesTargetPeriod === "DAILY" ? "DAILY_SALES" : "WEEKLY_SALES"} />
                      <input type="hidden" name="periodStart" value={today} />
                      <Button type="submit" className="w-full sm:w-auto">Pay {vehicle.plateNumber} {currency} {Number(vehicle.salesTargetAmount).toFixed(2)} securely</Button>
                    </form>
                  ) : null}
                  {vehicle.workAndPayContracts.map((contract) => (
                    <form action={payFleetObligationOnline} key={contract.id}>
                      <input type="hidden" name="vehicleId" value={vehicle.id} />
                      <input type="hidden" name="contractId" value={contract.id} />
                      <input type="hidden" name="submissionType" value="WORK_AND_PAY" />
                      <input type="hidden" name="periodStart" value={today} />
                      <Button type="submit" size="sm" variant="outline">Pay {contract.contractName} instalment securely</Button>
                    </form>
                  ))}
                </div>
              ))}
            </div>
          ) : null}

          <section className="rounded-xl border bg-card p-4 sm:p-6">
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
        </TabsContent>

        <TabsContent value="maintenance" className="mt-4 space-y-6">
          <section className="rounded-xl border bg-card p-4 sm:p-6">
            <div className="flex items-center justify-between gap-4">
              <div><h2 className="text-lg font-semibold">Report an issue</h2><p className="text-sm text-muted-foreground">Tell us what&apos;s wrong with your vehicle. A Fleet Manager will review it.</p></div>
              {driver.assignedVehicles.length > 0 ? (
                <EntityDialog
                  trigger={<Button size="sm"><Plus aria-hidden="true" />Report an issue</Button>}
                  title="Report a maintenance issue"
                  action={reportMaintenanceFromDriverPortal}
                >
                  <div className="space-y-2">
                    <Label htmlFor="vehicleId">Vehicle</Label>
                    <Select name="vehicleId" items={vehicleItems} defaultValue={driver.assignedVehicles[0]?.id}>
                      <SelectTrigger id="vehicleId" className="w-full">
                        <SelectValue placeholder="Select a vehicle" />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(vehicleItems).map(([value, label]) => (
                          <SelectItem key={value} value={value}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="faultDescription">What&apos;s wrong?</Label>
                    <Textarea id="faultDescription" name="faultDescription" rows={4} required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="photo">Photo (optional)</Label>
                    <Input id="photo" name="photo" type="file" accept="image/jpeg,image/png,image/webp" />
                    <p className="text-xs text-muted-foreground">JPEG, PNG, or WebP. Maximum 1 MB.</p>
                  </div>
                </EntityDialog>
              ) : null}
            </div>
          </section>

          <section className="rounded-xl border bg-card p-4 sm:p-6">
            <h2 className="text-lg font-semibold">My reports</h2>
            {maintenanceRequests.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">No maintenance issues reported yet.</p>
            ) : (
              <div className="mt-3 space-y-2">
                {maintenanceRequests.map((request) => (
                  <div key={request.id} className="flex flex-wrap items-start justify-between gap-3 border-b py-3 text-sm last:border-0">
                    <div>
                      <p className="font-medium">{request.vehiclePlateNumber}</p>
                      <p className="text-muted-foreground">{request.faultDescription}</p>
                      <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span>Reported {request.requestedAt.toLocaleDateString()}</span>
                        {request.photoAssetId ? (
                          <>
                            <span aria-hidden="true">&middot;</span>
                            <a className="underline underline-offset-2 hover:text-foreground" href={`/api/fleet/maintenance/${request.id}/photo`} target="_blank" rel="noreferrer">View photo</a>
                          </>
                        ) : null}
                      </p>
                    </div>
                    <Badge variant={PROGRESS_BADGE[request.progressStatus]}>{PROGRESS_LABELS[request.progressStatus]}</Badge>
                  </div>
                ))}
              </div>
            )}
          </section>
        </TabsContent>
      </Tabs>
    </div>
  );
}
