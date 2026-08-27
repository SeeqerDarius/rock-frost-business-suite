import { Lock, UserRound, Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EntityDialog } from "@/components/forms/entity-dialog";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { formatMoney } from "@/lib/currency";
import {
  listAssignableStaffUsers,
  listStaff,
  getEffectiveMonthlySalary,
  listStaffSalaryPayments,
  getInstallmentSettings,
} from "@/modules/installment/service";
import {
  upsertStaff,
  recordSalaryPayment,
  removeSalaryPayment,
  deactivateStaffMember,
  deleteStaffMember,
} from "./actions";

const ERROR_MESSAGES: Record<string, string> = {
  forbidden: "You don't have permission to manage staff.",
  "missing-fields": "Please fill in all required fields.",
  "not-found": "That staff member could not be found.",
  "invalid-amount": "Payment amount must be a positive number.",
  "invalid-member": "Choose an active login from this organization.",
  "member-already-linked": "That login is already linked to another staff profile.",
  "delete-confirmation": "Type DELETE exactly to confirm permanent deletion.",
  "wrong-password": "Your password was incorrect.",
  "staff-has-history": "This staff member has customer or account history. Deactivate them to preserve the records.",
  "staff-has-payroll-history": "This staff member has salary payment history. Deactivate them to preserve the records.",
};

interface StaffFieldsProps {
  staff?: {
    fullName: string;
    email: string | null;
    phone: string | null;
    monthlySalary: string;
    active: boolean;
    userId: string | null;
  };
  showCode?: boolean;
  defaultMonthlySalary?: string;
  userItems: Record<string, string>;
}

function StaffFields({ staff, showCode, defaultMonthlySalary, userItems }: StaffFieldsProps) {
  const idSuffix = staff ? "-edit" : "";
  const loginItems = { "": "No login linked", ...userItems };
  const defaultUserId = staff?.userId && userItems[staff.userId] ? staff.userId : "";
  return (
    <>
      <div className="space-y-2">
        <Label htmlFor={`fullName${idSuffix}`}>Full name</Label>
        <Input id={`fullName${idSuffix}`} name="fullName" defaultValue={staff?.fullName} required />
      </div>
      {showCode ? (
        <div className="space-y-2">
          <Label htmlFor="code">Staff code (optional, auto-generated if left blank)</Label>
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
      <div className="space-y-2">
        <Label htmlFor={`userId${idSuffix}`}>Member login (optional)</Label>
        <Select name="userId" defaultValue={defaultUserId} items={loginItems}>
          <SelectTrigger id={`userId${idSuffix}`} className="w-full">
            <SelectValue placeholder="No login linked" />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(loginItems).map(([value, label]) => (
              <SelectItem key={value || "unlinked"} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Linking an active member login limits that field user to this staff profile&apos;s customers, accounts, and payments.
        </p>
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
  searchParams: Promise<{ saved?: string; deleted?: string; error?: string }>;
}) {
  const { saved, deleted, error } = await searchParams;
  const tenant = await requireModuleAccess("installment");
  const canManage = hasPermission(tenant, PERMISSIONS.HIREPURCHASE_STAFF_MANAGE);

  if (!canManage) {
    return (
      <div className="space-y-6">
        <PageHeader title="Staff" description="Field staff managing installment customers and collections." />
        <EmptyState
          icon={Lock}
          title="You don't have access to this page"
          description="Staff profiles and salary information are limited to roles with staff-management permission."
        />
      </div>
    );
  }
  const currency = tenant.organization.currency;

  const [staffList, settings, assignableUsers, salaryPayments] = await Promise.all([
    listStaff(tenant.organizationId),
    getInstallmentSettings(tenant.organizationId),
    listAssignableStaffUsers(tenant.organizationId),
    listStaffSalaryPayments(tenant.organizationId),
  ]);
  const loginLabels = new Map(
    assignableUsers.map((user) => [user.id, user.name ? `${user.name} (${user.email})` : user.email]),
  );
  const linkedUserIds = new Set(staffList.flatMap((staff) => (staff.userId ? [staff.userId] : [])));
  const createUserItems = Object.fromEntries(
    assignableUsers
      .filter((user) => !linkedUserIds.has(user.id))
      .map((user) => [user.id, loginLabels.get(user.id) ?? user.email]),
  );
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
            <StaffFields
              showCode
              defaultMonthlySalary={settings.defaultMonthlySalary.toString()}
              userItems={createUserItems}
            />
          </EntityDialog>
        ) : null}
      </div>

      {saved ? (
        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600 dark:text-emerald-400">
          Saved.
        </div>
      ) : null}
      {deleted ? (
        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600 dark:text-emerald-400">
          Staff member deleted.
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
              <TableHead>Monthly salary ({currency})</TableHead>
              <TableHead>Login</TableHead>
              <TableHead>Status</TableHead>
              {canManage ? <TableHead /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {staffList.map((staff, index) => (
              <TableRow key={staff.id}>
                <TableCell className="font-medium">{staff.code}</TableCell>
                <TableCell>{staff.fullName}</TableCell>
                <TableCell className="text-muted-foreground">{staff.phone ?? "-"}</TableCell>
                <TableCell className="text-muted-foreground">{formatMoney(effectiveSalaries[index], currency)}</TableCell>
                <TableCell className="text-muted-foreground">
                  {staff.userId ? loginLabels.get(staff.userId) ?? "Inactive or unavailable login" : "Not linked"}
                </TableCell>
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
                        title={`Record salary payment: ${staff.fullName}`}
                        action={recordSalaryPayment}
                        submitLabel="Record"
                      >
                        <input type="hidden" name="staffId" value={staff.id} />
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="space-y-2">
                            <Label htmlFor={`amount-${staff.id}`}>Amount ({currency})</Label>
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
                        <StaffFields
                          staff={{ ...staff, monthlySalary: staff.monthlySalary.toString() }}
                          userItems={Object.fromEntries(
                            assignableUsers
                              .filter((user) => !linkedUserIds.has(user.id) || user.id === staff.userId)
                              .map((user) => [user.id, loginLabels.get(user.id) ?? user.email]),
                          )}
                        />
                      </EntityDialog>
                      {staff.active ? (
                        <form action={deactivateStaffMember}>
                          <input type="hidden" name="id" value={staff.id} />
                          <Button type="submit" size="sm" variant="ghost">Deactivate</Button>
                        </form>
                      ) : null}
                      <EntityDialog
                        trigger={<Button size="sm" variant="destructive">Delete</Button>}
                        title={`Delete ${staff.fullName}?`}
                        description="Permanent deletion is allowed only when this staff member has no customer, account, or payroll history. Otherwise, deactivate the profile."
                        action={deleteStaffMember}
                        submitLabel="Delete permanently"
                      >
                        <input type="hidden" name="id" value={staff.id} />
                        <div className="space-y-2">
                          <Label htmlFor={`confirmation-${staff.id}`}>Type DELETE to confirm</Label>
                          <Input id={`confirmation-${staff.id}`} name="confirmation" autoComplete="off" required />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor={`password-${staff.id}`}>Your password</Label>
                          <Input id={`password-${staff.id}`} name="password" type="password" autoComplete="current-password" required />
                        </div>
                      </EntityDialog>
                    </div>
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {salaryPayments.length > 0 ? (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Salary payment history</h2>
          <Table>
            <TableHeader><TableRow><TableHead>Staff</TableHead><TableHead>Salary month</TableHead><TableHead>Paid on</TableHead><TableHead>Amount ({currency})</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>
              {salaryPayments.map((payment) => (
                <TableRow key={payment.id}>
                  <TableCell>{staffList.find((staff) => staff.id === payment.staffId)?.fullName ?? "Former staff"}</TableCell>
                  <TableCell>{payment.salaryMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</TableCell>
                  <TableCell>{payment.paymentDate.toLocaleDateString()}</TableCell>
                  <TableCell>{formatMoney(payment.amount, currency)}</TableCell>
                  <TableCell className="text-right">
                    <form action={removeSalaryPayment}>
                      <input type="hidden" name="id" value={payment.id} />
                      <Button type="submit" size="sm" variant="ghost">Reverse</Button>
                    </form>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}
    </div>
  );
}
