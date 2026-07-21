import { Handshake, Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EntityDialog } from "@/components/forms/entity-dialog";
import { requireCurrentTenant } from "@/lib/tenant";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { listFleetWorkAndPayContracts, listFleetVehicles } from "@/modules/fleet/service";
import { createWorkAndPayContract, recordContractPayment, updateContractStatus } from "./actions";

const ERROR_MESSAGES: Record<string, string> = {
  forbidden: "You don't have permission to manage work & pay contracts.",
  "missing-fields": "Contract name, vehicle, client name, contract amount, and weekly amount are required.",
  "invalid-amount": "Enter a valid payment amount.",
  "not-found": "That vehicle or contract could not be found.",
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
  const tenant = await requireCurrentTenant();
  const canManage = hasPermission(tenant, PERMISSIONS.FLEET_WORKANDPAY_MANAGE);
  const [contracts, vehicles] = await Promise.all([
    listFleetWorkAndPayContracts(tenant.organizationId),
    listFleetVehicles(tenant.organizationId),
  ]);
  const vehicleItems: Record<string, string> = Object.fromEntries(vehicles.map((v) => [v.id, `${v.assetTag} — ${v.plateNumber}`]));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <PageHeader title="Work & Pay" description="Work-and-pay contracts between the fleet and drivers or clients." />
        {canManage && vehicles.length > 0 ? (
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
              <Label htmlFor="vehicleId">Vehicle</Label>
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
            </div>
            <div className="space-y-2">
              <Label htmlFor="clientName">Client name</Label>
              <Input id="clientName" name="clientName" required />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="contractAmount">Contract amount</Label>
                <Input id="contractAmount" name="contractAmount" type="number" step="0.01" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="depositAmount">Deposit</Label>
                <Input id="depositAmount" name="depositAmount" type="number" step="0.01" defaultValue="0" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="weeklyPaymentAmount">Weekly amount</Label>
                <Input id="weeklyPaymentAmount" name="weeklyPaymentAmount" type="number" step="0.01" required />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="remainingDurationWeeks">Duration (weeks)</Label>
                <Input id="remainingDurationWeeks" name="remainingDurationWeeks" type="number" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="startsAt">Starts</Label>
                <Input id="startsAt" name="startsAt" type="date" />
              </div>
            </div>
          </EntityDialog>
        ) : null}
      </div>

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
                <TableCell className="text-muted-foreground">{contract.clientName}</TableCell>
                <TableCell className="text-muted-foreground">
                  {Number(contract.amountPaid).toFixed(2)} / {Number(contract.contractAmount).toFixed(2)} (
                  {Number(contract.completionPercentage).toFixed(0)}%)
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
                          title={`Record payment — ${contract.contractName}`}
                          action={recordContractPayment}
                          submitLabel="Record"
                        >
                          <input type="hidden" name="id" value={contract.id} />
                          <div className="space-y-2">
                            <Label htmlFor={`amount-${contract.id}`}>Amount</Label>
                            <Input
                              id={`amount-${contract.id}`}
                              name="amount"
                              type="number"
                              step="0.01"
                              defaultValue={contract.weeklyPaymentAmount.toString()}
                              required
                            />
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
