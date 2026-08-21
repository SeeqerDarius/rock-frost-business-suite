import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getServerAuthSession } from "@/lib/auth/session";
import { getFleetDriverWorkspace } from "@/modules/fleet/service";
import { DriverCollectionForm } from "./collection-form";

const ERROR_MESSAGES: Record<string, string> = {
  forbidden: "Your role does not include driver self-service.",
  "missing-fields": "Complete all required payment fields.",
  "invalid-type": "Choose an available payment obligation.",
  "invalid-amount": "Enter an amount greater than zero.",
  "invalid-target": "That payment does not match the selected vehicle's remittance schedule or active Work & Pay contract.",
  "invalid-evidence": "Choose a supported payment method and enter its transaction reference. Cash references are optional.",
  "duplicate-period": "A pending or approved remittance already exists for that vehicle and payment period.",
  "not-found": "The selected vehicle or contract is no longer assigned to you.",
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

  return (
    <div className="space-y-6">
      <PageHeader title="Driver workspace" description="Only your assigned vehicles, maintenance, contracts, and payment obligations are shown here." />
      {saved ? <p className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm">Payment recorded and sent for manager verification.</p> : null}
      {error && ERROR_MESSAGES[error] ? <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{ERROR_MESSAGES[error]}</p> : null}

      {driver.assignedVehicles.length === 0 ? (
        <p className="rounded-md border p-4 text-sm text-muted-foreground">No vehicle is currently assigned to you.</p>
      ) : (
        <section className="grid gap-4 md:grid-cols-2">
          {driver.assignedVehicles.map((vehicle) => {
            const openMaintenance = vehicle.maintenanceRequests.filter((request) => !["COMPLETED", "CANCELLED"].includes(request.progressStatus));
            return (
              <Card key={vehicle.id}>
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
                  <div className="grid grid-cols-2 gap-3">
                    <div><p className="text-muted-foreground">Mileage</p><p className="font-medium">{vehicle.mileage ?? "Not recorded"}</p></div>
                      <div><p className="text-muted-foreground">Required remittance</p><p className="font-medium">{vehicle.salesTargetPeriod && vehicle.salesTargetAmount ? `${currency} ${Number(vehicle.salesTargetAmount).toFixed(2)} / ${vehicle.salesTargetPeriod === "DAILY" ? "day" : "week"}` : "Not configured"}</p></div>
                  </div>
                  {vehicle.workAndPayContracts.map((contract) => (
                    <div key={contract.id} className="rounded-lg border p-3">
                      <p className="font-medium">{contract.contractName}</p>
                      <p className="text-muted-foreground">{currency} {Number(contract.outstandingBalance).toFixed(2)} outstanding. {currency} {Number(contract.scheduledPaymentAmount ?? contract.weeklyPaymentAmount).toFixed(2)} per {contract.paymentSchedule === "DAILY" ? "day" : "week"}.</p>
                    </div>
                  ))}
                  <Button size="sm" variant="outline" nativeButton={false} render={<Link href="/app/fleet/maintenance" />}>Report maintenance concern</Button>
                </CardContent>
              </Card>
            );
          })}
        </section>
      )}

      <section className="rounded-xl border p-5">
        <h2 className="text-lg font-semibold">Record a completed payment</h2>
        <p className="mb-4 text-sm text-muted-foreground">First pay the company by cash, mobile money, bank transfer, or another supported method. Then record the payment here. The selected vehicle controls the required schedule and management verifies receipt.</p>
        <DriverCollectionForm vehicles={vehicleOptions} currency={currency} />
      </section>

      <section className="rounded-xl border p-5">
        <h2 className="text-lg font-semibold">Recent submissions</h2>
        {driver.paymentSubmissions.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">No payments recorded yet.</p> : (
          <div className="mt-3 space-y-2">
            {driver.paymentSubmissions.map((item) => {
              const variance = item.expectedAmount ? Number(item.amount) - Number(item.expectedAmount) : null;
              return (
                <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 border-b py-3 text-sm">
                  <div>
                    <p className="font-medium">{item.vehicle?.plateNumber ?? "Assigned vehicle"}. {TYPE_LABELS[item.submissionType]}</p>
                    <p className="text-muted-foreground">{item.periodStart.toLocaleDateString()} to {item.periodEnd.toLocaleDateString()}. {currency} {Number(item.amount).toFixed(2)}{variance === null ? "" : ` (${variance >= 0 ? "+" : ""}${variance.toFixed(2)} variance)`}</p>
                  </div>
                  <Badge variant={item.status === "APPROVED" ? "default" : item.status === "REJECTED" ? "destructive" : "outline"}>{item.status}</Badge>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
