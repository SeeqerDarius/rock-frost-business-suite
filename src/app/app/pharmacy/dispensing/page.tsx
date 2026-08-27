import { ShoppingBag, Printer } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { formatMoney } from "@/lib/currency";
import { listDispensings, listMedicines, listPatients, listPendingControlledDispenses, listPrescriptions } from "@/modules/pharmacy/service";
import { approveControlledDispenseAction, completeDispensing, rejectControlledDispenseAction, reverseCompletedDispensing } from "../actions";
import { PharmacyStatusBanner } from "../status-banner";
import { PAYMENT_METHOD_ITEMS } from "../payment-methods";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { saved, error } = await searchParams;
  const t = await requireModuleAccess("pharmacy");
  const canApprove = hasPermission(t, PERMISSIONS.PHARMACY_RESTRICTED_APPROVE);
  const currency = t.organization.currency;
  const [sales, meds, patients, rx, pending] = await Promise.all([
    listDispensings(t.organizationId),
    listMedicines(t.organizationId),
    listPatients(t.organizationId),
    listPrescriptions(t.organizationId),
    listPendingControlledDispenses(t.organizationId),
  ]);
  // Matches dispense()'s own eligibility query exactly: status alone isn't
  // enough, since a prescription can stay ACTIVE/PARTIALLY_DISPENSED in the
  // database past its own expiry date. Listing it here anyway would let staff
  // pick one that then fails with a confusing "prescription is required"
  // error, even though they clearly selected one.
  const open = rx.filter((x) => ["ACTIVE", "PARTIALLY_DISPENSED"].includes(x.status) && (!x.expiresAt || x.expiresAt > new Date()));
  const patientItems: Record<string, string> = Object.fromEntries(patients.map((x) => [x.id, x.fullName]));
  const medicineItems: Record<string, string> = Object.fromEntries(meds.map((x) => [x.id, x.name]));
  const prescriptionItems: Record<string, string> = Object.fromEntries(open.map((x) => [x.id, x.prescriptionNumber]));
  const prescriptionLineItems: Record<string, string> = Object.fromEntries(
    open.flatMap((x) => x.lines).map((x) => [x.id, `${x.medicine.name} (${x.quantityPrescribed - x.quantityDispensed} remaining)`]),
  );

  return (
    <div className="space-y-6">
      <PageHeader title="Dispensing" description="Prescription-aware FEFO dispensing that excludes expired, quarantined and recalled batches." />

      <PharmacyStatusBanner saved={saved} error={error} />

      {pending.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Pending controlled-drug approval</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {pending.map((x) => (
              <div key={x.id} className="rounded-md border p-3 text-sm">
                <p>{x.dispensingNumber} · {x.patient?.fullName ?? "Walk-in"} · {formatMoney(x.total, currency)} · requested {x.dispensedAt.toLocaleString()}</p>
                {canApprove ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <form action={approveControlledDispenseAction}>
                      <input type="hidden" name="dispensingId" value={x.id} />
                      <Button size="sm" type="submit">Approve</Button>
                    </form>
                    <form action={rejectControlledDispenseAction} className="flex items-end gap-2">
                      <input type="hidden" name="dispensingId" value={x.id} />
                      <Input name="reason" required placeholder="Rejection reason" className="h-8 w-40 text-xs" />
                      <Button size="sm" variant="outline" type="submit">Reject</Button>
                    </form>
                  </div>
                ) : (
                  <p className="mt-1 text-xs text-muted-foreground">Waiting for a second person to approve. The requester cannot approve their own request.</p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Complete dispensing</CardTitle></CardHeader>
        <CardContent>
          <form action={completeDispensing} className="grid gap-3 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="dispensing-number" required>Dispensing number</Label>
              <Input id="dispensing-number" name="dispensingNumber" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dispensing-patientId">Patient</Label>
              <Select name="patientId" defaultValue="" items={{ "": "Walk-in (no patient on file)", ...patientItems }}>
                <SelectTrigger id="dispensing-patientId" className="w-full"><SelectValue placeholder="Walk-in (no patient on file)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Walk-in (no patient on file)</SelectItem>
                  {patients.map((x) => <SelectItem key={x.id} value={x.id}>{x.fullName}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="dispensing-prescriptionId">Prescription</Label>
              <Select name="prescriptionId" defaultValue="" items={{ "": "None (over-the-counter sale)", ...prescriptionItems }}>
                <SelectTrigger id="dispensing-prescriptionId" className="w-full"><SelectValue placeholder="None (over-the-counter sale)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None (over-the-counter sale)</SelectItem>
                  {open.map((x) => <SelectItem key={x.id} value={x.id}>{x.prescriptionNumber}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="dispensing-medicineId" required>Medicine</Label>
              <Select name="medicineId" items={medicineItems}>
                <SelectTrigger id="dispensing-medicineId" className="w-full"><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>{meds.map((x) => <SelectItem key={x.id} value={x.id}>{x.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="dispensing-prescriptionLineId">Prescription line</Label>
              <Select name="prescriptionLineId" defaultValue="" items={{ "": "None (over-the-counter sale)", ...prescriptionLineItems }}>
                <SelectTrigger id="dispensing-prescriptionLineId" className="w-full"><SelectValue placeholder="None (over-the-counter sale)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None (over-the-counter sale)</SelectItem>
                  {open.flatMap((x) => x.lines).map((x) => (
                    <SelectItem key={x.id} value={x.id}>{x.medicine.name} ({x.quantityPrescribed - x.quantityDispensed} remaining)</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="dispensing-quantity" required>Quantity</Label>
              <Input id="dispensing-quantity" name="quantity" type="number" min="1" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dispensing-discount">Discount</Label>
              <Input id="dispensing-discount" name="discount" type="number" step="0.01" defaultValue="0" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dispensing-paymentMethod">Payment method</Label>
              <Select name="paymentMethod" defaultValue="" items={{ "": "Not specified", ...PAYMENT_METHOD_ITEMS }}>
                <SelectTrigger id="dispensing-paymentMethod" className="w-full"><SelectValue placeholder="Not specified" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Not specified</SelectItem>
                  {Object.entries(PAYMENT_METHOD_ITEMS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="dispensing-paymentReference">Payment reference</Label>
              <Input id="dispensing-paymentReference" name="paymentReference" />
            </div>
            <Button type="submit">Dispense</Button>
          </form>
          <p className="mt-2 text-xs text-muted-foreground">A dispense containing a controlled medicine goes to pending approval instead of completing immediately when the pharmacy maker-checker setting is on.</p>
        </CardContent>
      </Card>

      {!sales.length ? (
        <EmptyState icon={ShoppingBag} title="No dispensing records" description="Completed dispensing records appear here." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Number</TableHead>
              <TableHead>Patient</TableHead>
              <TableHead>Items</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Status / action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sales.map((x) => (
              <TableRow key={x.id}>
                <TableCell>
                  {x.dispensingNumber}
                  <div className="text-xs text-muted-foreground">{x.dispensedAt.toLocaleString()}</div>
                </TableCell>
                <TableCell>{x.patient?.fullName ?? "Walk-in"}</TableCell>
                <TableCell>{x.lines.map((l) => <div key={l.id}>{l.medicine.name} · {l.batch.batchNumber} · {l.quantity}</div>)}</TableCell>
                <TableCell>{formatMoney(x.total, currency)}</TableCell>
                <TableCell>
                  <Badge variant={x.status === "COMPLETED" ? "outline" : "destructive"}>{x.status}</Badge>
                  {x.status === "COMPLETED" && (
                    <Button size="sm" variant="outline" className="mt-2" nativeButton={false} render={<Link href={`/app/pharmacy/dispensing/${x.id}/receipt`} target="_blank" />}>
                      <Printer />
                      Receipt
                    </Button>
                  )}
                  {x.status === "COMPLETED" && (
                    <form action={reverseCompletedDispensing} className="mt-2 flex gap-2">
                      <input type="hidden" name="dispensingId" value={x.id} />
                      <Input name="reason" required placeholder="Reversal reason" className="w-44" />
                      <Button size="sm" variant="destructive">Reverse</Button>
                    </form>
                  )}
                  {x.reversalReason && <p className="mt-1 text-xs text-muted-foreground">{x.reversalReason}</p>}
                  {x.rejectionReason && <p className="mt-1 text-xs text-muted-foreground">{x.rejectionReason}</p>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
