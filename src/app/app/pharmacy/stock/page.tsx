import { PackagePlus, Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { EntityDialog } from "@/components/forms/entity-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { listBatches, listMedicines, listStockMovements, listSuppliers } from "@/modules/pharmacy/service";
import { addBatch, addSupplier, changeBatchStatus, recordPatientReturnAction, recordStockAdjustmentAction, recordStockCountAction, recordSupplierReturnAction, recordWriteOffAction } from "../actions";
import { PharmacyStatusBanner } from "../status-banner";

const BATCH_STATUS_ITEMS: Record<string, string> = { AVAILABLE: "Available", QUARANTINED: "Quarantined", RECALLED: "Recalled" };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { saved, error } = await searchParams;
  const t = await requireModuleAccess("pharmacy");
  const canReconcile = hasPermission(t, PERMISSIONS.PHARMACY_STOCK_MANAGE);
  const [b, m, s, movements] = await Promise.all([
    listBatches(t.organizationId),
    listMedicines(t.organizationId),
    listSuppliers(t.organizationId),
    listStockMovements(t.organizationId),
  ]);
  const medicineItems: Record<string, string> = Object.fromEntries(m.map((x) => [x.id, x.name]));
  const supplierItems: Record<string, string> = Object.fromEntries(s.map((x) => [x.id, x.name]));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between gap-2">
        <PageHeader title="Stock & Batches" description="FEFO-ready batch stock with supplier, lot, expiry, quarantine and recall status." />
        <div className="flex gap-2">
          <EntityDialog trigger={<Button variant="outline"><Plus />Supplier</Button>} title="New supplier" action={addSupplier}>
            <div className="space-y-2">
              <Label htmlFor="supplier-name" required>Name</Label>
              <Input id="supplier-name" name="name" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="supplier-licenceNumber">Licence number</Label>
              <Input id="supplier-licenceNumber" name="licenceNumber" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="supplier-contactPerson">Contact person</Label>
              <Input id="supplier-contactPerson" name="contactPerson" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="supplier-phone">Phone</Label>
              <Input id="supplier-phone" name="phone" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="supplier-email">Email</Label>
              <Input id="supplier-email" name="email" type="email" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="supplier-address">Address</Label>
              <Input id="supplier-address" name="address" />
            </div>
          </EntityDialog>
          <EntityDialog trigger={<Button><PackagePlus />Receive batch</Button>} title="Receive medicine batch" action={addBatch}>
            <div className="space-y-2">
              <Label htmlFor="batch-medicineId" required>Medicine</Label>
              <Select name="medicineId" items={medicineItems}>
                <SelectTrigger id="batch-medicineId" className="w-full"><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>{m.map((x) => <SelectItem key={x.id} value={x.id}>{x.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="batch-supplierId">Supplier</Label>
              <Select name="supplierId" items={supplierItems}>
                <SelectTrigger id="batch-supplierId" className="w-full"><SelectValue placeholder="Optional" /></SelectTrigger>
                <SelectContent>{s.map((x) => <SelectItem key={x.id} value={x.id}>{x.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="batch-batchNumber" required>Batch number</Label>
              <Input id="batch-batchNumber" name="batchNumber" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="batch-barcode">Barcode</Label>
              <Input id="batch-barcode" name="barcode" placeholder="Scanned lot/GS1 code" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="batch-quantity" required>Quantity</Label>
              <Input id="batch-quantity" name="quantity" type="number" min="1" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="batch-costPrice" required>Cost price</Label>
              <Input id="batch-costPrice" name="costPrice" type="number" step="0.01" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="batch-manufactureDate">Manufactured</Label>
              <Input id="batch-manufactureDate" name="manufactureDate" type="date" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="batch-expiryDate" required>Expiry</Label>
              <Input id="batch-expiryDate" name="expiryDate" type="date" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="batch-invoiceReference">Invoice reference</Label>
              <Input id="batch-invoiceReference" name="invoiceReference" />
            </div>
          </EntityDialog>
        </div>
      </div>

      <PharmacyStatusBanner saved={saved} error={error} />

      {!b.length ? (
        <EmptyState icon={PackagePlus} title="No batches" description="Receive supplier stock to begin dispensing." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Medicine</TableHead>
              <TableHead>Batch</TableHead>
              <TableHead>Barcode</TableHead>
              <TableHead>Supplier</TableHead>
              <TableHead>Expires</TableHead>
              <TableHead>Quantity</TableHead>
              <TableHead>Status / action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {b.map((x) => (
              <TableRow key={x.id}>
                <TableCell>{x.medicine.name}</TableCell>
                <TableCell>{x.batchNumber}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{x.barcode ?? "-"}</TableCell>
                <TableCell>{x.supplier?.name ?? "-"}</TableCell>
                <TableCell>{x.expiryDate.toLocaleDateString()}</TableCell>
                <TableCell>{x.quantity}/{x.initialQuantity}</TableCell>
                <TableCell>
                  <div className="space-y-2">
                    <Badge variant={x.status === "AVAILABLE" ? "outline" : "destructive"}>{x.status}</Badge>
                    <form action={changeBatchStatus} className="flex flex-wrap gap-2">
                      <input type="hidden" name="batchId" value={x.id} />
                      <Select name="status" defaultValue={x.status === "DEPLETED" ? "AVAILABLE" : x.status} items={BATCH_STATUS_ITEMS}>
                        <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Object.entries(BATCH_STATUS_ITEMS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Input name="reason" required placeholder="Reason" className="w-44" />
                      <Button size="sm" variant="outline">Update</Button>
                    </form>
                    {canReconcile && (
                      <details className="text-xs">
                        <summary className="cursor-pointer text-muted-foreground">Reconcile stock</summary>
                        <div className="mt-2 space-y-2">
                          <form action={recordStockCountAction} className="flex flex-wrap items-end gap-2">
                            <input type="hidden" name="batchId" value={x.id} />
                            <Label className="text-xs">Physical count<Input name="countedQuantity" type="number" min="0" required className="h-8 w-20 text-xs" /></Label>
                            <Input name="reason" required placeholder="Reason" className="h-8 w-32 text-xs" />
                            <Button size="sm" variant="outline" type="submit">Record count</Button>
                          </form>
                          <form action={recordStockAdjustmentAction} className="flex flex-wrap items-end gap-2">
                            <input type="hidden" name="batchId" value={x.id} />
                            <Label className="text-xs">Adjust by (+/-)<Input name="quantityDelta" type="number" required className="h-8 w-20 text-xs" /></Label>
                            <Input name="reason" required placeholder="Reason" className="h-8 w-32 text-xs" />
                            <Button size="sm" variant="outline" type="submit">Adjust</Button>
                          </form>
                          <form action={recordWriteOffAction} className="flex flex-wrap items-end gap-2">
                            <input type="hidden" name="batchId" value={x.id} />
                            <Label className="text-xs">Write off<Input name="quantity" type="number" min="1" required className="h-8 w-20 text-xs" /></Label>
                            <Input name="reason" required placeholder="Reason" className="h-8 w-32 text-xs" />
                            <Button size="sm" variant="outline" type="submit">Write off</Button>
                          </form>
                          <form action={recordSupplierReturnAction} className="flex flex-wrap items-end gap-2">
                            <input type="hidden" name="batchId" value={x.id} />
                            <Label className="text-xs">Return to supplier<Input name="quantity" type="number" min="1" required className="h-8 w-20 text-xs" /></Label>
                            <Input name="reason" required placeholder="Reason" className="h-8 w-32 text-xs" />
                            <Input name="reference" placeholder="RMA ref" className="h-8 w-24 text-xs" />
                            <Button size="sm" variant="outline" type="submit">Return</Button>
                          </form>
                          <form action={recordPatientReturnAction} className="flex flex-wrap items-end gap-2">
                            <input type="hidden" name="batchId" value={x.id} />
                            <Label className="text-xs">Patient return (record only)<Input name="quantity" type="number" min="1" required className="h-8 w-20 text-xs" /></Label>
                            <Input name="reason" required placeholder="Reason" className="h-8 w-32 text-xs" />
                            <Button size="sm" variant="outline" type="submit">Record return</Button>
                          </form>
                        </div>
                      </details>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {movements.length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-medium">Recent stock movements</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Medicine / batch</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Delta</TableHead>
                <TableHead>Reason</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {movements.slice(0, 50).map((x) => (
                <TableRow key={x.id}>
                  <TableCell className="text-xs">{x.recordedAt.toLocaleString()}</TableCell>
                  <TableCell className="text-xs">{x.batch.medicine.name} · {x.batch.batchNumber}</TableCell>
                  <TableCell><Badge variant="outline">{x.type.replaceAll("_", " ")}</Badge></TableCell>
                  <TableCell>{x.quantityDelta > 0 ? `+${x.quantityDelta}` : x.quantityDelta}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{x.reason}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
