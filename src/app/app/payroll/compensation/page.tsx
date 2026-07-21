import { Banknote, Plus } from "lucide-react";
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
import { listCompensation, listEmployeesWithoutCompensation } from "@/modules/payroll/service";
import { saveCompensation } from "./actions";

const ERROR_MESSAGES: Record<string, string> = {
  forbidden: "You don't have permission to manage compensation.",
  "missing-fields": "Employee, base salary, and effective date are required.",
  "not-found": "That employee could not be found.",
};

const FREQUENCY_ITEMS: Record<string, string> = { MONTHLY: "Monthly", BIWEEKLY: "Bi-weekly", WEEKLY: "Weekly" };

export default async function PayrollCompensationPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { saved, error } = await searchParams;
  const tenant = await requireCurrentTenant();
  const canManage = hasPermission(tenant, PERMISSIONS.PAYROLL_COMPENSATION_MANAGE);
  const [compensations, uncoveredEmployees] = await Promise.all([
    listCompensation(tenant.organizationId),
    listEmployeesWithoutCompensation(tenant.organizationId),
  ]);
  const employeeItems: Record<string, string> = Object.fromEntries(uncoveredEmployees.map((e) => [e.id, e.fullName]));
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <PageHeader title="Compensation" description="Base salary on record for each employee." />
        {canManage && uncoveredEmployees.length > 0 ? (
          <EntityDialog trigger={<Button size="sm"><Plus />Set compensation</Button>} title="Set employee compensation" action={saveCompensation}>
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
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="baseSalary">Base salary</Label>
                <Input id="baseSalary" name="baseSalary" type="number" step="0.01" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="payFrequency">Frequency</Label>
                <Select name="payFrequency" defaultValue="MONTHLY" items={FREQUENCY_ITEMS}>
                  <SelectTrigger id="payFrequency" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(FREQUENCY_ITEMS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="effectiveDate">Effective date</Label>
              <Input id="effectiveDate" name="effectiveDate" type="date" defaultValue={today} required />
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

      {uncoveredEmployees.length > 0 ? (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
          {uncoveredEmployees.length} active employee{uncoveredEmployees.length === 1 ? "" : "s"} have no compensation on record and will be skipped by payroll runs.
        </div>
      ) : null}

      {compensations.length === 0 ? (
        <EmptyState icon={Banknote} title="No compensation set yet" description="Set a base salary for each employee before running payroll." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employee</TableHead>
              <TableHead>Base salary</TableHead>
              <TableHead>Frequency</TableHead>
              <TableHead>Effective</TableHead>
              {canManage ? <TableHead /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {compensations.map((comp) => (
              <TableRow key={comp.id}>
                <TableCell className="font-medium">{comp.employee.fullName}</TableCell>
                <TableCell className="text-muted-foreground">{Number(comp.baseSalary).toFixed(2)}</TableCell>
                <TableCell>
                  <Badge variant="outline">{FREQUENCY_ITEMS[comp.payFrequency] ?? comp.payFrequency}</Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">{comp.effectiveDate.toLocaleDateString()}</TableCell>
                {canManage ? (
                  <TableCell className="text-right">
                    <EntityDialog
                      trigger={<Button size="sm" variant="ghost">Edit</Button>}
                      title={`Edit compensation: ${comp.employee.fullName}`}
                      action={saveCompensation}
                      submitLabel="Save changes"
                    >
                      <input type="hidden" name="employeeId" value={comp.employeeId} />
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor={`baseSalary-${comp.id}`}>Base salary</Label>
                          <Input id={`baseSalary-${comp.id}`} name="baseSalary" type="number" step="0.01" defaultValue={comp.baseSalary.toString()} required />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor={`payFrequency-${comp.id}`}>Frequency</Label>
                          <Select name="payFrequency" defaultValue={comp.payFrequency} items={FREQUENCY_ITEMS}>
                            <SelectTrigger id={`payFrequency-${comp.id}`} className="w-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {Object.entries(FREQUENCY_ITEMS).map(([value, label]) => (
                                <SelectItem key={value} value={value}>
                                  {label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`effectiveDate-${comp.id}`}>Effective date</Label>
                        <Input
                          id={`effectiveDate-${comp.id}`}
                          name="effectiveDate"
                          type="date"
                          defaultValue={comp.effectiveDate.toISOString().slice(0, 10)}
                          required
                        />
                      </div>
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
