import { Wrench, Plus } from "lucide-react";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EntityDialog } from "@/components/forms/entity-dialog";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { listFleetActorVehicles, listFleetMaintenanceRequests, listFleetVehicles } from "@/modules/fleet/service";
import { getServerAuthSession } from "@/lib/auth/session";
import {
  createMaintenanceRequest, reviewMaintenanceRequest, ownerMaintenanceDecision,
  assignMechanic, startRepair, completeRepair, verifyRepairCompletion,
} from "./actions";

const ERROR_MESSAGES: Record<string, string> = {
  forbidden: "You don't have permission to manage maintenance requests.",
  "missing-fields": "A vehicle and fault description are required.",
  "not-found": "That vehicle could not be found.",
  "invalid-transition": "That workflow step is not valid for the request's current state.",
  "approval-required": "Complete all required approvals before assigning a mechanic.",
  "invalid-cost": "Repair cost must be zero or greater.",
  "invalid-photo": "Use a JPEG, PNG, or WebP photo no larger than 1 MB.",
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
  const tenant = await requireModuleAccess("fleet");
  const canManage = hasPermission(tenant, PERMISSIONS.FLEET_MAINTENANCE_MANAGE);
  const canViewAll = canManage || hasPermission(tenant, PERMISSIONS.FLEET_VIEW);
  const canDriverSubmit = hasPermission(tenant, PERMISSIONS.FLEET_DRIVER_SELF_SERVICE);
  const canApproveAsOwner = hasPermission(tenant, PERMISSIONS.FLEET_INVESTOR_VIEW);
  const canSubmit = canViewAll || canDriverSubmit || canApproveAsOwner;
  const session = await getServerAuthSession();
  if (!session?.user?.id) redirect("/login");
  const vehicles = canViewAll
    ? await listFleetVehicles(tenant.organizationId)
    : await listFleetActorVehicles(tenant.organizationId, session.user.id, {
        driver: canDriverSubmit,
        owner: canApproveAsOwner,
      });
  const requests = await listFleetMaintenanceRequests(
    tenant.organizationId,
    canViewAll ? undefined : vehicles.map((vehicle) => vehicle.id),
  );

  const vehicleItems: Record<string, string> = Object.fromEntries(
    vehicles.map((v) => [v.id, `${v.assetTag} - ${v.plateNumber}`])
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <PageHeader title="Maintenance" description="Vehicle fault reports and repair progress." />
        {canSubmit && vehicles.length > 0 ? (
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
            {canManage ? (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="ownerApprovalRequired" />
                Vehicle-owner approval is required
              </label>
            ) : null}
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
              <TableHead>Owner approval</TableHead>
              <TableHead>Mechanic</TableHead>
              <TableHead />
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
                <TableCell className="text-muted-foreground">
                  {request.ownerApprovalRequired ? APPROVAL_LABELS[request.ownerApprovalStatus] : "Not required"}
                </TableCell>
                <TableCell className="text-muted-foreground">{request.mechanicAssigned ?? "-"}</TableCell>
                <TableCell className="text-right">
                  <div className="flex flex-wrap justify-end gap-1">
                  {request.photoAssetId ? (
                    <Button size="sm" variant="ghost" nativeButton={false} render={<a href={`/api/fleet/maintenance/${request.id}/photo`} target="_blank" rel="noreferrer" />}>
                      View photo
                    </Button>
                  ) : null}
                  {canManage && ["REPORTED", "REVIEWING"].includes(request.progressStatus) && request.approvalStatus === "PENDING" ? (
                    <EntityDialog
                      trigger={
                        <Button size="sm" variant="ghost">
                          Review
                        </Button>
                      }
                      title="Fleet manager review"
                      description={request.faultDescription}
                      action={reviewMaintenanceRequest}
                      submitLabel="Save review"
                    >
                      <input type="hidden" name="id" value={request.id} />
                      <input type="hidden" name="decision" value="approve" />
                      <div className="space-y-2">
                        <Label htmlFor={`fleetManagerReview-${request.id}`}>Review notes</Label>
                        <Textarea id={`fleetManagerReview-${request.id}`} name="fleetManagerReview" defaultValue={request.fleetManagerReview ?? ""} rows={3} />
                      </div>
                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" name="ownerApprovalRequired" defaultChecked={request.ownerApprovalRequired} />
                        Require vehicle-owner approval
                      </label>
                    </EntityDialog>
                  ) : null}
                  {canManage && ["REPORTED", "REVIEWING"].includes(request.progressStatus) && request.approvalStatus === "PENDING" ? (
                    <form action={reviewMaintenanceRequest}>
                      <input type="hidden" name="id" value={request.id} />
                      <input type="hidden" name="decision" value="reject" />
                      <Button type="submit" size="sm" variant="ghost">Reject</Button>
                    </form>
                  ) : null}
                  {canApproveAsOwner && request.vehicle.owner?.userId === session?.user?.id && request.ownerApprovalStatus === "PENDING" && request.approvalStatus === "APPROVED" ? (
                    <EntityDialog trigger={<Button size="sm" variant="ghost">Owner decision</Button>} title="Owner maintenance approval" action={ownerMaintenanceDecision} submitLabel="Approve">
                      <input type="hidden" name="id" value={request.id} />
                      <input type="hidden" name="decision" value="approve" />
                      <div className="space-y-2"><Label htmlFor={`owner-note-${request.id}`}>Comment</Label><Textarea id={`owner-note-${request.id}`} name="note" /></div>
                    </EntityDialog>
                  ) : null}
                  {canApproveAsOwner && request.vehicle.owner?.userId === session?.user?.id && request.ownerApprovalStatus === "PENDING" && request.approvalStatus === "APPROVED" ? (
                    <form action={ownerMaintenanceDecision}>
                      <input type="hidden" name="id" value={request.id} />
                      <input type="hidden" name="decision" value="reject" />
                      <Button type="submit" size="sm" variant="ghost">Owner reject</Button>
                    </form>
                  ) : null}
                  {canManage && request.progressStatus === "APPROVED" && !request.mechanicAssigned ? (
                    <EntityDialog trigger={<Button size="sm" variant="ghost">Assign mechanic</Button>} title="Assign mechanic" action={assignMechanic}>
                      <input type="hidden" name="id" value={request.id} />
                      <div className="space-y-2"><Label htmlFor={`mechanic-${request.id}`}>Mechanic or workshop</Label><Input id={`mechanic-${request.id}`} name="mechanicAssigned" required /></div>
                    </EntityDialog>
                  ) : null}
                  {canManage && request.progressStatus === "APPROVED" && request.mechanicAssigned ? (
                    <form action={startRepair}><input type="hidden" name="id" value={request.id} /><Button type="submit" size="sm" variant="ghost">Start repair</Button></form>
                  ) : null}
                  {canManage && request.progressStatus === "IN_PROGRESS" ? (
                    <EntityDialog trigger={<Button size="sm" variant="ghost">Complete repair</Button>} title="Record repair completion" action={completeRepair}>
                      <input type="hidden" name="id" value={request.id} />
                      <div className="space-y-2"><Label htmlFor={`cost-${request.id}`}>Repair cost</Label><Input id={`cost-${request.id}`} name="repairCost" type="number" min="0" step="0.01" required /></div>
                      <div className="space-y-2"><Label htmlFor={`completion-note-${request.id}`}>Completion notes</Label><Textarea id={`completion-note-${request.id}`} name="note" /></div>
                    </EntityDialog>
                  ) : null}
                  {canManage && request.progressStatus === "COMPLETED" && !request.completionVerified ? (
                    <form action={verifyRepairCompletion}><input type="hidden" name="id" value={request.id} /><Button type="submit" size="sm">Verify & notify owner</Button></form>
                  ) : null}
                  <details className="relative text-left">
                    <summary className="cursor-pointer list-none rounded-md px-3 py-2 text-sm hover:bg-muted">History</summary>
                    <div className="absolute right-0 z-20 mt-2 max-h-80 w-80 space-y-3 overflow-y-auto rounded-md border bg-popover p-4 shadow-md">
                      {request.events.map((event) => (
                        <div key={event.id} className="border-l-2 pl-3 text-sm">
                          <p className="font-medium">{event.eventType.replaceAll("_", " ")}</p>
                          <p className="text-muted-foreground">{event.createdAt.toLocaleString()} · {event.actor?.name ?? "System"}</p>
                          {event.note ? <p>{event.note}</p> : null}
                        </div>
                      ))}
                    </div>
                  </details>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
