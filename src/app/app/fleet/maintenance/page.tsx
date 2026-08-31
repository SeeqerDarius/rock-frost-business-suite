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
import { listFleetActorVehicles, listFleetMaintenanceRequests, listFleetMechanics, listFleetVehicles, MAX_FLEET_MAINTENANCE_ATTACHMENTS } from "@/modules/fleet/service";
import { MAINTENANCE_PROGRESS_LABELS, MAINTENANCE_PROGRESS_BADGE } from "@/modules/fleet/maintenance-status";
import { getServerAuthSession } from "@/lib/auth/session";
import {
  createMaintenanceRequest, reviewMaintenanceRequest, recordEstimate, ownerMaintenanceDecision,
  assignMechanic, scheduleExternalRepair, startRepair, holdRepair, resumeRepair, withdrawRequest,
  completeRepair, verifyRepairCompletion, correctRepairExpense,
} from "./actions";

const ERROR_MESSAGES: Record<string, string> = {
  forbidden: "You don't have permission to manage maintenance requests.",
  "missing-fields": "A vehicle and fault description are required.",
  "not-found": "That vehicle could not be found.",
  "invalid-transition": "That workflow step is not valid for the request's current state.",
  "approval-required": "Complete all required approvals before assigning a mechanic.",
  "invalid-cost": "Repair cost must be zero or greater.",
  "invalid-photo": "Use a JPEG, PNG, or WebP photo no larger than 1 MB.",
  "too-many-photos": `Attach at most ${MAX_FLEET_MAINTENANCE_ATTACHMENTS} photos.`,
  "mechanic-not-external": "This mechanic has a self-service portal login - they schedule their own repair date from the mechanic portal.",
};

const APPROVAL_LABELS: Record<string, string> = { PENDING: "Pending", APPROVED: "Approved", REJECTED: "Rejected" };

const WITHDRAWABLE_STATUSES = ["REPORTED", "AWAITING_OWNER_APPROVAL", "APPROVED", "ASSIGNED", "SCHEDULED"];
const ESTIMATE_EDITABLE_STATUSES = ["REPORTED", "AWAITING_OWNER_APPROVAL", "APPROVED", "ASSIGNED"];

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
  const mechanics = canManage ? await listFleetMechanics(tenant.organizationId) : [];
  const mechanicItems: Record<string, string> = Object.fromEntries(
    mechanics.filter((mechanic) => mechanic.status === "ACTIVE").map((mechanic) => [mechanic.id, mechanic.businessName ? `${mechanic.name} (${mechanic.businessName})` : mechanic.name]),
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
              <Label htmlFor="photo">Photos (optional)</Label>
              <Input id="photo" name="photos" type="file" accept="image/jpeg,image/png,image/webp" multiple />
              <p className="text-xs text-muted-foreground">JPEG, PNG, or WebP. Up to {MAX_FLEET_MAINTENANCE_ATTACHMENTS} photos, 1 MB each.</p>
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
                  <Badge variant={MAINTENANCE_PROGRESS_BADGE[request.progressStatus]}>{MAINTENANCE_PROGRESS_LABELS[request.progressStatus]}</Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">{APPROVAL_LABELS[request.approvalStatus]}</TableCell>
                <TableCell className="text-muted-foreground">
                  {request.ownerApprovalRequired ? APPROVAL_LABELS[request.ownerApprovalStatus] : "Not required"}
                </TableCell>
                <TableCell className="text-muted-foreground">{request.mechanic?.name ?? "-"}</TableCell>
                <TableCell className="text-right">
                  <div className="flex flex-wrap justify-end gap-1">
                  {request.attachments.map((attachment, index) => (
                    <Button key={attachment.id} size="sm" variant="ghost" nativeButton={false} render={<a href={`/api/fleet/maintenance/attachments/${attachment.id}`} target="_blank" rel="noreferrer" />}>
                      Photo {index + 1}
                    </Button>
                  ))}
                  {canManage && ["REPORTED", "AWAITING_OWNER_APPROVAL"].includes(request.progressStatus) && request.approvalStatus === "PENDING" ? (
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
                  {canManage && ["REPORTED", "AWAITING_OWNER_APPROVAL"].includes(request.progressStatus) && request.approvalStatus === "PENDING" ? (
                    <form action={reviewMaintenanceRequest}>
                      <input type="hidden" name="id" value={request.id} />
                      <input type="hidden" name="decision" value="reject" />
                      <Button type="submit" size="sm" variant="ghost">Reject</Button>
                    </form>
                  ) : null}
                  {canManage && ESTIMATE_EDITABLE_STATUSES.includes(request.progressStatus) ? (
                    <EntityDialog
                      trigger={<Button size="sm" variant="ghost">{request.estimatedCost ? "Update estimate" : "Add estimate"}</Button>}
                      title="Record a repair-cost estimate"
                      description="Shown to the vehicle owner while they decide - a real number instead of approving blind."
                      action={recordEstimate}
                    >
                      <input type="hidden" name="id" value={request.id} />
                      <div className="space-y-2"><Label htmlFor={`estimate-cost-${request.id}`}>Estimated cost</Label><Input id={`estimate-cost-${request.id}`} name="estimatedCost" type="number" min="0" step="0.01" defaultValue={request.estimatedCost?.toString() ?? ""} /></div>
                      <div className="space-y-2"><Label htmlFor={`estimate-note-${request.id}`}>Note (optional)</Label><Textarea id={`estimate-note-${request.id}`} name="estimateNote" defaultValue={request.estimateNote ?? ""} placeholder="e.g. quote from workshop, parts breakdown" /></div>
                    </EntityDialog>
                  ) : null}
                  {canApproveAsOwner && request.vehicle.owner?.userId === session?.user?.id && request.ownerApprovalStatus === "PENDING" && request.approvalStatus === "APPROVED" ? (
                    <EntityDialog trigger={<Button size="sm" variant="ghost">Owner decision</Button>} title="Owner maintenance approval" description={request.estimatedCost ? `Estimated cost: ${tenant.organization.currency ?? "GHS"} ${Number(request.estimatedCost).toFixed(2)}${request.estimateNote ? `. ${request.estimateNote}` : ""}` : "No cost estimate recorded yet."} action={ownerMaintenanceDecision} submitLabel="Approve">
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
                  {canManage && request.progressStatus === "APPROVED" && !request.mechanicId ? (
                    <EntityDialog trigger={<Button size="sm" variant="ghost">Assign mechanic</Button>} title="Assign mechanic" action={assignMechanic}>
                      <input type="hidden" name="id" value={request.id} />
                      <div className="space-y-2">
                        <Label htmlFor={`mechanic-${request.id}`}>Mechanic or workshop</Label>
                        <Select name="mechanicId" items={mechanicItems}>
                          <SelectTrigger id={`mechanic-${request.id}`} className="w-full"><SelectValue placeholder="Select a mechanic" /></SelectTrigger>
                          <SelectContent>{Object.entries(mechanicItems).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                    </EntityDialog>
                  ) : null}
                  {canManage && request.progressStatus === "ASSIGNED" && request.mechanic && !request.mechanic.userId ? (
                    <EntityDialog
                      trigger={<Button size="sm" variant="ghost">Schedule externally</Button>}
                      title="Schedule the external repair"
                      description={`${request.mechanic.name} has no self-service portal login, so a manager records the repair date on their behalf.`}
                      action={scheduleExternalRepair}
                    >
                      <input type="hidden" name="id" value={request.id} />
                      <div className="space-y-2"><Label htmlFor={`schedule-${request.id}`}>Scheduled repair date</Label><Input id={`schedule-${request.id}`} name="scheduledRepairAt" type="date" required /></div>
                    </EntityDialog>
                  ) : null}
                  {canManage && request.progressStatus === "SCHEDULED" ? (
                    <form action={startRepair}><input type="hidden" name="id" value={request.id} /><Button type="submit" size="sm" variant="ghost">Start repair</Button></form>
                  ) : null}
                  {canManage && request.progressStatus === "IN_PROGRESS" ? (
                    <EntityDialog trigger={<Button size="sm" variant="ghost">Hold repair</Button>} title="Put repair on hold" action={holdRepair}>
                      <input type="hidden" name="id" value={request.id} />
                      <div className="space-y-2"><Label htmlFor={`hold-note-${request.id}`}>Reason (optional)</Label><Textarea id={`hold-note-${request.id}`} name="note" placeholder="e.g. waiting on parts" /></div>
                    </EntityDialog>
                  ) : null}
                  {canManage && request.progressStatus === "ON_HOLD" ? (
                    <form action={resumeRepair}><input type="hidden" name="id" value={request.id} /><Button type="submit" size="sm" variant="ghost">Resume repair</Button></form>
                  ) : null}
                  {canManage && request.progressStatus === "IN_PROGRESS" ? (
                    <EntityDialog trigger={<Button size="sm" variant="ghost">Complete repair</Button>} title="Record repair completion" action={completeRepair}>
                      <input type="hidden" name="id" value={request.id} />
                      <div className="space-y-2"><Label htmlFor={`cost-${request.id}`}>Repair cost</Label><Input id={`cost-${request.id}`} name="repairCost" type="number" min="0" step="0.01" required /></div>
                      <div className="space-y-2"><Label htmlFor={`invoice-${request.id}`}>Invoice reference (optional)</Label><Input id={`invoice-${request.id}`} name="invoiceReference" placeholder="e.g. workshop invoice number" /></div>
                      <div className="space-y-2"><Label htmlFor={`completion-note-${request.id}`}>Completion notes</Label><Textarea id={`completion-note-${request.id}`} name="note" /></div>
                      <div className="space-y-2">
                        <Label htmlFor={`completion-photos-${request.id}`}>Completion evidence / invoice photos (optional)</Label>
                        <Input id={`completion-photos-${request.id}`} name="completionPhotos" type="file" accept="image/jpeg,image/png,image/webp" multiple />
                        <p className="text-xs text-muted-foreground">JPEG, PNG, or WebP. Up to {MAX_FLEET_MAINTENANCE_ATTACHMENTS} photos, 1 MB each.</p>
                      </div>
                    </EntityDialog>
                  ) : null}
                  {canManage && request.progressStatus === "COMPLETED" ? (
                    <form action={verifyRepairCompletion}><input type="hidden" name="id" value={request.id} /><Button type="submit" size="sm">Verify & notify owner</Button></form>
                  ) : null}
                  {canManage && request.progressStatus === "VERIFIED" ? (
                    <EntityDialog
                      trigger={<Button size="sm" variant="ghost">Correct cost</Button>}
                      title="Correct the verified repair cost"
                      description={`Current cost: ${tenant.organization.currency ?? "GHS"} ${request.repairCost ? Number(request.repairCost).toFixed(2) : "0.00"}. Reverses the original Accounting entry and posts the corrected one.`}
                      action={correctRepairExpense}
                    >
                      <input type="hidden" name="id" value={request.id} />
                      <div className="space-y-2"><Label htmlFor={`new-cost-${request.id}`}>Corrected cost</Label><Input id={`new-cost-${request.id}`} name="newCost" type="number" min="0" step="0.01" required /></div>
                      <div className="space-y-2"><Label htmlFor={`correction-reason-${request.id}`}>Reason</Label><Textarea id={`correction-reason-${request.id}`} name="reason" required placeholder="e.g. workshop revised the final invoice" /></div>
                    </EntityDialog>
                  ) : null}
                  {canManage && WITHDRAWABLE_STATUSES.includes(request.progressStatus) ? (
                    <EntityDialog trigger={<Button size="sm" variant="ghost">Withdraw</Button>} title="Withdraw maintenance request" description="The request is closed without a repair. This cannot be undone." action={withdrawRequest}>
                      <input type="hidden" name="id" value={request.id} />
                      <div className="space-y-2"><Label htmlFor={`withdraw-note-${request.id}`}>Reason (optional)</Label><Textarea id={`withdraw-note-${request.id}`} name="note" /></div>
                    </EntityDialog>
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
