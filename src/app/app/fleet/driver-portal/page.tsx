import { redirect } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { PeriodicTrendChart, TrendAreaChart } from "@/components/dashboard/charts";
import { OverviewMetricCard } from "@/components/dashboard/overview-metric-card";
import { EntityDialog } from "@/components/forms/entity-dialog";
import { EmptyState } from "@/components/feedback/empty-state";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getServerAuthSession } from "@/lib/auth/session";
import { getFleetDriverWorkspace, getFleetDriverTrends, MAX_FLEET_MAINTENANCE_ATTACHMENTS } from "@/modules/fleet/service";
import { getFleetDriverObligations, type ObligationSummary } from "@/modules/fleet/driver-obligations";
import { MAINTENANCE_PROGRESS_LABELS, MAINTENANCE_PROGRESS_BADGE } from "@/modules/fleet/maintenance-status";
import { DriverCollectionForm } from "./collection-form";
import { payFleetObligationOnline, reportMaintenanceFromDriverPortal } from "./actions";
import { PaySubmitButton } from "./submit-button";
import { OfflineBanner } from "./offline-banner";
import { getSettlementProfile, listPendingOperationalPaymentsForPayer, listConfirmedOperationalPaymentsForPayer } from "@/lib/payments/operational";
import {
  AlertTriangle, Banknote, CarFront, CheckCircle2, Clock3, Plus, Wrench, Handshake, TrendingUp, ReceiptText, CalendarClock,
} from "lucide-react";

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
  "too-many-photos": `Attach at most ${MAX_FLEET_MAINTENANCE_ATTACHMENTS} photos.`,
  "online-unavailable": "Online collections are not active. Pay the company using another method and record it below.",
  "online-failed": "Secure checkout could not be started. No payment was taken. Please try again.",
};

const TYPE_LABELS: Record<string, string> = {
  DAILY_SALES: "Daily vehicle remittance",
  WEEKLY_SALES: "Weekly vehicle remittance",
  WORK_AND_PAY: "Work & Pay instalment",
};

const shortDate = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

function periodLabel(type: "DAILY" | "WEEKLY", periodStart: Date, periodEnd: Date) {
  return type === "DAILY" ? `Today, ${shortDate(periodStart)}` : `This week, ${shortDate(periodStart)} - ${shortDate(periodEnd)}`;
}

function money(currency: string, amount: number) {
  return `${currency} ${amount.toFixed(2)}`;
}

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
        <PageHeader title="Driver workspace" description="Your assigned vehicle, balance, and what's next." />
        <EmptyState icon={CarFront} title="Your login isn't linked to a driver profile yet" description="Ask your Fleet Manager to link this login to your driver record before you can see your assignment." />
      </div>
    );
  }

  const currency = tenant.organization.currency ?? "GHS";
  const today = new Date().toISOString().slice(0, 10);

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

  const [settlement, obligations, trends, pendingOnlinePayments, confirmedOnlinePayments] = await Promise.all([
    getSettlementProfile(tenant.organizationId),
    getFleetDriverObligations(tenant.organizationId, driver.assignedVehicles),
    driver.assignedVehicles.length > 0
      ? getFleetDriverTrends(tenant.organizationId, {
          vehicleIds: driver.assignedVehicles.map((v) => v.id),
          contractIds: driver.assignedVehicles.flatMap((v) => v.workAndPayContracts.map((c) => c.id)),
        })
      : null,
    listPendingOperationalPaymentsForPayer(tenant.organizationId, session.user.id),
    listConfirmedOperationalPaymentsForPayer(tenant.organizationId, session.user.id),
  ]);
  const onlineAvailable = settlement?.status === "ACTIVE" && settlement.onlineCollectionsEnabled;
  const hasPendingOnlineFor = (vehicleId: string, contractId?: string | null) =>
    pendingOnlinePayments.some((p) => p.vehicleId === vehicleId && (contractId ? p.contractId === contractId : !p.contractId));

  const allContracts = driver.assignedVehicles.flatMap((vehicle) => vehicle.workAndPayContracts.map((contract) => ({ vehicle, contract })));
  const workAndPayRemaining = allContracts.reduce((sum, { contract }) => sum + Number(contract.outstandingBalance), 0);
  const workAndPayProgress = allContracts.length > 0
    ? allContracts.reduce((sum, { contract }) => sum + Number(contract.completionPercentage), 0) / allContracts.length
    : null;
  const outstandingTotal = obligations.totals.dueNow + obligations.totals.overdueAmount;
  const openMaintenance = driver.assignedVehicles.flatMap((vehicle) =>
    vehicle.maintenanceRequests.filter((request) => !["COMPLETED", "VERIFIED", "REJECTED", "CANCELLED"].includes(request.progressStatus)).map((request) => ({ ...request, vehiclePlateNumber: vehicle.plateNumber })),
  );

  const maintenanceRequests = driver.assignedVehicles
    .flatMap((vehicle) => vehicle.maintenanceRequests.map((request) => ({ ...request, vehiclePlateNumber: vehicle.plateNumber })))
    .sort((a, b) => b.requestedAt.getTime() - a.requestedAt.getTime());

  const confirmedBySubmissionId = new Map(confirmedOnlinePayments.map((p) => [p.sourceId, p]));

  const defaultTab = tab && ["overview", "payments", "workandpay", "vehicle", "maintenance", "activity"].includes(tab)
    ? tab
    : maintenanceSaved ? "maintenance" : "overview";
  const savedMessage = maintenanceSaved
    ? "Maintenance issue reported. A manager will review it."
    : saved
      ? "Payment recorded. A manager will verify it before it is approved."
      : null;

  return (
    <div className="space-y-6">
      <PageHeader title={`Welcome, ${driver.name}`} description={driver.assignedVehicles.length > 0 ? `Assigned to ${driver.assignedVehicles.map((v) => v.plateNumber).join(", ")}.` : "No vehicle is currently assigned to you."} />
      <OfflineBanner />
      {savedMessage ? <p role="status" className="flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-800 dark:text-emerald-300"><CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />{savedMessage}</p> : null}
      {error && ERROR_MESSAGES[error] ? <p role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"><AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />{ERROR_MESSAGES[error]}</p> : null}

      <Tabs defaultValue={defaultTab}>
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="workandpay">Work & Pay</TabsTrigger>
          <TabsTrigger value="vehicle">Vehicle</TabsTrigger>
          <TabsTrigger value="maintenance">Maintenance</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        {/* ---------- Overview ---------- */}
        <TabsContent value="overview" className="mt-4 space-y-6">
          {driver.assignedVehicles.length === 0 ? (
            <EmptyState icon={CarFront} title="No vehicle assigned" description="You'll see your balance and obligations here once a Fleet Manager assigns you a vehicle." />
          ) : (
            <>
              {outstandingTotal > 0 ? (
                <Card className="border-primary/30 bg-primary/5">
                  <CardContent className="flex flex-wrap items-center justify-between gap-4 py-5">
                    <div>
                      <p className="text-sm font-medium">{obligations.totals.overdueAmount > 0 ? "You have an overdue balance" : "You have a payment due"}</p>
                      <p className="text-2xl font-semibold tracking-tight">{money(currency, outstandingTotal)}</p>
                    </div>
                    <Button nativeButton={false} render={<Link href="?tab=payments" />}>Pay now</Button>
                  </CardContent>
                </Card>
              ) : (
                <p role="status" className="flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-800 dark:text-emerald-300">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />You&apos;re fully paid up. Nothing is due right now.
                </p>
              )}

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <OverviewMetricCard icon={<Banknote />} label="Due now" value={money(currency, obligations.totals.dueNow)} description="Your current period's obligation, not yet approved." href="?tab=payments" />
                <OverviewMetricCard icon={<CheckCircle2 />} label="Paid this period" value={money(currency, obligations.totals.paidThisPeriod)} description="Approved payments for the period in progress." href="?tab=activity" />
                <OverviewMetricCard icon={<Clock3 />} label="Pending verification" value={money(currency, obligations.totals.pendingAmount)} description="Submitted, awaiting manager review." href="?tab=activity" />
                <OverviewMetricCard icon={<AlertTriangle />} label="Overdue" value={money(currency, obligations.totals.overdueAmount)} description="Closed periods with nothing approved yet." href="?tab=payments" />
                <OverviewMetricCard icon={<Banknote />} label="Outstanding balance" value={money(currency, outstandingTotal)} description="Due now plus everything overdue, combined." href="?tab=payments" />
                {allContracts.length > 0 ? (
                  <>
                    <OverviewMetricCard icon={<Handshake />} label="Work & Pay remaining" value={money(currency, workAndPayRemaining)} description="Left to pay across your active contract(s)." href="?tab=workandpay" />
                    <OverviewMetricCard icon={<TrendingUp />} label="Work & Pay progress" value={`${(workAndPayProgress ?? 0).toFixed(0)}%`} description="Average completion across your contract(s)." href="?tab=workandpay" />
                  </>
                ) : null}
                <OverviewMetricCard icon={<Wrench />} label="Open maintenance" value={openMaintenance.length} description="Reported issues not yet completed." href="?tab=maintenance" />
              </div>
            </>
          )}
        </TabsContent>

        {/* ---------- Payments ---------- */}
        <TabsContent value="payments" className="mt-4 space-y-6">
          {driver.assignedVehicles.length === 0 ? (
            <EmptyState icon={Banknote} title="No vehicle assigned" description="Payments become available once a vehicle is assigned to you." />
          ) : (
            <>
              <section className="space-y-3">
                <h2 className="text-lg font-semibold">Your obligations</h2>
                {driver.assignedVehicles.map((vehicle) => {
                  const vehicleObligation = obligations.vehicles.find((v) => v.vehicleId === vehicle.id)?.summary ?? null;
                  return (
                    <div key={vehicle.id} className="space-y-2">
                      {vehicleObligation ? (
                        <ObligationCard
                          title={`${vehicle.plateNumber} - vehicle remittance`}
                          currency={currency}
                          summary={vehicleObligation}
                          payButton={
                            onlineAvailable && !hasPendingOnlineFor(vehicle.id) ? (
                              <form action={payFleetObligationOnline}>
                                <input type="hidden" name="vehicleId" value={vehicle.id} />
                                <input type="hidden" name="submissionType" value={vehicle.salesTargetPeriod === "DAILY" ? "DAILY_SALES" : "WEEKLY_SALES"} />
                                <input type="hidden" name="periodStart" value={today} />
                                <PaySubmitButton label={`Pay ${money(currency, vehicleObligation.dueNow || vehicleObligation.expectedAmount)} securely`} pendingLabel="Starting checkout..." className="w-full sm:w-auto" />
                              </form>
                            ) : hasPendingOnlineFor(vehicle.id) ? (
                              <p className="text-sm text-amber-700 dark:text-amber-400">An online payment for this vehicle is awaiting confirmation. Do not pay again - check back shortly or use Activity to see its status.</p>
                            ) : null
                          }
                        />
                      ) : null}
                      {vehicle.workAndPayContracts.map((contract) => {
                        const contractObligation = obligations.contracts.find((c) => c.contractId === contract.id)?.summary ?? null;
                        if (!contractObligation) return null;
                        return (
                          <ObligationCard
                            key={contract.id}
                            title={`${contract.contractName} - Work & Pay instalment`}
                            currency={currency}
                            summary={contractObligation}
                            payButton={
                              onlineAvailable && !hasPendingOnlineFor(vehicle.id, contract.id) ? (
                                <form action={payFleetObligationOnline}>
                                  <input type="hidden" name="vehicleId" value={vehicle.id} />
                                  <input type="hidden" name="contractId" value={contract.id} />
                                  <input type="hidden" name="submissionType" value="WORK_AND_PAY" />
                                  <input type="hidden" name="periodStart" value={today} />
                                  <PaySubmitButton label={`Pay ${money(currency, contractObligation.dueNow || contractObligation.expectedAmount)} securely`} pendingLabel="Starting checkout..." size="sm" variant="outline" />
                                </form>
                              ) : hasPendingOnlineFor(vehicle.id, contract.id) ? (
                                <p className="text-sm text-amber-700 dark:text-amber-400">An online payment for this contract is awaiting confirmation. Do not pay again yet.</p>
                              ) : null
                            }
                          />
                        );
                      })}
                    </div>
                  );
                })}
                {!onlineAvailable ? <p className="text-xs text-muted-foreground">Online payment isn&apos;t active for your organization yet - pay the company directly, then record it below.</p> : null}
              </section>

              <section className="rounded-xl border bg-card p-4 sm:p-6">
                <div className="mb-5 flex items-start gap-3"><div className="rounded-lg bg-muted p-2"><ReceiptText className="size-5" aria-hidden="true" /></div><div><h2 className="text-lg font-semibold">Record a payment made outside the app</h2><p className="text-sm text-muted-foreground">Use this only after you&apos;ve already paid by cash, mobile money, bank transfer, or another method - not for online payments, which confirm automatically.</p></div></div>
                <DriverCollectionForm vehicles={vehicleOptions} currency={currency} />
              </section>
            </>
          )}
        </TabsContent>

        {/* ---------- Work & Pay ---------- */}
        <TabsContent value="workandpay" className="mt-4 space-y-4">
          {allContracts.length === 0 ? (
            <EmptyState icon={Handshake} title="No active Work & Pay contract" description="Contracts your Fleet Manager sets up for you will appear here." />
          ) : (
            allContracts.map(({ vehicle, contract }) => {
              const summary = obligations.contracts.find((c) => c.contractId === contract.id)?.summary ?? null;
              const percentPaid = Math.min(Math.max(Number(contract.completionPercentage), 0), 100);
              const submissions = driver.paymentSubmissions.filter((item) => item.contractId === contract.id);
              return (
                <Card key={contract.id}>
                  <CardHeader>
                    <CardTitle>{contract.contractName}</CardTitle>
                    <CardDescription>{vehicle.plateNumber} - {contract.contractStatus === "ACTIVE" ? "Active" : contract.contractStatus === "PAUSED" ? "Paused" : contract.contractStatus === "COMPLETED" ? "Completed" : contract.contractStatus}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4 text-sm">
                    <div className="grid grid-cols-2 gap-3 rounded-lg bg-muted/40 p-3 sm:grid-cols-4">
                      <div><p className="text-xs uppercase tracking-wide text-muted-foreground">Contract value</p><p className="mt-1 font-medium">{money(currency, Number(contract.contractAmount))}</p></div>
                      <div><p className="text-xs uppercase tracking-wide text-muted-foreground">Paid so far</p><p className="mt-1 font-medium">{money(currency, Number(contract.amountPaid))}</p></div>
                      <div><p className="text-xs uppercase tracking-wide text-muted-foreground">Remaining</p><p className="mt-1 font-medium">{money(currency, Number(contract.outstandingBalance))}</p></div>
                      <div><p className="text-xs uppercase tracking-wide text-muted-foreground">Instalment</p><p className="mt-1 font-medium">{money(currency, Number(contract.scheduledPaymentAmount ?? contract.weeklyPaymentAmount))} / {contract.paymentSchedule === "DAILY" ? "day" : "week"}</p></div>
                    </div>
                    <div>
                      <div className="mb-1.5 flex items-center justify-between text-xs font-medium text-muted-foreground"><span>Completion</span><span>{percentPaid.toFixed(0)}%</span></div>
                      <Progress value={percentPaid} aria-label={`${contract.contractName} completion`} />
                    </div>
                    {summary ? (
                      <>
                        <p className="flex items-center gap-2 text-muted-foreground"><CalendarClock className="size-4 shrink-0" aria-hidden="true" />Next due {shortDate(summary.nextDueDate)}{summary.dueNow > 0 ? ` - ${money(currency, summary.dueNow)} due for this period` : " - this period is paid"}.</p>
                        {summary.onTimeRate !== null ? (
                          <p className="flex items-center gap-2 text-muted-foreground"><TrendingUp className="size-4 shrink-0" aria-hidden="true" />On-time rate over the last {summary.periods.length} periods: <span className="font-medium text-foreground">{Math.round(summary.onTimeRate * 100)}%</span></p>
                        ) : null}
                        {(() => {
                          const balanceHistory = buildBalanceHistory(summary.periods, Number(contract.outstandingBalance));
                          return balanceHistory.length > 1 ? (
                            <div className="border-t pt-3">
                              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Balance remaining over time</p>
                              <TrendAreaChart data={balanceHistory} series={[{ key: "balance", label: "Balance remaining" }]} currency={currency} />
                            </div>
                          ) : null;
                        })()}
                      </>
                    ) : null}
                    {submissions.length > 0 ? (
                      <div className="border-t pt-3">
                        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Instalment history</p>
                        <div className="space-y-1.5">
                          {submissions.slice(0, 5).map((item) => (
                            <div key={item.id} className="flex items-center justify-between gap-3">
                              <span className="text-muted-foreground">{item.paymentDate.toLocaleDateString()}</span>
                              <span className="font-medium tabular-nums">{money(currency, Number(item.amount))}</span>
                              <Badge variant={item.status === "APPROVED" ? "default" : item.status === "REJECTED" ? "destructive" : "outline"}>{item.status === "PENDING" ? "Pending" : item.status === "APPROVED" ? "Approved" : "Rejected"}</Badge>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              );
            })
          )}
        </TabsContent>

        {/* ---------- Vehicle ---------- */}
        <TabsContent value="vehicle" className="mt-4 space-y-4">
          {driver.assignedVehicles.length === 0 ? (
            <EmptyState icon={CarFront} title="No vehicle assigned" description="Your vehicle's details will appear here once one is assigned to you." />
          ) : (
            driver.assignedVehicles.map((vehicle) => {
              const latestMaintenance = vehicle.maintenanceRequests[0] ?? null;
              const vehicleOpenMaintenance = vehicle.maintenanceRequests.filter((r) => !["COMPLETED", "VERIFIED", "REJECTED", "CANCELLED"].includes(r.progressStatus));
              const vehicleObligation = obligations.vehicles.find((v) => v.vehicleId === vehicle.id)?.summary ?? null;
              return (
                <Card key={vehicle.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between gap-3">
                      <div><CardTitle>{vehicle.plateNumber}</CardTitle><CardDescription>{[vehicle.make, vehicle.model].filter(Boolean).join(" ") || vehicle.assetTag}</CardDescription></div>
                      <Badge>Assigned to you</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <div className="grid grid-cols-2 gap-3 rounded-lg bg-muted/40 p-3 sm:grid-cols-3">
                      <div><p className="text-xs uppercase tracking-wide text-muted-foreground">Mileage</p><p className="mt-1 font-medium">{vehicle.mileage !== null ? Number(vehicle.mileage).toLocaleString() : "Not recorded"}</p></div>
                      <div><p className="text-xs uppercase tracking-wide text-muted-foreground">Remittance schedule</p><p className="mt-1 font-medium">{vehicle.salesTargetPeriod && vehicle.salesTargetAmount ? `${money(currency, Number(vehicle.salesTargetAmount))} / ${vehicle.salesTargetPeriod === "DAILY" ? "day" : "week"}` : "Not configured"}</p></div>
                      <div><p className="text-xs uppercase tracking-wide text-muted-foreground">Current obligation</p><p className="mt-1 font-medium">{vehicleObligation ? money(currency, vehicleObligation.dueNow) : "None"}</p></div>
                    </div>
                    <div className="flex items-center justify-between rounded-lg border p-3">
                      <div className="flex items-center gap-2"><Wrench className="size-4 text-muted-foreground" aria-hidden="true" /><span>{vehicleOpenMaintenance.length} open maintenance issue{vehicleOpenMaintenance.length === 1 ? "" : "s"}</span></div>
                      {latestMaintenance ? <Badge variant={MAINTENANCE_PROGRESS_BADGE[latestMaintenance.progressStatus]}>{MAINTENANCE_PROGRESS_LABELS[latestMaintenance.progressStatus]}</Badge> : null}
                    </div>
                    <Button size="sm" variant="outline" nativeButton={false} render={<Link href="?tab=maintenance" />}>Report an issue</Button>
                  </CardContent>
                </Card>
              );
            })
          )}
        </TabsContent>

        {/* ---------- Maintenance ---------- */}
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
                    <Label htmlFor="photo">Photos (optional)</Label>
                    <Input id="photo" name="photos" type="file" accept="image/jpeg,image/png,image/webp" multiple />
                    <p className="text-xs text-muted-foreground">JPEG, PNG, or WebP. Up to {MAX_FLEET_MAINTENANCE_ATTACHMENTS} photos, 1 MB each.</p>
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
                        {request.attachments.map((attachment, index) => (
                          <span key={attachment.id} className="contents">
                            <span aria-hidden="true">&middot;</span>
                            <a className="underline underline-offset-2 hover:text-foreground" href={`/api/fleet/maintenance/attachments/${attachment.id}`} target="_blank" rel="noreferrer">Photo {index + 1}</a>
                          </span>
                        ))}
                      </p>
                    </div>
                    <Badge variant={MAINTENANCE_PROGRESS_BADGE[request.progressStatus]}>{MAINTENANCE_PROGRESS_LABELS[request.progressStatus]}</Badge>
                  </div>
                ))}
              </div>
            )}
          </section>
        </TabsContent>

        {/* ---------- Activity and receipts ---------- */}
        <TabsContent value="activity" className="mt-4 space-y-6">
          {trends ? (
            <Card>
              <CardHeader>
                <CardTitle>My revenue</CardTitle>
                <CardDescription>
                  What you&apos;ve remitted from your assigned vehicle{driver.assignedVehicles.length === 1 ? "" : "s"}
                  {allContracts.length > 0 ? ", and what you've paid toward your Work & Pay contract" : ""}. Only your own figures, not the organization&apos;s.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {allContracts.length > 0 ? (
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

          <section className="rounded-xl border bg-card p-4 sm:p-6">
            <h2 className="text-lg font-semibold">Payment activity</h2>
            {driver.paymentSubmissions.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">No payments recorded yet.</p>
            ) : (
              <div className="mt-3 space-y-2">
                {driver.paymentSubmissions.map((item) => {
                  const variance = item.expectedAmount ? Number(item.amount) - Number(item.expectedAmount) : null;
                  const receipt = confirmedBySubmissionId.get(item.id);
                  return (
                    <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 border-b py-3 text-sm last:border-0">
                      <div>
                        <p className="font-medium">{item.vehicle?.plateNumber ?? "Assigned vehicle"}. {TYPE_LABELS[item.submissionType]}</p>
                        <p className="text-muted-foreground">{item.periodStart.toLocaleDateString()} to {item.periodEnd.toLocaleDateString()}. {money(currency, Number(item.amount))}{variance === null || variance === 0 ? "" : ` (${money(currency, Math.abs(variance))} ${variance < 0 ? "short" : "over"})`}</p>
                        {receipt ? <Link href={`/app/fleet/driver-portal/payment/callback?reference=${receipt.providerReference}`} className="mt-1 inline-flex items-center gap-1 text-xs text-primary underline underline-offset-2">
                          <ReceiptText className="size-3" aria-hidden="true" />View receipt
                        </Link> : null}
                      </div>
                      <Badge variant={item.status === "APPROVED" ? "default" : item.status === "REJECTED" ? "destructive" : "outline"}>{item.status === "PENDING" ? "Awaiting verification" : item.status === "APPROVED" ? "Approved" : "Rejected"}</Badge>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {maintenanceRequests.length > 0 ? (
            <section className="rounded-xl border bg-card p-4 sm:p-6">
              <h2 className="text-lg font-semibold">Maintenance activity</h2>
              <div className="mt-3 space-y-2">
                {maintenanceRequests.map((request) => (
                  <div key={request.id} className="flex flex-wrap items-center justify-between gap-3 border-b py-3 text-sm last:border-0">
                    <div><p className="font-medium">{request.vehiclePlateNumber}</p><p className="text-muted-foreground">{request.faultDescription}</p></div>
                    <Badge variant={MAINTENANCE_PROGRESS_BADGE[request.progressStatus]}>{MAINTENANCE_PROGRESS_LABELS[request.progressStatus]}</Badge>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ObligationCard({ title, currency, summary, payButton }: { title: string; currency: string; summary: ObligationSummary; payButton: React.ReactNode }) {
  const current = summary.periods[summary.periods.length - 1];
  const shortfall = summary.dueNow > 0 && current.approvedAmount > 0;
  const trendData = summary.periods.filter((p) => p.existedYet).map((p) => ({ label: shortDate(p.periodStart), due: p.expectedAmount, paid: p.approvedAmount }));
  return (
    <div className="rounded-xl border bg-card p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-medium">{title}</p>
          <p className="text-sm text-muted-foreground">{periodLabel(summary.type, current.periodStart, current.periodEnd)} - due {shortDate(summary.nextDueDate)}</p>
        </div>
        {current.isOverdue ? <Badge variant="destructive">Overdue</Badge> : current.isPaid ? <Badge>Paid</Badge> : <Badge variant="outline">Due</Badge>}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 rounded-lg bg-muted/40 p-3 text-sm sm:grid-cols-3">
        <div><p className="text-xs uppercase tracking-wide text-muted-foreground">Obligation</p><p className="mt-1 font-medium">{money(currency, summary.expectedAmount)}</p></div>
        <div><p className="text-xs uppercase tracking-wide text-muted-foreground">Paid so far</p><p className="mt-1 font-medium">{money(currency, current.approvedAmount)}</p></div>
        <div><p className="text-xs uppercase tracking-wide text-muted-foreground">{summary.dueNow > 0 ? "Remaining" : "Balance"}</p><p className="mt-1 font-medium">{money(currency, summary.dueNow)}</p></div>
      </div>
      {shortfall ? <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">You&apos;ve paid part of this period&apos;s obligation - {money(currency, summary.dueNow)} still remaining.</p> : null}
      {current.pendingAmount > 0 ? <p className="mt-2 text-xs text-muted-foreground">{money(currency, current.pendingAmount)} submitted and awaiting manager verification.</p> : null}
      {summary.onTimeRate !== null ? (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <TrendingUp className="size-3.5 shrink-0" aria-hidden="true" />
          On-time rate over the last {summary.periods.length} periods: <span className="font-medium text-foreground">{Math.round(summary.onTimeRate * 100)}%</span>
        </p>
      ) : null}
      {payButton ? <div className="mt-3">{payButton}</div> : null}
      {trendData.length > 1 ? (
        <details className="mt-4 border-t pt-3">
          <summary className="cursor-pointer text-xs font-medium uppercase tracking-wide text-muted-foreground">Due vs. paid history</summary>
          <div className="mt-3">
            <TrendAreaChart data={trendData} series={[{ key: "due", label: "Due" }, { key: "paid", label: "Paid" }]} currency={currency} target={{ amount: summary.expectedAmount, label: summary.type === "DAILY" ? "Daily target" : "Weekly target", actualKey: "paid" }} />
          </div>
        </details>
      ) : null}
    </div>
  );
}

/**
 * Reconstructs a contract's balance at the end of each trailing period by
 * working backward from its current stored outstandingBalance and adding
 * back each period's approvedAmount, then reversing into oldest-first order
 * for the chart. There is no stored balance history to read directly. Periods
 * before the contract existed are excluded first so a freshly created
 * contract doesn't show a flat phantom balance stretching into the past.
 */
function buildBalanceHistory(periods: ObligationSummary["periods"], currentBalance: number): { label: string; balance: number }[] {
  const real = periods.filter((p) => p.existedYet);
  const endBalances = new Array<number>(real.length);
  endBalances[real.length - 1] = currentBalance;
  for (let i = real.length - 1; i > 0; i--) {
    endBalances[i - 1] = endBalances[i] + real[i].approvedAmount;
  }
  return real.map((p, i) => ({ label: shortDate(p.periodEnd), balance: Math.max(endBalances[i], 0) }));
}
