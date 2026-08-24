import Link from "next/link";
import { UsersRound, Plus, LayoutGrid, List as ListIcon, Mail, Phone } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EntityDialog } from "@/components/forms/entity-dialog";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { listEmployees, listManagerCandidates, listJobPositions } from "@/modules/hr/service";
import { upsertEmployee, activateExistingEmployee, changeEmployeeStatus } from "./actions";
import { EmployeeFields } from "./employee-fields";

const ERROR_MESSAGES: Record<string, string> = {
  forbidden: "You don't have permission to manage employees.",
  "missing-fields": "Full name and hire date are required.",
  "invalid-state": "Only employees in onboarding can be activated.",
  "not-found": "That manager could not be found.",
  "invalid-photo": "Choose a valid JPG, PNG, or WebP photo no larger than 1 MB.",
};

const STATUS_BADGE: Record<string, "default" | "outline" | "destructive" | "secondary"> = {
  ONBOARDING: "secondary",
  ACTIVE: "default",
  ON_LEAVE: "outline",
  SUSPENDED: "destructive",
  TERMINATION_PENDING: "secondary",
  TERMINATED: "destructive",
  REINSTATED: "default",
};

const TILE_COLORS = [
  "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
  "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
  "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
  "bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300",
];

function tileColor(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return TILE_COLORS[hash % TILE_COLORS.length];
}

export default async function HrEmployeesPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string; department?: string; view?: string }>;
}) {
  const { saved, error, department, view } = await searchParams;
  const isKanban = view !== "table";
  const tenant = await requireModuleAccess("hr");
  const canManage = hasPermission(tenant, PERMISSIONS.HR_EMPLOYEES_EDIT) || hasPermission(tenant, PERMISSIONS.HR_EMPLOYEES_MANAGE);
  const [allEmployees, managers, jobPositions] = await Promise.all([
    listEmployees(tenant.organizationId),
    listManagerCandidates(tenant.organizationId),
    listJobPositions(tenant.organizationId),
  ]);
  const employees = department ? allEmployees.filter((employee) => (employee.department ?? "Unassigned") === department) : allEmployees;
  const managerItems: Record<string, string> = Object.fromEntries(managers.map((m) => [m.id, m.fullName]));
  const jobPositionNames = jobPositions.map((p) => p.name);
  const viewHref = (nextView: "table" | "kanban") => {
    const params = new URLSearchParams();
    if (department) params.set("department", department);
    if (nextView === "table") params.set("view", "table");
    const query = params.toString();
    return `/app/hr/employees${query ? `?${query}` : ""}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <PageHeader title="Employees" description={department ? `Employees in ${department}.` : "Every person your organization employs."} />
        <div className="flex items-center gap-2">
          <div className="flex overflow-hidden rounded-md border">
            <Link href={viewHref("kanban")}><Button type="button" size="sm" variant={isKanban ? "secondary" : "ghost"} className="rounded-none"><LayoutGrid /></Button></Link>
            <Link href={viewHref("table")}><Button type="button" size="sm" variant={isKanban ? "ghost" : "secondary"} className="rounded-none"><ListIcon /></Button></Link>
          </div>
          {canManage ? (
            <EntityDialog trigger={<Button size="sm"><Plus />New employee</Button>} title="New employee" action={upsertEmployee} contentClassName="sm:max-w-xl">
              <EmployeeFields managerItems={managerItems} jobPositionNames={jobPositionNames} />
            </EntityDialog>
          ) : null}
        </div>
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
      ) : isKanban ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {employees.map((employee) => (
            <div key={employee.id} className="flex flex-col gap-2 rounded-xl border bg-card p-3">
              <div className="flex items-center gap-3">
                {employee.photoData ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={employee.photoData} alt="" className="size-12 shrink-0 rounded-full object-cover" />
                ) : (
                  <span className={`flex size-12 shrink-0 items-center justify-center rounded-full text-lg font-semibold ${tileColor(employee.id)}`}>
                    {employee.fullName.slice(0, 1).toUpperCase()}
                  </span>
                )}
                <div className="min-w-0">
                  <Link href={`/app/hr/employees/${employee.id}`} className="block truncate text-sm font-medium hover:underline">{employee.fullName}</Link>
                  <p className="truncate text-xs text-muted-foreground">{employee.jobTitle ?? "-"}</p>
                </div>
              </div>
              <div className="space-y-1 text-xs text-muted-foreground">
                {employee.email ? <p className="flex items-center gap-1.5 truncate"><Mail className="size-3.5 shrink-0" />{employee.email}</p> : null}
                {employee.phone ? <p className="flex items-center gap-1.5 truncate"><Phone className="size-3.5 shrink-0" />{employee.phone}</p> : null}
              </div>
              <div className="flex flex-wrap gap-1">
                <Badge variant={STATUS_BADGE[employee.status]}>{employee.status.replace("_", " ")}</Badge>
                {employee.tags.map((tag) => <Badge key={tag} variant="outline">{tag}</Badge>)}
              </div>
            </div>
          ))}
        </div>
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
                <TableCell className="font-medium"><Link href={`/app/hr/employees/${employee.id}`} className="hover:underline">{employee.fullName}</Link></TableCell>
                <TableCell className="text-muted-foreground">{employee.jobTitle ?? "-"}</TableCell>
                <TableCell className="text-muted-foreground">{employee.department ?? "-"}</TableCell>
                <TableCell className="text-muted-foreground">{employee.manager?.fullName ?? "-"}</TableCell>
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
                      {!["TERMINATED", "TERMINATION_PENDING"].includes(employee.status) ? <a href={`/app/hr/terminations?employeeId=${employee.id}`}><Button type="button" size="sm" variant="ghost">Termination workflow</Button></a> : null}
                      <EntityDialog
                        trigger={<Button size="sm" variant="ghost">Edit</Button>}
                        title="Edit employee"
                        action={upsertEmployee}
                        submitLabel="Save changes"
                        contentClassName="sm:max-w-xl"
                      >
                        <input type="hidden" name="id" value={employee.id} />
                        <EmployeeFields employee={employee} managerItems={managerItems} jobPositionNames={jobPositionNames} />
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
