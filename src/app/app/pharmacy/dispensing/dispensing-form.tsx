"use client";

import { useActionState, useMemo, useState } from "react";
import { Check, ClipboardList, ShoppingBasket } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { completeDispensing, type CompleteDispensingState } from "../actions";
import { PAYMENT_METHOD_ITEMS } from "../payment-methods";

const initialState: CompleteDispensingState = {};

interface PrescriptionLineOption {
  id: string; medicineId: string; medicineName: string; dosage: string; frequency: string;
  instructions: string | null; remaining: number; stockAvailable: number; unitPrice: number; controlled: boolean;
}

interface PrescriptionOption {
  id: string; prescriptionNumber: string; patientName: string; prescriberName: string;
  prescribedAt: string; lines: PrescriptionLineOption[];
}

interface MedicineOption { id: string; name: string; stockAvailable: number; unitPrice: number }

interface DispensingFormProps {
  patients: { id: string; fullName: string }[];
  prescriptions: PrescriptionOption[];
  otcMedicines: MedicineOption[];
  currency: string;
}

type SelectedLine = { medicineId: string; prescriptionLineId?: string; quantity: number };

function money(amount: number, currency: string) {
  return new Intl.NumberFormat("en", { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
}

export function DispensingForm({ patients, prescriptions, otcMedicines, currency }: DispensingFormProps) {
  const [state, action, pending] = useActionState(completeDispensing, initialState);
  const [mode, setMode] = useState<"prescription" | "otc">("prescription");
  const [prescriptionId, setPrescriptionId] = useState("");
  const [selectedLines, setSelectedLines] = useState<SelectedLine[]>([]);
  const [otcMedicineId, setOtcMedicineId] = useState("");
  const [otcQuantity, setOtcQuantity] = useState(1);
  const [discount, setDiscount] = useState(0);

  const prescription = prescriptions.find((item) => item.id === prescriptionId);
  const otcMedicine = otcMedicines.find((item) => item.id === otcMedicineId);
  const lines = mode === "prescription" ? selectedLines : otcMedicine ? [{ medicineId: otcMedicine.id, quantity: otcQuantity }] : [];
  const subtotal = useMemo(() => {
    if (mode === "otc") return otcMedicine ? otcMedicine.unitPrice * otcQuantity : 0;
    return selectedLines.reduce((sum, selected) => {
      const line = prescription?.lines.find((item) => item.id === selected.prescriptionLineId);
      return sum + (line?.unitPrice ?? 0) * selected.quantity;
    }, 0);
  }, [mode, otcMedicine, otcQuantity, prescription, selectedLines]);

  function choosePrescription(id: string) {
    setPrescriptionId(id);
    const next = prescriptions.find((item) => item.id === id);
    setSelectedLines(next?.lines.filter((line) => line.stockAvailable > 0).map((line) => ({
      medicineId: line.medicineId,
      prescriptionLineId: line.id,
      quantity: Math.min(line.remaining, line.stockAvailable),
    })) ?? []);
  }

  function toggleLine(line: PrescriptionLineOption) {
    setSelectedLines((current) => current.some((item) => item.prescriptionLineId === line.id)
      ? current.filter((item) => item.prescriptionLineId !== line.id)
      : [...current, { medicineId: line.medicineId, prescriptionLineId: line.id, quantity: Math.min(line.remaining, line.stockAvailable) }]);
  }

  function setLineQuantity(line: PrescriptionLineOption, quantity: number) {
    const safeQuantity = Math.max(1, Math.min(quantity || 1, line.remaining, line.stockAvailable));
    setSelectedLines((current) => current.map((item) => item.prescriptionLineId === line.id ? { ...item, quantity: safeQuantity } : item));
  }

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="mode" value={mode} />
      <input type="hidden" name="prescriptionId" value={mode === "prescription" ? prescriptionId : ""} />
      <input type="hidden" name="linesJson" value={JSON.stringify(lines)} />
      {state.error ? <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive" aria-live="polite">{state.error}</p> : null}

      <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Dispensing type">
        <button type="button" role="radio" aria-checked={mode === "prescription"} onClick={() => setMode("prescription")} className={cn("flex items-start gap-3 rounded-xl border p-4 text-left transition-colors", mode === "prescription" ? "border-primary bg-primary/5" : "hover:bg-muted/50")}>
          <ClipboardList className="mt-0.5 size-5 text-primary" />
          <span><strong className="block">From prescription</strong><span className="text-sm text-muted-foreground">Select the prescription. Patient and medicines fill automatically.</span></span>
          {mode === "prescription" ? <Check className="ml-auto size-5 text-primary" /> : null}
        </button>
        <button type="button" role="radio" aria-checked={mode === "otc"} onClick={() => setMode("otc")} className={cn("flex items-start gap-3 rounded-xl border p-4 text-left transition-colors", mode === "otc" ? "border-primary bg-primary/5" : "hover:bg-muted/50")}>
          <ShoppingBasket className="mt-0.5 size-5 text-primary" />
          <span><strong className="block">Over the counter</strong><span className="text-sm text-muted-foreground">Sell a medicine that does not require a prescription.</span></span>
          {mode === "otc" ? <Check className="ml-auto size-5 text-primary" /> : null}
        </button>
      </div>

      {mode === "prescription" ? (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="dispensing-prescription" required>Prescription</Label>
            <select id="dispensing-prescription" value={prescriptionId} onChange={(event) => choosePrescription(event.target.value)} className={cn("h-11 w-full rounded-md border bg-background px-3", state.fieldErrors?.prescriptionId && "border-destructive")}>
              <option value="">Select a patient prescription</option>
              {prescriptions.map((item) => <option key={item.id} value={item.id}>{item.prescriptionNumber} · {item.patientName}</option>)}
            </select>
          </div>
          {prescription ? (
            <div className="space-y-4 rounded-xl border bg-muted/20 p-4">
              <div className="grid gap-3 text-sm sm:grid-cols-3">
                <div><span className="block text-muted-foreground">Patient</span><strong>{prescription.patientName}</strong></div>
                <div><span className="block text-muted-foreground">Prescriber</span><strong>{prescription.prescriberName}</strong></div>
                <div><span className="block text-muted-foreground">Prescribed</span><strong>{prescription.prescribedAt}</strong></div>
              </div>
              <div className="space-y-3">
                {prescription.lines.map((line) => {
                  const selected = selectedLines.find((item) => item.prescriptionLineId === line.id);
                  const unavailable = line.stockAvailable <= 0;
                  return (
                    <div key={line.id} className={cn("grid gap-3 rounded-lg border bg-background p-3 sm:grid-cols-[auto_1fr_110px] sm:items-center", unavailable && "opacity-60")}>
                      <input type="checkbox" checked={Boolean(selected)} disabled={unavailable} onChange={() => toggleLine(line)} className="size-4" aria-label={`Dispense ${line.medicineName}`} />
                      <div>
                        <div className="flex flex-wrap items-center gap-2"><strong>{line.medicineName}</strong>{line.controlled ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">Approval required</span> : null}</div>
                        <p className="text-sm text-muted-foreground">{line.dosage} · {line.frequency}{line.instructions ? ` · ${line.instructions}` : ""}</p>
                        <p className="text-xs text-muted-foreground">{line.remaining} prescribed remaining · {line.stockAvailable} in stock · {money(line.unitPrice, currency)} each</p>
                        {unavailable ? <p className="text-xs font-medium text-destructive">Out of eligible stock</p> : null}
                      </div>
                      <div className="space-y-1"><Label htmlFor={`quantity-${line.id}`}>Quantity</Label><Input id={`quantity-${line.id}`} type="number" min={1} max={Math.min(line.remaining, line.stockAvailable)} value={selected?.quantity ?? 0} disabled={!selected} onChange={(event) => setLineQuantity(line, Number(event.target.value))} /></div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : prescriptions.length === 0 ? <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">No active prescriptions are ready to dispense. Create a valid prescription first.</p> : null}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="dispensing-otc-medicine" required>Medicine</Label>
            <select id="dispensing-otc-medicine" value={otcMedicineId} onChange={(event) => setOtcMedicineId(event.target.value)} className="h-11 w-full rounded-md border bg-background px-3">
              <option value="">Select an over-the-counter medicine</option>
              {otcMedicines.map((item) => <option key={item.id} value={item.id} disabled={item.stockAvailable <= 0}>{item.name} · {item.stockAvailable} in stock · {money(item.unitPrice, currency)}</option>)}
            </select>
          </div>
          <div className="space-y-2"><Label htmlFor="dispensing-otc-quantity" required>Quantity</Label><Input id="dispensing-otc-quantity" type="number" min={1} max={otcMedicine?.stockAvailable || 1} value={otcQuantity} onChange={(event) => setOtcQuantity(Math.max(1, Number(event.target.value) || 1))} /></div>
          <div className="space-y-2 sm:col-span-3"><Label htmlFor="dispensing-patientId">Patient (optional)</Label><select id="dispensing-patientId" name="patientId" defaultValue="" className="h-11 w-full rounded-md border bg-background px-3"><option value="">Walk-in customer</option>{patients.map((patient) => <option key={patient.id} value={patient.id}>{patient.fullName}</option>)}</select></div>
        </div>
      )}

      <div className="grid gap-4 rounded-xl border p-4 sm:grid-cols-3">
        <div className="space-y-2"><Label htmlFor="dispensing-paymentMethod" required>Payment method</Label><select id="dispensing-paymentMethod" name="paymentMethod" defaultValue="CASH" className="h-10 w-full rounded-md border bg-background px-3">{Object.entries(PAYMENT_METHOD_ITEMS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
        <div className="space-y-2"><Label htmlFor="dispensing-paymentReference">Payment reference</Label><Input id="dispensing-paymentReference" name="paymentReference" placeholder="Optional" /></div>
        <div className="space-y-2"><Label htmlFor="dispensing-discount">Discount</Label><Input id="dispensing-discount" name="discount" type="number" min="0" max={subtotal} step="0.01" value={discount} onChange={(event) => setDiscount(Math.max(0, Number(event.target.value) || 0))} /></div>
        <div className="sm:col-span-3 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <div><span className="text-sm text-muted-foreground">Amount to collect</span><p className="text-2xl font-semibold">{money(Math.max(0, subtotal - discount), currency)}</p></div>
          <Button type="submit" size="lg" disabled={pending || lines.length === 0}>{pending ? "Completing dispense..." : mode === "prescription" ? "Dispense selected medicines" : "Complete sale"}</Button>
        </div>
      </div>
    </form>
  );
}
