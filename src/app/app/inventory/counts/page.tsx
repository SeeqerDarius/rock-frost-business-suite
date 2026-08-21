import { ClipboardCheck, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EntityDialog } from "@/components/forms/entity-dialog";
import { EmptyState } from "@/components/feedback/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { listInventoryCounts, listWarehouses } from "@/modules/inventory/service";
import { createCountAction, postCountAction, reviewCountAction, submitCountAction, updateCountLineAction } from "./actions";

const ERRORS: Record<string, string> = {
  forbidden: "You do not have permission to perform that stock-count action.",
  invalid: "Review the submitted values and try again.",
  state: "The stock count changed or is not in the required state.",
  "maker-checker": "The person who created the count cannot review the same count, and rejected counts require a reason.",
  "not-found": "The warehouse or stock count could not be found.",
};

export default async function InventoryCountsPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const { saved, error } = await searchParams;
  const tenant = await requireModuleAccess("inventory");
  const canManage = hasPermission(tenant, PERMISSIONS.INVENTORY_COUNTS_MANAGE);
  const canApprove = hasPermission(tenant, PERMISSIONS.INVENTORY_COUNTS_APPROVE);
  const [counts, warehouses] = await Promise.all([listInventoryCounts(tenant.organizationId), listWarehouses(tenant.organizationId)]);
  const today = new Date().toISOString().slice(0, 10);

  return <div className="space-y-6">
    <div className="flex items-start justify-between gap-4"><PageHeader title="Stock Counts" description="Record physical quantities, review variances, and post controlled adjustments." />
      {canManage ? <EntityDialog trigger={<Button size="sm"><Plus />New stock count</Button>} title="Start stock count" action={createCountAction}>
        <div className="space-y-2"><Label htmlFor="warehouseId">Warehouse</Label><select id="warehouseId" name="warehouseId" className="h-10 w-full rounded-md border bg-background px-3" required><option value="">Select warehouse</option>{warehouses.filter((warehouse) => warehouse.active).map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select></div>
        <div className="space-y-2"><Label htmlFor="countDate">Count date</Label><Input id="countDate" name="countDate" type="date" defaultValue={today} required /></div>
        <div className="space-y-2"><Label htmlFor="notes">Notes</Label><Textarea id="notes" name="notes" /></div>
      </EntityDialog> : null}
    </div>
    {saved ? <p className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm">Saved.</p> : null}
    {error && ERRORS[error] ? <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{ERRORS[error]}</p> : null}
    {counts.length === 0 ? <EmptyState icon={ClipboardCheck} title="No stock counts" description="Start a count to compare physical stock with the system ledger." /> : <div className="space-y-4">{counts.map((count) => <section key={count.id} className="rounded-xl border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><h2 className="font-semibold">{count.countNumber}</h2><Badge variant="outline">{count.status}</Badge></div><p className="text-sm text-muted-foreground">{count.warehouse.name}, {count.countDate.toLocaleDateString()}</p></div>
        <div className="flex flex-wrap gap-2">
          {canManage && count.status === "DRAFT" ? <form action={submitCountAction}><input type="hidden" name="countId" value={count.id} /><Button size="sm" type="submit">Submit for review</Button></form> : null}
          {canApprove && count.status === "SUBMITTED" ? <><form action={reviewCountAction}><input type="hidden" name="countId" value={count.id} /><input type="hidden" name="decision" value="APPROVE" /><Button size="sm" type="submit">Approve</Button></form><EntityDialog trigger={<Button size="sm" variant="destructive">Reject</Button>} title="Reject stock count" action={reviewCountAction} submitLabel="Reject count"><input type="hidden" name="countId" value={count.id} /><input type="hidden" name="decision" value="REJECT" /><div className="space-y-2"><Label htmlFor={`reason-${count.id}`}>Reason</Label><Textarea id={`reason-${count.id}`} name="reason" required /></div></EntityDialog></> : null}
          {canApprove && count.status === "APPROVED" ? <EntityDialog
            trigger={<Button size="sm">Post adjustments</Button>}
            title="Post stock adjustments"
            description="This records immutable inventory movements from the approved physical quantities. Corrections require a new stock count."
            action={postCountAction}
            submitLabel="Confirm and post"
          ><input type="hidden" name="countId" value={count.id} /></EntityDialog> : null}
        </div></div>
      <div className="mt-4 space-y-2">{count.lines.map((line) => <form key={line.id} action={updateCountLineAction} className="grid gap-2 rounded-md border p-3 sm:grid-cols-[minmax(0,1fr)_8rem_8rem_auto] sm:items-end"><input type="hidden" name="countId" value={count.id} /><input type="hidden" name="lineId" value={line.id} /><div><p className="font-medium">{line.item.name}</p><p className="text-xs text-muted-foreground">{line.item.sku}, expected {line.expectedQuantity}</p></div><div><Label htmlFor={`quantity-${line.id}`}>Counted</Label><Input id={`quantity-${line.id}`} name="countedQuantity" type="number" min="0" step="1" defaultValue={line.countedQuantity ?? ""} disabled={count.status !== "DRAFT"} required /></div><div><Label htmlFor={`notes-${line.id}`}>Line note</Label><Input id={`notes-${line.id}`} name="notes" defaultValue={line.notes ?? ""} disabled={count.status !== "DRAFT"} /></div>{count.status === "DRAFT" && canManage ? <Button size="sm" type="submit">Save line</Button> : <Badge variant={line.variance === 0 ? "outline" : "secondary"}>Variance {line.variance ?? "pending"}</Badge>}</form>)}</div>
    </section>)}</div>}
  </div>;
}
