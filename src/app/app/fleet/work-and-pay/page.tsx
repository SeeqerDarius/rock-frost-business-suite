import { Handshake, Plus, Lock } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EntityDialog } from "@/components/forms/entity-dialog";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { listFleetWorkAndPayContracts, listFleetVehicles } from "@/modules/fleet/service";
import { createWorkAndPayContract, recordContractPayment, updateContractStatus } from "./actions";

const ERROR_MESSAGES: Record<string, string> = {
  forbidden: "You don't have permission to manage work & pay contracts.",
  "missing-fields": "Contract name, vehicle, contract amount, payment schedule, and instalment amount are required.",
  "invalid-amount": "Enter a valid payment amount.",
  "invalid-evidence": "Choose a supported payment method and enter its transaction reference. Cash references are optional.",
  "not-found": "That vehicle or contract could not be found.",
  "driver-required": "Assign an active driver to the vehicle before creating its Work & Pay contract.",
};

const STATUS_BADGE: Record<string, "default" | "outline" | "destructive" | "secondary"> = {
  DRAFT: "outline",
  ACTIVE: "default",
  PAUSED: "secondary",
  COMPLETED: "default",
  DEFAULTED: "destructive",
  CANCELLED: "destructive",
};

export default async function FleetWorkAndPayPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { saved, error } = await searchParams;
  const tenant = await requireModuleAccess("fleet");
  const canManage = hasPermission(tenant, PERMISSIONS.FLEET_WORKANDPAY_MANAGE);
  if (!canManage) {
    return (
      <div className="space-y-6">
        <PageHeader title="Work & Pay" description="Work & Pay contracts linked to each vehicle's assigned driver." />
        <EmptyState icon={Lock} title="You don't have access to this page" description="Work & Pay contracts are limited to roles with Work & Pay management permissions." />
      </div>
    );
  }
  const currency = tenant.organization.currency ?? "GHS";
  const [contracts, vehicles] = await Promise.all([
    listFleetWorkAndPayContracts(tenant.organizationId),
    listFleetVehicles(tenant.organizationId),
  ]);
  const eligibleVehicles = vehicles.filter((vehicle) => vehicle.assignedDriver?.status === "ACTIVE");
  const vehicleItems: Record<string, string> = Object.fromEntries(
    eligibleVehicles.map((vehicle) => [
      vehicle.id,
      `${vehicle.assetTag} - ${vehicle.plateNumber} (Driver: ${vehicle.assignedDriver!.name})`,
    ]),
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <PageHeader title="Work & Pay" description="Work & Pay contracts linked to each vehicle's assigned driver." />
        {canManage && eligibleVehicles.length > 0 ? (
          <EntityDialog
            trigger={
              <Button size="sm">
                <Plus />
                New contract
              </Button>
            }
            title="New work & pay contract"
            action={createWorkAndPayContract}
          >
            <div className="space-y-2">
              <Label htmlFor="contractName">Contract name</Label>
              <Input id="contractName" name="contractName" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="vehicleId">Vehicle and assigned driver</Label>
              <Select name="vehicleId" items={vehicleItems}>
                <SelectTrigger id="vehicleId" className="w-full">
                  <SelectValue placeholder="Select a vehicle" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(vehicleItems).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">The assigned driver is selected automatically as the Work & Pay client.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="contractAmount">Contract amount ({currency})</Label>
                <Input id="contractAmount" name="contractAmount" type="number" step="0.01" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="depositAmount">Deposit ({currency})</Label>
                <Input id="depositAmount" name="depositAmount" type="number" step="0.01" defaultValue="0" />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="paymentSchedule">Payment schedule</Label>
                <select id="paymentSchedule" name="paymentSchedule" defaultValue="WEEKLY" className="h-10 w-full rounded-md border bg-background px-3" required>
                  <option value="DAILY">Daily</option>
                  <option value="WEEKLY">Weekly</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="scheduledPaymentAmount">Required instalment amount ({currency})</Label>
                <Input id="scheduledPaymentAmount" name="scheduledPaymentAmount" type="number" min="0.01" step="0.01" required />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="remainingPaymentPeriods">Estimated number of payments</Label>
                <Input id="remainingPaymentPeriods" name="remainingPaymentPeriods" type="number" min="1" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="startsAt">Starts</Label>
                <Input id="startsAt" name="startsAt" type="date" />
              </div>
            </div>
          </EntityDialog>
        ) : null}
      </div>

      {canManage && eligibleVehicles.length === 0 ? (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
          Assign an active driver to a vehicle before creating a Work & Pay contract.
        </div>
      ) : null}

      {saved ? (
        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600 dark:text-emerald-400">
          Saved.
        </div>
      ) : null}
      {error && ERROR_MESSAGES[error] ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {ERROR_MESSAGES[error]}
        </div>
      ) : null}

      {contracts.length === 0 ? (
        <EmptyState icon={Handshake} title="No contracts yet" description="Work & pay contracts you create will appear here." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Contract</TableHead>
              <TableHead>Vehicle</TableHead>
              <TableHead>Client</TableHead>
              <TableHead>Progress</TableHead>
              <TableHead>Status</TableHead>
              {canManage ? <TableHead /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {contracts.map((contract) => (
              <TableRow key={contract.id}>
                <TableCell className="font-medium">{contract.contractName}</TableCell>
                <TableCell className="text-muted-foreground">{contract.vehicle.assetTag}</TableCell>
                <TableCell className="text-muted-foreground">{contract.driver?.name ?? contract.clientName}</TableCell>
                <TableCell className="text-muted-foreground">
                  {currency} {Number(contract.amountPaid).toFixed(2)} / {currency} {Number(contract.contractAmount).toFixed(2)} (
                  {Number(contract.completionPercentage).toFixed(0)}%). {currency} {Number(contract.scheduledPaymentAmount ?? contract.weeklyPaymentAmount).toFixed(2)} per {contract.paymentSchedule === "DAILY" ? "day" : "week"}
                </TableCell>
                <TableCell>
                  <Badge variant={STATUS_BADGE[contract.contractStatus]}>{contract.contractStatus}</Badge>
                </TableCell>
                {canManage ? (
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      {contract.contractStatus === "ACTIVE" || contract.contractStatus === "PAUSED" ? (
                        <EntityDialog
                          trigger={
                            <Button size="sm" variant="ghost">
                              Record payment
                            </Button>
                          }
                          title={`Record office-received payment: ${contract.contractName}`}
                          action={recordContractPayment}
                          submitLabel="Record"
                        >
                          <input type="hidden" name="id" value={contract.id} />
                          <div className="space-y-2">
                            <Label htmlFor={`amount-${contract.id}`}>Amount ({currency})</Label>
                            <Input
                              id={`amount-${contract.id}`}
                              name="amount"
                              type="number"
                              step="0.01"
                              defaultValue={(contract.scheduledPaymentAmount ?? contract.weeklyPaymentAmount).toString()}
                              required
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor={`paymentDate-${contract.id}`}>Payment date</Label>
                            <Input id={`paymentDate-${contract.id}`} name="paymentDate" type="date" max={new Date().toISOString().slice(0, 10)} defaultValue={new Date().toISOString().slice(0, 10)} required />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor={`paymentMethod-${contract.id}`}>Payment method</Label>
                            <select id={`paymentMethod-${contract.id}`} name="paymentMethod" defaultValue="CASH" className="h-10 w-full rounded-md border bg-background px-3" required>
                              <option value="CASH">Cash</option>
                              <option value="MOBILE_MONEY">Mobile money</option>
                              <option value="BANK_TRANSFER">Bank transfer</option>
                              <option value="CARD">Card</option>
                              <option value="CHEQUE">Cheque</option>
                              <option value="OTHER">Other</option>
                            </select>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor={`reference-${contract.id}`}>Receipt or transaction reference</Label>
                            <Input id={`reference-${contract.id}`} name="reference" />
                            <p className="text-xs text-muted-foreground">Required for non-cash payments.</p>
                          </div>
                        </EntityDialog>
                      ) : null}
                      {contract.contractStatus === "ACTIVE" ? (
                        <form action={updateContractStatus}>
                          <input type="hidden" name="id" value={contract.id} />
                          <input type="hidden" name="status" value="PAUSED" />
                          <Button type="submit" size="sm" variant="ghost">
                            Pause
                          </Button>
                        </form>
                      ) : null}
                      {contract.contractStatus === "PAUSED" ? (
                        <form action={updateContractStatus}>
                          <input type="hidden" name="id" value={contract.id} />
                          <input type="hidden" name="status" value="ACTIVE" />
                          <Button type="submit" size="sm" variant="ghost">
                            Resume
                          </Button>
                        </form>
                      ) : null}
                      {contract.contractStatus === "ACTIVE" || contract.contractStatus === "PAUSED" ? (
                        <form action={updateContractStatus}>
                          <input type="hidden" name="id" value={contract.id} />
                          <input type="hidden" name="status" value="CANCELLED" />
                          <Button type="submit" size="sm" variant="ghost">
                            Cancel
                          </Button>
                        </form>
                      ) : null}
                    </div>
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
