import { ArrowLeftRight, Plus } from "lucide-react";
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
import { listMovements, listItems, listWarehouses } from "@/modules/inventory/service";
import { createMovement } from "./actions";

const ERROR_MESSAGES: Record<string, string> = {
  forbidden: "You don't have permission to record movements.",
  "missing-fields": "Item, warehouse, type, and a non-zero quantity are required.",
  "insufficient-stock": "There isn't enough stock at that warehouse for this movement.",
  "invalid-transfer": "Transfers need a different destination warehouse.",
};

const TYPE_LABELS: Record<string, string> = { RECEIPT: "Receipt", ISSUE: "Issue", ADJUSTMENT: "Adjustment", TRANSFER: "Transfer" };
const TYPE_BADGE: Record<string, "default" | "outline" | "destructive" | "secondary"> = {
  RECEIPT: "default",
  ISSUE: "destructive",
  ADJUSTMENT: "secondary",
  TRANSFER: "outline",
};

export default async function InventoryMovementsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { saved, error } = await searchParams;
  const tenant = await requireCurrentTenant();
  const canManage = hasPermission(tenant, PERMISSIONS.INVENTORY_MOVEMENTS_MANAGE);
  const [movements, items, warehouses] = await Promise.all([
    listMovements(tenant.organizationId),
    listItems(tenant.organizationId),
    listWarehouses(tenant.organizationId),
  ]);
  const itemItems: Record<string, string> = Object.fromEntries(items.map((i) => [i.id, `${i.name} (${i.sku})`]));
  const warehouseItems: Record<string, string> = Object.fromEntries(warehouses.map((w) => [w.id, w.name]));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <PageHeader title="Movements" description="Receipts, issues, adjustments, and transfers between warehouses." />
        {canManage ? (
          <EntityDialog trigger={<Button size="sm"><Plus />Record movement</Button>} title="Record a movement" action={createMovement}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="type">Type</Label>
                <Select name="type" defaultValue="RECEIPT" items={TYPE_LABELS}>
                  <SelectTrigger id="type" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(TYPE_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="occurredAt">Date</Label>
                <Input id="occurredAt" name="occurredAt" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="itemId">Item</Label>
              <Select name="itemId" items={itemItems}>
                <SelectTrigger id="itemId" className="w-full">
                  <SelectValue placeholder="Select an item" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(itemItems).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="warehouseId">Warehouse</Label>
                <Select name="warehouseId" items={warehouseItems}>
                  <SelectTrigger id="warehouseId" className="w-full">
                    <SelectValue placeholder="Select a warehouse" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(warehouseItems).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="quantity">Quantity</Label>
                <Input id="quantity" name="quantity" type="number" required />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="toWarehouseId">Destination warehouse (transfers only)</Label>
              <Select name="toWarehouseId" defaultValue="" items={{ "": "None", ...warehouseItems }}>
                <SelectTrigger id="toWarehouseId" className="w-full">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None</SelectItem>
                  {Object.entries(warehouseItems).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="reference">Reference</Label>
              <Input id="reference" name="reference" placeholder="e.g. PO number, invoice number" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" name="notes" rows={3} />
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

      {movements.length === 0 ? (
        <EmptyState icon={ArrowLeftRight} title="No movements yet" description="Movements you record will appear here." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Item</TableHead>
              <TableHead>Warehouse</TableHead>
              <TableHead>Quantity</TableHead>
              <TableHead>Reference</TableHead>
              <TableHead>Recorded by</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {movements.map((movement) => (
              <TableRow key={movement.id}>
                <TableCell className="text-muted-foreground">{movement.occurredAt.toLocaleDateString()}</TableCell>
                <TableCell>
                  <Badge variant={TYPE_BADGE[movement.type]}>{TYPE_LABELS[movement.type]}</Badge>
                </TableCell>
                <TableCell className="font-medium">{movement.item.name}</TableCell>
                <TableCell className="text-muted-foreground">
                  {movement.warehouse.name}
                  {movement.toWarehouse ? ` → ${movement.toWarehouse.name}` : ""}
                </TableCell>
                <TableCell>{movement.quantity}</TableCell>
                <TableCell className="text-muted-foreground">{movement.reference ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">{movement.createdBy?.name ?? movement.createdBy?.email ?? "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
