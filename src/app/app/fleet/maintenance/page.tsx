import { Wrench, Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EntityDialog } from "@/components/forms/entity-dialog";
import { requireCurrentTenant } from "@/lib/tenant";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { listFleetMaintenanceRequests, listFleetVehicles } from "@/modules/fleet/service";
import { createMaintenanceRequest, reviewMaintenanceRequest } from "./actions";

const ERROR_MESSAGES: Record<string, string> = {
  forbidden: "You don't have permission to manage maintenance requests.",
  "missing-fields": "A vehicle and fault description are required.",
  "not-found": "That vehicle could not be found.",
};

const PROGRESS_LABELS: Record<string, string> = {
  REPORTED: "Reported",
  REVIEWING: "Reviewing",
  APPROVED: "Approved",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

const APPROVAL_LABELS: Record<string, string> = { PENDING: "Pending", APPROVED: "Approved", REJECTED: "Rejected" };

const PROGRESS_BADGE: Record<string, "default" | "outline" | "destructive" | "secondary"> = {
  REPORTED: "outline",
  REVIEWING: "secondary",
  APPROVED: "secondary",
  IN_PROGRESS: "secondary",
  COMPLETED: "default",
  CANCELLED: "destructive",
};

export default async function FleetMaintenancePage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { saved, error } = await searchParams;
  const tenant = await requireCurrentTenant();
  const canManage = hasPermission(tenant, PERMISSIONS.FLEET_MAINTENANCE_MANAGE);
  const [requests, vehicles] = await Promise.all([
    listFleetMaintenanceRequests(tenant.organizationId),
    listFleetVehicles(tenant.organizationId),
  ]);

  const vehicleItems: Record<string, string> = Object.fromEntries(
    vehicles.map((v) => [v.id, `${v.assetTag} - ${v.plateNumber}`])
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <PageHeader title="Maintenance" description="Vehicle fault reports and repair progress." />
        {canManage && vehicles.length > 0 ? (
          <EntityDialog
            trigger={
              <Button size="sm">
                <Plus />
                Report an issue
              </Button>
            }
            title="Report a maintenance issue"
            action={createMaintenanceRequest}
          >
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
              <Label htmlFor="faultDescription">What&apos;s wrong?</Label>
              <Textarea id="faultDescription" name="faultDescription" rows={4} required />
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

      {requests.length === 0 ? (
        <EmptyState icon={Wrench} title="No maintenance requests" description="Reported issues will appear here." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Vehicle</TableHead>
              <TableHead>Fault</TableHead>
              <TableHead>Reported by</TableHead>
              <TableHead>Progress</TableHead>
              <TableHead>Approval</TableHead>
              {canManage ? <TableHead /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {requests.map((request) => (
              <TableRow key={request.id}>
                <TableCell className="font-medium">{request.vehicle.assetTag}</TableCell>
                <TableCell className="max-w-xs truncate text-muted-foreground">{request.faultDescription}</TableCell>
                <TableCell className="text-muted-foreground">{request.requestedBy?.name ?? "-"}</TableCell>
                <TableCell>
                  <Badge variant={PROGRESS_BADGE[request.progressStatus]}>{PROGRESS_LABELS[request.progressStatus]}</Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">{APPROVAL_LABELS[request.approvalStatus]}</TableCell>
                {canManage ? (
                  <TableCell className="text-right">
                    <EntityDialog
                      trigger={
                        <Button size="sm" variant="ghost">
                          Review
                        </Button>
                      }
                      title="Review maintenance request"
                      description={request.faultDescription}
                      action={reviewMaintenanceRequest}
                      submitLabel="Save review"
                    >
                      <input type="hidden" name="id" value={request.id} />
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor={`approvalStatus-${request.id}`}>Approval</Label>
                          <Select name="approvalStatus" defaultValue={request.approvalStatus} items={APPROVAL_LABELS}>
                            <SelectTrigger id={`approvalStatus-${request.id}`} className="w-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {Object.entries(APPROVAL_LABELS).map(([value, label]) => (
                                <SelectItem key={value} value={value}>
                                  {label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor={`progressStatus-${request.id}`}>Progress</Label>
                          <Select name="progressStatus" defaultValue={request.progressStatus} items={PROGRESS_LABELS}>
                            <SelectTrigger id={`progressStatus-${request.id}`} className="w-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {Object.entries(PROGRESS_LABELS).map(([value, label]) => (
                                <SelectItem key={value} value={value}>
                                  {label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`mechanicAssigned-${request.id}`}>Mechanic assigned</Label>
                        <Input id={`mechanicAssigned-${request.id}`} name="mechanicAssigned" defaultValue={request.mechanicAssigned ?? ""} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`repairCost-${request.id}`}>Repair cost</Label>
                        <Input
                          id={`repairCost-${request.id}`}
                          name="repairCost"
                          type="number"
                          step="0.01"
                          defaultValue={request.repairCost?.toString() ?? ""}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`fleetManagerReview-${request.id}`}>Review notes</Label>
                        <Textarea id={`fleetManagerReview-${request.id}`} name="fleetManagerReview" defaultValue={request.fleetManagerReview ?? ""} rows={3} />
                      </div>
                      <label className="flex items-center gap-2 text-sm">
                        <Checkbox name="completionVerified" defaultChecked={request.completionVerified} />
                        Completion verified
                      </label>
                    </EntityDialog>
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
