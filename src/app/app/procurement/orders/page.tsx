import Link from "next/link";
import { PackageCheck, Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EntityDialog } from "@/components/forms/entity-dialog";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { listOrders, listVendors, listRequests, getSettings } from "@/modules/procurement/service";
import { listItems, listWarehouses } from "@/modules/inventory/service";
import { createNewOrder, sendExistingOrder, cancelExistingOrder, receiveExistingOrderLine } from "./actions";

const ERROR_MESSAGES: Record<string, string> = {
  forbidden: "You don't have permission to manage orders.",
  "missing-fields": "All required fields must be filled in.",
  "invalid-state": "That action isn't valid for this order's current status.",
  "invalid-quantity": "Quantity received must be between 1 and the remaining quantity.",
  "warehouse-required": "Select a warehouse to receive this item into stock. Only a line with no linked item can be received without one.",
  "inventory-error": "There isn't enough capacity to record that receipt.",
  "not-found": "That vendor, request, item, order, or warehouse could not be found.",
};

const STATUS_BADGE: Record<string, "default" | "outline" | "destructive" | "secondary"> = {
  DRAFT: "outline",
  SENT: "secondary",
  PARTIALLY_RECEIVED: "secondary",
  RECEIVED: "default",
  CANCELLED: "destructive",
};

export default async function ProcurementOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { saved, error } = await searchParams;
  const tenant = await requireModuleAccess("procurement");
  const canManage = hasPermission(tenant, PERMISSIONS.PROCUREMENT_ORDERS_MANAGE);
  const canReceive = hasPermission(tenant, PERMISSIONS.PROCUREMENT_RECEIPTS_MANAGE);
  const [orders, vendors, requests, items, warehouses, settings] = await Promise.all([
    listOrders(tenant.organizationId),
    listVendors(tenant.organizationId),
    listRequests(tenant.organizationId),
    listItems(tenant.organizationId),
    listWarehouses(tenant.organizationId),
    getSettings(tenant.organizationId),
  ]);
  const vendorItems: Record<string, string> = Object.fromEntries(vendors.map((v) => [v.id, v.name]));
  const approvedRequestItems: Record<string, string> = Object.fromEntries(
    requests.filter((r) => r.status === "APPROVED").map((r) => [r.id, `${r.requestNumber} - ${r.description}`]),
  );
  const itemItems: Record<string, string> = Object.fromEntries(items.map((i) => [i.id, `${i.name} (${i.sku})`]));
  const warehouseItems: Record<string, string> = Object.fromEntries(warehouses.map((w) => [w.id, w.name]));
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <PageHeader title="Orders" description="Purchase orders sent to vendors." />
        {canManage && vendors.length === 0 ? (
          <Button size="sm" variant="outline" nativeButton={false} render={<Link href="/app/procurement/vendors" />}>
            <Plus />Add a vendor first
          </Button>
        ) : null}
        {canManage && vendors.length > 0 ? (
          <EntityDialog trigger={<Button size="sm"><Plus />New order</Button>} title="New purchase order" action={createNewOrder}>
            <div className="space-y-2">
              <Label htmlFor="vendorId">Vendor</Label>
              <Select name="vendorId" items={vendorItems}>
                <SelectTrigger id="vendorId" className="w-full">
                  <SelectValue placeholder="Select a vendor" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(vendorItems).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="requestId">Linked request (optional)</Label>
              <Select name="requestId" defaultValue="" items={{ "": "None", ...approvedRequestItems }}>
                <SelectTrigger id="requestId" className="w-full">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None</SelectItem>
                  {Object.entries(approvedRequestItems).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Line description</Label>
              <Input id="description" name="description" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="itemId">Inventory item (optional)</Label>
              <Select name="itemId" defaultValue="" items={{ "": "None", ...itemItems }}>
                <SelectTrigger id="itemId" className="w-full">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None</SelectItem>
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
                <Label htmlFor="quantity">Quantity</Label>
                <Input id="quantity" name="quantity" type="number" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="unitCost">Unit cost</Label>
                <Input id="unitCost" name="unitCost" type="number" step="0.01" required />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="orderDate">Order date</Label>
                <Input id="orderDate" name="orderDate" type="date" defaultValue={today} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="expectedDate">Expected date</Label>
                <Input id="expectedDate" name="expectedDate" type="date" />
              </div>
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

      {orders.length === 0 ? (
        <EmptyState icon={PackageCheck} title="No orders yet" description="Purchase orders you create will appear here." />
      ) : (
        <div className="space-y-3">
          {orders.map((order) => (
            <div key={order.id} className="rounded-lg border p-3">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium">
                    {order.orderNumber} - {order.vendor.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Ordered {order.orderDate.toLocaleDateString()}
                    {order.expectedDate ? ` · expected ${order.expectedDate.toLocaleDateString()}` : ""}
                  </p>
                </div>
                <Badge variant={STATUS_BADGE[order.status]}>{order.status.replace("_", " ")}</Badge>
              </div>
              <div className="mt-2 space-y-2">
                {order.lines.map((line) => {
                  const remaining = line.quantity - line.receivedQuantity;
                  const canReceiveLine = canReceive && remaining > 0 && (order.status === "SENT" || order.status === "PARTIALLY_RECEIVED");
                  return (
                    <div key={line.id} className="flex items-center justify-between gap-4 rounded-md bg-muted/40 p-2 text-sm">
                      <div>
                        <p>{line.description}</p>
                        <p className="text-xs text-muted-foreground">
                          {line.receivedQuantity} / {line.quantity} received · {Number(line.unitCost).toFixed(2)} each
                        </p>
                      </div>
                      {canReceiveLine ? (
                        <EntityDialog
                          trigger={<Button size="sm" variant="ghost">Receive</Button>}
                          title={`Receive: ${line.description}`}
                          action={receiveExistingOrderLine}
                          submitLabel="Record receipt"
                        >
                          <input type="hidden" name="orderId" value={order.id} />
                          <input type="hidden" name="lineId" value={line.id} />
                          <div className="space-y-2">
                            <Label htmlFor={`qty-${line.id}`}>Quantity received</Label>
                            <Input id={`qty-${line.id}`} name="quantity" type="number" defaultValue={remaining} max={remaining} min={1} required />
                          </div>
                          {line.itemId ? (
                            <div className="space-y-2">
                              <Label htmlFor={`wh-${line.id}`}>Warehouse</Label>
                              <Select name="warehouseId" defaultValue={settings?.defaultWarehouseId ?? undefined} items={warehouseItems}>
                                <SelectTrigger id={`wh-${line.id}`} className="w-full">
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
                              <p className="text-xs text-muted-foreground">
                                This line is linked to an inventory item, so a warehouse is required to add the received quantity to stock.
                              </p>
                            </div>
                          ) : (
                            <p className="text-xs text-muted-foreground">
                              This line has no linked inventory item, so it can be received without a warehouse. Only the order line updates.
                            </p>
                          )}
                        </EntityDialog>
                      ) : null}
                    </div>
                  );
                })}
              </div>
              {canManage ? (
                <div className="mt-2 flex justify-end gap-1">
                  {order.status === "DRAFT" ? (
                    <>
                      <form action={sendExistingOrder}>
                        <input type="hidden" name="id" value={order.id} />
                        <Button type="submit" size="sm" variant="ghost">Send</Button>
                      </form>
                      <form action={cancelExistingOrder}>
                        <input type="hidden" name="id" value={order.id} />
                        <Button type="submit" size="sm" variant="ghost">Cancel</Button>
                      </form>
                    </>
                  ) : null}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
