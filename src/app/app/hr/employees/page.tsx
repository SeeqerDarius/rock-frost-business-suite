import { UsersRound, Plus } from "lucide-react";
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
import { listEmployees, listManagerCandidates } from "@/modules/hr/service";
import { upsertEmployee, activateExistingEmployee, changeEmployeeStatus } from "./actions";

const ERROR_MESSAGES: Record<string, string> = {
  forbidden: "You don't have permission to manage employees.",
  "missing-fields": "Full name and hire date are required.",
  "invalid-state": "Only employees in onboarding can be activated.",
  "not-found": "That manager could not be found.",
};

const STATUS_BADGE: Record<string, "default" | "outline" | "destructive" | "secondary"> = {
  ONBOARDING: "secondary",
  ACTIVE: "default",
  ON_LEAVE: "outline",
  TERMINATED: "destructive",
};

interface EmployeeFieldsProps {
  employee?: { fullName: string; email: string | null; phone: string | null; jobTitle: string | null; department: string | null; hireDate: Date; managerId: string | null; notes: string | null };
  managerItems: Record<string, string>;
}

function EmployeeFields({ employee, managerItems }: EmployeeFieldsProps) {
  const idSuffix = employee ? "-edit" : "";
  return (
    <>
      <div className="space-y-2">
        <Label htmlFor={`fullName${idSuffix}`}>Full name</Label>
        <Input id={`fullName${idSuffix}`} name="fullName" defaultValue={employee?.fullName} required />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`jobTitle${idSuffix}`}>Job title</Label>
          <Input id={`jobTitle${idSuffix}`} name="jobTitle" defaultValue={employee?.jobTitle ?? ""} />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`department${idSuffix}`}>Department</Label>
          <Input id={`department${idSuffix}`} name="department" defaultValue={employee?.department ?? ""} />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`email${idSuffix}`}>Email</Label>
          <Input id={`email${idSuffix}`} name="email" type="email" defaultValue={employee?.email ?? ""} />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`phone${idSuffix}`}>Phone</Label>
          <Input id={`phone${idSuffix}`} name="phone" defaultValue={employee?.phone ?? ""} />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`hireDate${idSuffix}`}>Hire date</Label>
          <Input
            id={`hireDate${idSuffix}`}
            name="hireDate"
            type="date"
            defaultValue={employee?.hireDate ? employee.hireDate.toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10)}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`managerId${idSuffix}`}>Manager</Label>
          <Select name="managerId" defaultValue={employee?.managerId ?? ""} items={{ "": "None", ...managerItems }}>
            <SelectTrigger id={`managerId${idSuffix}`} className="w-full">
              <SelectValue placeholder="None" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">None</SelectItem>
              {Object.entries(managerItems).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor={`notes${idSuffix}`}>Notes</Label>
        <Textarea id={`notes${idSuffix}`} name="notes" defaultValue={employee?.notes ?? ""} rows={3} />
      </div>
    </>
  );
}

export default async function HrEmployeesPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { saved, error } = await searchParams;
  const tenant = await requireCurrentTenant();
  const canManage = hasPermission(tenant, PERMISSIONS.HR_EMPLOYEES_MANAGE);
  const [employees, managers] = await Promise.all([
    listEmployees(tenant.organizationId),
    listManagerCandidates(tenant.organizationId),
  ]);
  const managerItems: Record<string, string> = Object.fromEntries(managers.map((m) => [m.id, m.fullName]));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <PageHeader title="Employees" description="Every person your organization employs." />
        {canManage ? (
          <EntityDialog trigger={<Button size="sm"><Plus />New employee</Button>} title="New employee" action={upsertEmployee}>
            <EmployeeFields managerItems={managerItems} />
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

      {employees.length === 0 ? (
        <EmptyState icon={UsersRound} title="No employees yet" description="Employees you add will appear here." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Number</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Job title</TableHead>
              <TableHead>Department</TableHead>
              <TableHead>Manager</TableHead>
              <TableHead>Status</TableHead>
              {canManage ? <TableHead /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {employees.map((employee) => (
              <TableRow key={employee.id}>
                <TableCell className="font-mono text-xs">{employee.employeeNumber}</TableCell>
                <TableCell className="font-medium">{employee.fullName}</TableCell>
                <TableCell className="text-muted-foreground">{employee.jobTitle ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">{employee.department ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">{employee.manager?.fullName ?? "—"}</TableCell>
                <TableCell>
                  <Badge variant={STATUS_BADGE[employee.status]}>{employee.status.replace("_", " ")}</Badge>
                </TableCell>
                {canManage ? (
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      {employee.status === "ONBOARDING" ? (
                        <form action={activateExistingEmployee}>
                          <input type="hidden" name="id" value={employee.id} />
                          <Button type="submit" size="sm" variant="ghost">Activate</Button>
                        </form>
                      ) : null}
                      {employee.status === "ACTIVE" ? (
                        <form action={changeEmployeeStatus}>
                          <input type="hidden" name="id" value={employee.id} />
                          <input type="hidden" name="status" value="ON_LEAVE" />
                          <Button type="submit" size="sm" variant="ghost">Mark on leave</Button>
                        </form>
                      ) : null}
                      {employee.status === "ON_LEAVE" ? (
                        <form action={changeEmployeeStatus}>
                          <input type="hidden" name="id" value={employee.id} />
                          <input type="hidden" name="status" value="ACTIVE" />
                          <Button type="submit" size="sm" variant="ghost">Mark active</Button>
                        </form>
                      ) : null}
                      {employee.status !== "TERMINATED" ? (
                        <form action={changeEmployeeStatus}>
                          <input type="hidden" name="id" value={employee.id} />
                          <input type="hidden" name="status" value="TERMINATED" />
                          <Button type="submit" size="sm" variant="ghost">Terminate</Button>
                        </form>
                      ) : null}
                      <EntityDialog
                        trigger={<Button size="sm" variant="ghost">Edit</Button>}
                        title="Edit employee"
                        action={upsertEmployee}
                        submitLabel="Save changes"
                      >
                        <input type="hidden" name="id" value={employee.id} />
                        <EmployeeFields employee={employee} managerItems={managerItems} />
                      </EntityDialog>
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
