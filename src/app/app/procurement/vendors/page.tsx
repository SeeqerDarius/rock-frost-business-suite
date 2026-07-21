import { Building2, Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { EntityDialog } from "@/components/forms/entity-dialog";
import { requireCurrentTenant } from "@/lib/tenant";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { listVendors } from "@/modules/procurement/service";
import { upsertVendor } from "./actions";

const ERROR_MESSAGES: Record<string, string> = {
  forbidden: "You don't have permission to manage vendors.",
  "missing-fields": "A name is required.",
};

interface VendorFieldsProps {
  vendor?: { name: string; contactName: string | null; email: string | null; phone: string | null; address: string | null; active: boolean };
}

function VendorFields({ vendor }: VendorFieldsProps) {
  const idSuffix = vendor ? "-edit" : "";
  return (
    <>
      <div className="space-y-2">
        <Label htmlFor={`name${idSuffix}`}>Name</Label>
        <Input id={`name${idSuffix}`} name="name" defaultValue={vendor?.name} required />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`contactName${idSuffix}`}>Contact name</Label>
          <Input id={`contactName${idSuffix}`} name="contactName" defaultValue={vendor?.contactName ?? ""} />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`email${idSuffix}`}>Email</Label>
          <Input id={`email${idSuffix}`} name="email" type="email" defaultValue={vendor?.email ?? ""} />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`phone${idSuffix}`}>Phone</Label>
          <Input id={`phone${idSuffix}`} name="phone" defaultValue={vendor?.phone ?? ""} />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`address${idSuffix}`}>Address</Label>
          <Input id={`address${idSuffix}`} name="address" defaultValue={vendor?.address ?? ""} />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Switch id={`active${idSuffix}`} name="active" defaultChecked={vendor?.active ?? true} />
        <Label htmlFor={`active${idSuffix}`}>Active</Label>
      </div>
    </>
  );
}

export default async function ProcurementVendorsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { saved, error } = await searchParams;
  const tenant = await requireCurrentTenant();
  const canManage = hasPermission(tenant, PERMISSIONS.PROCUREMENT_VENDORS_MANAGE);
  const vendors = await listVendors(tenant.organizationId);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <PageHeader title="Vendors" description="Suppliers your organization purchases from." />
        {canManage ? (
          <EntityDialog trigger={<Button size="sm"><Plus />New vendor</Button>} title="New vendor" action={upsertVendor}>
            <VendorFields />
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

      {vendors.length === 0 ? (
        <EmptyState icon={Building2} title="No vendors yet" description="Vendors you add will appear here." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Status</TableHead>
              {canManage ? <TableHead /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {vendors.map((vendor) => (
              <TableRow key={vendor.id}>
                <TableCell className="font-medium">{vendor.name}</TableCell>
                <TableCell className="text-muted-foreground">{vendor.contactName ?? "-"}</TableCell>
                <TableCell className="text-muted-foreground">{vendor.email ?? "-"}</TableCell>
                <TableCell className="text-muted-foreground">{vendor.phone ?? "-"}</TableCell>
                <TableCell>
                  <Badge variant={vendor.active ? "default" : "outline"}>{vendor.active ? "Active" : "Inactive"}</Badge>
                </TableCell>
                {canManage ? (
                  <TableCell className="text-right">
                    <EntityDialog
                      trigger={<Button size="sm" variant="ghost">Edit</Button>}
                      title="Edit vendor"
                      action={upsertVendor}
                      submitLabel="Save changes"
                    >
                      <input type="hidden" name="id" value={vendor.id} />
                      <VendorFields vendor={vendor} />
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
