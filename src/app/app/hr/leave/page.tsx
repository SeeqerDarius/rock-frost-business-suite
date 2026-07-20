import { CalendarClock, Plus } from "lucide-react";
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
import { requireCurrentTenant } from "@/lib/tenant";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { listLeaveRequests, listEmployees, listLeaveTypes, daysBetween } from "@/modules/hr/service";
import { createNewLeaveRequest, approveExistingLeaveRequest, rejectExistingLeaveRequest } from "./actions";

const ERROR_MESSAGES: Record<string, string> = {
  forbidden: "You don't have permission to manage leave requests.",
  "missing-fields": "All required fields must be filled in.",
  "invalid-dates": "End date must be on or after the start date.",
  "invalid-state": "That action isn't valid for this leave request's current status.",
};

const STATUS_BADGE: Record<string, "default" | "outline" | "destructive" | "secondary"> = {
  PENDING: "outline",
  APPROVED: "default",
  REJECTED: "destructive",
  CANCELLED: "secondary",
};

export default async function HrLeavePage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { saved, error } = await searchParams;
  const tenant = await requireCurrentTenant();
  const canManage = hasPermission(tenant, PERMISSIONS.HR_LEAVE_MANAGE);
  const [requests, employees, leaveTypes] = await Promise.all([
    listLeaveRequests(tenant.organizationId),
    listEmployees(tenant.organizationId),
    listLeaveTypes(tenant.organizationId),
  ]);
  const employeeItems: Record<string, string> = Object.fromEntries(employees.map((e) => [e.id, e.fullName]));
  const leaveTypeItems: Record<string, string> = Object.fromEntries(leaveTypes.map((t) => [t.id, t.name]));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <PageHeader title="Leave" description="Time-off requests across the organization." />
        {canManage ? (
          <EntityDialog trigger={<Button size="sm"><Plus />New request</Button>} title="New leave request" action={createNewLeaveRequest}>
            <div className="space-y-2">
              <Label htmlFor="employeeId">Employee</Label>
              <Select name="employeeId" items={employeeItems}>
                <SelectTrigger id="employeeId" className="w-full">
                  <SelectValue placeholder="Select an employee" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(employeeItems).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="leaveTypeId">Leave type</Label>
              <Select name="leaveTypeId" items={leaveTypeItems}>
                <SelectTrigger id="leaveTypeId" className="w-full">
                  <SelectValue placeholder="Select a leave type" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(leaveTypeItems).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="startDate">Start date</Label>
                <Input id="startDate" name="startDate" type="date" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="endDate">End date</Label>
                <Input id="endDate" name="endDate" type="date" required />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="reason">Reason</Label>
              <Textarea id="reason" name="reason" rows={3} />
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
        <EmptyState icon={CalendarClock} title="No leave requests yet" description="Requests employees submit will appear here." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employee</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Dates</TableHead>
              <TableHead>Days</TableHead>
              <TableHead>Status</TableHead>
              {canManage ? <TableHead /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {requests.map((request) => (
              <TableRow key={request.id}>
                <TableCell className="font-medium">{request.employee.fullName}</TableCell>
                <TableCell className="text-muted-foreground">{request.leaveType.name}</TableCell>
                <TableCell className="text-muted-foreground">
                  {request.startDate.toLocaleDateString()} – {request.endDate.toLocaleDateString()}
                </TableCell>
                <TableCell className="text-muted-foreground">{daysBetween(request.startDate, request.endDate)}</TableCell>
                <TableCell>
                  <Badge variant={STATUS_BADGE[request.status]}>{request.status}</Badge>
                </TableCell>
                {canManage ? (
                  <TableCell className="text-right">
                    {request.status === "PENDING" ? (
                      <div className="flex justify-end gap-1">
                        <form action={approveExistingLeaveRequest}>
                          <input type="hidden" name="id" value={request.id} />
                          <Button type="submit" size="sm" variant="ghost">Approve</Button>
                        </form>
                        <form action={rejectExistingLeaveRequest}>
                          <input type="hidden" name="id" value={request.id} />
                          <Button type="submit" size="sm" variant="ghost">Reject</Button>
                        </form>
                      </div>
                    ) : null}
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
