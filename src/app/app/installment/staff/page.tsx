import { UserRound, Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { EntityDialog } from "@/components/forms/entity-dialog";
import { requireCurrentTenant } from "@/lib/tenant";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { listStaff, getEffectiveMonthlySalary, getInstallmentSettings } from "@/modules/installment/service";
import { upsertStaff, recordSalaryPayment } from "./actions";

const ERROR_MESSAGES: Record<string, string> = {
  forbidden: "You don't have permission to manage staff.",
  "missing-fields": "Please fill in all required fields.",
  "not-found": "That staff member could not be found.",
  "invalid-amount": "Payment amount must be a positive number.",
};

interface StaffFieldsProps {
  staff?: { fullName: string; email: string | null; phone: string | null; monthlySalary: string; active: boolean };
  showCode?: boolean;
  defaultMonthlySalary?: string;
}

function StaffFields({ staff, showCode, defaultMonthlySalary }: StaffFieldsProps) {
  const idSuffix = staff ? "-edit" : "";
  return (
    <>
      <div className="space-y-2">
        <Label htmlFor={`fullName${idSuffix}`}>Full name</Label>
        <Input id={`fullName${idSuffix}`} name="fullName" defaultValue={staff?.fullName} required />
      </div>
      {showCode ? (
        <div className="space-y-2">
          <Label htmlFor="code">Staff code (optional — auto-generated if left blank)</Label>
          <Input id="code" name="code" placeholder="e.g. EFU" />
        </div>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`phone${idSuffix}`}>Phone</Label>
          <Input id={`phone${idSuffix}`} name="phone" defaultValue={staff?.phone ?? ""} />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`email${idSuffix}`}>Email</Label>
          <Input id={`email${idSuffix}`} name="email" type="email" defaultValue={staff?.email ?? ""} />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor={`monthlySalary${idSuffix}`}>Monthly salary</Label>
        <Input id={`monthlySalary${idSuffix}`} name="monthlySalary" type="number" step="0.01" defaultValue={staff?.monthlySalary ?? defaultMonthlySalary ?? "0"} required />
      </div>
      {staff ? (
        <label className="flex items-center gap-2 text-sm">
          <Checkbox name="active" defaultChecked={staff.active} />
          Active
        </label>
      ) : null}
    </>
  );
}

export default async function InstallmentStaffPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { saved, error } = await searchParams;
  const tenant = await requireCurrentTenant();
  const canManage = hasPermission(tenant, PERMISSIONS.HIREPURCHASE_STAFF_MANAGE);
  const [staffList, settings] = await Promise.all([listStaff(tenant.organizationId), getInstallmentSettings(tenant.organizationId)]);
  const now = new Date();
  const effectiveSalaries = await Promise.all(
    staffList.map((s) => getEffectiveMonthlySalary(s.id, tenant.organizationId, now))
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <PageHeader title="Staff" description="Field staff managing installment customers and collections." />
        {canManage ? (
          <EntityDialog
            trigger={
              <Button size="sm">
                <Plus />
                New staff member
              </Button>
            }
            title="New staff member"
            action={upsertStaff}
          >
            <StaffFields showCode defaultMonthlySalary={settings.defaultMonthlySalary.toString()} />
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

      {staffList.length === 0 ? (
        <EmptyState icon={UserRound} title="No staff yet" description="Staff members you add will appear here." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Monthly salary</TableHead>
              <TableHead>Status</TableHead>
              {canManage ? <TableHead /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {staffList.map((staff, index) => (
              <TableRow key={staff.id}>
                <TableCell className="font-medium">{staff.code}</TableCell>
                <TableCell>{staff.fullName}</TableCell>
                <TableCell className="text-muted-foreground">{staff.phone ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">{effectiveSalaries[index].toFixed(2)}</TableCell>
                <TableCell>
                  <Badge variant={staff.active ? "default" : "outline"}>{staff.active ? "Active" : "Inactive"}</Badge>
                </TableCell>
                {canManage ? (
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <EntityDialog
                        trigger={
                          <Button size="sm" variant="ghost">
                            Pay salary
                          </Button>
                        }
                        title={`Record salary payment — ${staff.fullName}`}
                        action={recordSalaryPayment}
                        submitLabel="Record"
                      >
                        <input type="hidden" name="staffId" value={staff.id} />
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="space-y-2">
                            <Label htmlFor={`amount-${staff.id}`}>Amount</Label>
                            <Input id={`amount-${staff.id}`} name="amount" type="number" step="0.01" defaultValue={effectiveSalaries[index].toFixed(2)} required />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor={`paymentDate-${staff.id}`}>Payment date</Label>
                            <Input id={`paymentDate-${staff.id}`} name="paymentDate" type="date" defaultValue={now.toISOString().slice(0, 10)} required />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor={`salaryMonth-${staff.id}`}>Salary month</Label>
                          <Input id={`salaryMonth-${staff.id}`} name="salaryMonth" type="month" defaultValue={now.toISOString().slice(0, 7)} required />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor={`notes-${staff.id}`}>Notes</Label>
                          <Input id={`notes-${staff.id}`} name="notes" />
                        </div>
                      </EntityDialog>
                      <EntityDialog
                        trigger={
                          <Button size="sm" variant="ghost">
                            Edit
                          </Button>
                        }
                        title="Edit staff member"
                        action={upsertStaff}
                        submitLabel="Save changes"
                      >
                        <input type="hidden" name="id" value={staff.id} />
                        <StaffFields staff={{ ...staff, monthlySalary: staff.monthlySalary.toString() }} />
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
