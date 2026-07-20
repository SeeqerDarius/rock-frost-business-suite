import { Warehouse as WarehouseIcon, Plus } from "lucide-react";
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
import { listWarehouses } from "@/modules/inventory/service";
import { upsertWarehouse } from "./actions";

const ERROR_MESSAGES: Record<string, string> = {
  forbidden: "You don't have permission to manage warehouses.",
  "missing-fields": "A name is required.",
};

interface WarehouseFieldsProps {
  warehouse?: { name: string; location: string | null; isDefault: boolean; active: boolean };
}

function WarehouseFields({ warehouse }: WarehouseFieldsProps) {
  const idSuffix = warehouse ? "-edit" : "";
  return (
    <>
      <div className="space-y-2">
        <Label htmlFor={`name${idSuffix}`}>Name</Label>
        <Input id={`name${idSuffix}`} name="name" defaultValue={warehouse?.name} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`location${idSuffix}`}>Location</Label>
        <Input id={`location${idSuffix}`} name="location" defaultValue={warehouse?.location ?? ""} placeholder="e.g. Accra Central" />
      </div>
      <div className="flex items-center gap-2">
        <Switch id={`isDefault${idSuffix}`} name="isDefault" defaultChecked={warehouse?.isDefault ?? false} />
        <Label htmlFor={`isDefault${idSuffix}`}>Default warehouse</Label>
      </div>
      <div className="flex items-center gap-2">
        <Switch id={`active${idSuffix}`} name="active" defaultChecked={warehouse?.active ?? true} />
        <Label htmlFor={`active${idSuffix}`}>Active</Label>
      </div>
    </>
  );
}

export default async function InventoryWarehousesPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { saved, error } = await searchParams;
  const tenant = await requireCurrentTenant();
  const canManage = hasPermission(tenant, PERMISSIONS.INVENTORY_WAREHOUSES_MANAGE);
  const warehouses = await listWarehouses(tenant.organizationId);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <PageHeader title="Warehouses" description="Physical or logical locations where stock is held." />
        {canManage ? (
          <EntityDialog trigger={<Button size="sm"><Plus />New warehouse</Button>} title="New warehouse" action={upsertWarehouse}>
            <WarehouseFields />
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

      {warehouses.length === 0 ? (
        <EmptyState icon={WarehouseIcon} title="No warehouses yet" description="Warehouses you add will appear here." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Default</TableHead>
              <TableHead>Status</TableHead>
              {canManage ? <TableHead /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {warehouses.map((warehouse) => (
              <TableRow key={warehouse.id}>
                <TableCell className="font-medium">{warehouse.name}</TableCell>
                <TableCell className="text-muted-foreground">{warehouse.location ?? "—"}</TableCell>
                <TableCell>{warehouse.isDefault ? <Badge>Default</Badge> : null}</TableCell>
                <TableCell>
                  <Badge variant={warehouse.active ? "default" : "outline"}>{warehouse.active ? "Active" : "Inactive"}</Badge>
                </TableCell>
                {canManage ? (
                  <TableCell className="text-right">
                    <EntityDialog
                      trigger={<Button size="sm" variant="ghost">Edit</Button>}
                      title="Edit warehouse"
                      action={upsertWarehouse}
                      submitLabel="Save changes"
                    >
                      <input type="hidden" name="id" value={warehouse.id} />
                      <WarehouseFields warehouse={warehouse} />
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
