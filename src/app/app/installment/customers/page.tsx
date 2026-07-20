import { Users, Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EntityDialog } from "@/components/forms/entity-dialog";
import { requireCurrentTenant } from "@/lib/tenant";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getServerAuthSession } from "@/lib/auth/session";
import { listCustomers, listStaff, resolveInstallmentStaffScope } from "@/modules/installment/service";
import { upsertCustomer } from "./actions";

const ERROR_MESSAGES: Record<string, string> = {
  forbidden: "You don't have permission to manage customers.",
  "missing-fields": "Full name and assigned staff are required.",
};

interface CustomerFieldsProps {
  customer?: { fullName: string; phone: string | null; address: string | null; nationalId: string | null; staffId: string };
  staffItems: Record<string, string>;
}

function CustomerFields({ customer, staffItems }: CustomerFieldsProps) {
  const idSuffix = customer ? "-edit" : "";
  return (
    <>
      <div className="space-y-2">
        <Label htmlFor={`fullName${idSuffix}`}>Full name</Label>
        <Input id={`fullName${idSuffix}`} name="fullName" defaultValue={customer?.fullName} required />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`phone${idSuffix}`}>Phone</Label>
          <Input id={`phone${idSuffix}`} name="phone" defaultValue={customer?.phone ?? ""} />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`nationalId${idSuffix}`}>National ID</Label>
          <Input id={`nationalId${idSuffix}`} name="nationalId" defaultValue={customer?.nationalId ?? ""} />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor={`address${idSuffix}`}>Address</Label>
        <Input id={`address${idSuffix}`} name="address" defaultValue={customer?.address ?? ""} />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`staffId${idSuffix}`}>Assigned staff</Label>
        <Select name="staffId" defaultValue={customer?.staffId} items={staffItems}>
          <SelectTrigger id={`staffId${idSuffix}`} className="w-full">
            <SelectValue placeholder="Select staff" />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(staffItems).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </>
  );
}

export default async function InstallmentCustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { saved, error } = await searchParams;
  const tenant = await requireCurrentTenant();
  const canManage = hasPermission(tenant, PERMISSIONS.HIREPURCHASE_CUSTOMERS_MANAGE);
  const session = await getServerAuthSession();
  const isManager = hasPermission(tenant, PERMISSIONS.HIREPURCHASE_STAFF_MANAGE);
  const scope = await resolveInstallmentStaffScope(tenant.organizationId, session?.user?.id ?? "", isManager);

  const [customers, allStaff] = await Promise.all([
    listCustomers(tenant.organizationId, scope.staffId),
    listStaff(tenant.organizationId),
  ]);

  const staffItems: Record<string, string> = Object.fromEntries(
    (isManager ? allStaff : allStaff.filter((s) => s.id === scope.staffId)).map((s) => [s.id, `${s.fullName} (${s.code})`])
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <PageHeader title="Customers" description="Customers buying products on installment." />
        {canManage && Object.keys(staffItems).length > 0 ? (
          <EntityDialog
            trigger={
              <Button size="sm">
                <Plus />
                New customer
              </Button>
            }
            title="New customer"
            action={upsertCustomer}
          >
            <CustomerFields staffItems={staffItems} />
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

      {customers.length === 0 ? (
        <EmptyState icon={Users} title="No customers yet" description="Customers you add will appear here." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Staff</TableHead>
              {canManage ? <TableHead /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {customers.map((customer) => (
              <TableRow key={customer.id}>
                <TableCell className="font-medium">{customer.customerCode}</TableCell>
                <TableCell>{customer.fullName}</TableCell>
                <TableCell className="text-muted-foreground">{customer.phone ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">{customer.staff.fullName}</TableCell>
                {canManage ? (
                  <TableCell className="text-right">
                    <EntityDialog
                      trigger={
                        <Button size="sm" variant="ghost">
                          Edit
                        </Button>
                      }
                      title="Edit customer"
                      action={upsertCustomer}
                      submitLabel="Save changes"
                    >
                      <input type="hidden" name="id" value={customer.id} />
                      <CustomerFields customer={customer} staffItems={staffItems} />
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
