"use client";

import { useActionState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { completeDispensing, type CompleteDispensingState } from "../actions";
import { PAYMENT_METHOD_ITEMS } from "../payment-methods";

const initialState: CompleteDispensingState = {};

interface DispensingFormProps {
  patients: { id: string; fullName: string }[];
  openPrescriptions: { id: string; prescriptionNumber: string }[];
  medicines: { id: string; name: string; needsPrescription: boolean }[];
  prescriptionLines: { id: string; label: string }[];
}

/**
 * A failed submission used to redirect to `?error=...`, which remounts this
 * whole server-rendered form from scratch - every field the user had typed
 * (dispensing number, quantity, discount, payment method, all of it) was
 * silently lost, on top of a generic "check the highlighted fields" banner
 * that never actually highlighted anything. useActionState keeps this form
 * mounted across a failed submit, so uncontrolled inputs keep whatever the
 * user typed, and fieldErrors drives real per-field highlighting.
 */
export function DispensingForm({ patients, openPrescriptions, medicines, prescriptionLines }: DispensingFormProps) {
  const [state, action, pending] = useActionState(completeDispensing, initialState);
  const fieldErrors = state.fieldErrors ?? {};

  const medicineLabel = (m: DispensingFormProps["medicines"][number]) => m.needsPrescription ? `${m.name} (prescription required)` : m.name;
  const medicineItems: Record<string, string> = Object.fromEntries(medicines.map((m) => [m.id, medicineLabel(m)]));
  const patientItems: Record<string, string> = { "": "Walk-in (no patient on file)", ...Object.fromEntries(patients.map((p) => [p.id, p.fullName])) };
  const prescriptionItems: Record<string, string> = { "": "None (over-the-counter sale)", ...Object.fromEntries(openPrescriptions.map((p) => [p.id, p.prescriptionNumber])) };
  const prescriptionLineItems: Record<string, string> = { "": "None (over-the-counter sale)", ...Object.fromEntries(prescriptionLines.map((l) => [l.id, l.label])) };

  return (
    <form action={action} className="grid gap-3 md:grid-cols-3">
      {state.error ? (
        <p className="md:col-span-3 rounded-md bg-destructive/10 p-3 text-sm text-destructive" aria-live="polite">{state.error}</p>
      ) : null}
      <div className="space-y-2">
        <Label htmlFor="dispensing-number" required>Dispensing number</Label>
        <Input id="dispensing-number" name="dispensingNumber" required aria-invalid={fieldErrors.dispensingNumber} className={cn(fieldErrors.dispensingNumber && "border-destructive")} />
        {fieldErrors.dispensingNumber ? <p className="text-xs text-destructive">Enter a dispensing number.</p> : null}
      </div>
      <div className="space-y-2">
        <Label htmlFor="dispensing-patientId">Patient</Label>
        <Select name="patientId" defaultValue="" items={patientItems}>
          <SelectTrigger id="dispensing-patientId" className="w-full"><SelectValue placeholder="Walk-in (no patient on file)" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="">Walk-in (no patient on file)</SelectItem>
            {patients.map((x) => <SelectItem key={x.id} value={x.id}>{x.fullName}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="dispensing-prescriptionId">Prescription</Label>
        <Select name="prescriptionId" defaultValue="" items={prescriptionItems}>
          <SelectTrigger id="dispensing-prescriptionId" className="w-full"><SelectValue placeholder="None (over-the-counter sale)" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="">None (over-the-counter sale)</SelectItem>
            {openPrescriptions.map((x) => <SelectItem key={x.id} value={x.id}>{x.prescriptionNumber}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="dispensing-medicineId" required>Medicine</Label>
        <Select name="medicineId" items={medicineItems}>
          <SelectTrigger id="dispensing-medicineId" className={cn("w-full", fieldErrors.medicineId && "border-destructive")}><SelectValue placeholder="Select" /></SelectTrigger>
          <SelectContent>{medicines.map((x) => <SelectItem key={x.id} value={x.id}>{medicineLabel(x)}</SelectItem>)}</SelectContent>
        </Select>
        {fieldErrors.medicineId ? <p className="text-xs text-destructive">Select a medicine.</p> : null}
      </div>
      <div className="space-y-2">
        <Label htmlFor="dispensing-prescriptionLineId">Prescription line</Label>
        <Select name="prescriptionLineId" defaultValue="" items={prescriptionLineItems}>
          <SelectTrigger id="dispensing-prescriptionLineId" className="w-full"><SelectValue placeholder="None (over-the-counter sale)" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="">None (over-the-counter sale)</SelectItem>
            {prescriptionLines.map((x) => <SelectItem key={x.id} value={x.id}>{x.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="dispensing-quantity" required>Quantity</Label>
        <Input id="dispensing-quantity" name="quantity" type="number" min="1" required aria-invalid={fieldErrors.quantity} className={cn(fieldErrors.quantity && "border-destructive")} />
        {fieldErrors.quantity ? <p className="text-xs text-destructive">Enter a quantity of at least 1.</p> : null}
      </div>
      <div className="space-y-2">
        <Label htmlFor="dispensing-discount">Discount</Label>
        <Input id="dispensing-discount" name="discount" type="number" step="0.01" defaultValue="0" aria-invalid={fieldErrors.discount} className={cn(fieldErrors.discount && "border-destructive")} />
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
      <Button type="submit" disabled={pending}>{pending ? "Dispensing…" : "Dispense"}</Button>
    </form>
  );
}
