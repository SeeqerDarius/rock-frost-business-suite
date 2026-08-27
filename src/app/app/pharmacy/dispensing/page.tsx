import { ShoppingBag, Printer } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { formatMoney } from "@/lib/currency";
import { listDispensings, listMedicines, listPatients, listPendingControlledDispenses, listPrescriptions } from "@/modules/pharmacy/service";
import { approveControlledDispenseAction, rejectControlledDispenseAction, reverseCompletedDispensing } from "../actions";
import { PharmacyStatusBanner } from "../status-banner";
import { DispensingForm } from "./dispensing-form";

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
  // Matches dispense()'s own needsPrescription condition exactly, so a
  // medicine that will actually be rejected without a prescription selected
  // is visibly marked here instead of only failing after Dispense is clicked.
  const medicines = meds.map((m) => ({
    id: m.id,
    name: m.name,
    needsPrescription: m.requiresPrescription || m.medicineClass === "PRESCRIPTION_ONLY" || m.medicineClass === "CONTROLLED",
  }));
  const prescriptionLines = open.flatMap((x) => x.lines).map((x) => ({
    id: x.id,
    label: `${x.medicine.name} (${x.quantityPrescribed - x.quantityDispensed} remaining)`,
  }));

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
          <DispensingForm patients={patients} openPrescriptions={open} medicines={medicines} prescriptionLines={prescriptionLines} />
          <p className="mt-2 text-xs text-muted-foreground">A medicine marked &quot;(prescription required)&quot; needs an active, unexpired prescription and prescription line selected above, or the dispense will be rejected. Create one from Prescriptions first if none is listed yet.</p>
          <p className="mt-1 text-xs text-muted-foreground">A dispense containing a controlled medicine goes to pending approval instead of completing immediately when the pharmacy maker-checker setting is on.</p>
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
