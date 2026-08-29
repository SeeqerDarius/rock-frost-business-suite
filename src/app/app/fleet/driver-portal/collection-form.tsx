"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { submitDriverPayment } from "./actions";

type DriverVehicleOption = {
  id: string;
  plateNumber: string;
  salesTargetPeriod: "DAILY" | "WEEKLY" | null;
  salesTargetAmount: string | null;
  contracts: Array<{ id: string; name: string; paymentSchedule: "DAILY" | "WEEKLY"; scheduledAmount: string }>;
};

export function DriverCollectionForm({ vehicles, currency }: { vehicles: DriverVehicleOption[]; currency: string }) {
  const eligibleVehicles = vehicles.filter((vehicle) => vehicle.salesTargetPeriod || vehicle.contracts.length > 0);
  const [vehicleId, setVehicleId] = useState(eligibleVehicles[0]?.id ?? "");
  const vehicle = eligibleVehicles.find((item) => item.id === vehicleId);
  const typeOptions = [
    ...(vehicle?.salesTargetPeriod === "DAILY" ? [{ value: "DAILY_SALES", label: "Daily vehicle remittance" }] : []),
    ...(vehicle?.salesTargetPeriod === "WEEKLY" ? [{ value: "WEEKLY_SALES", label: "Weekly vehicle remittance" }] : []),
    ...(vehicle?.contracts.length ? [{ value: "WORK_AND_PAY", label: "Work & Pay instalment" }] : []),
  ];
  const [submissionType, setSubmissionType] = useState(typeOptions[0]?.value ?? "");
  const [contractId, setContractId] = useState(vehicle?.contracts[0]?.id ?? "");
  const [paymentMethod, setPaymentMethod] = useState("MOBILE_MONEY");
  const availableType = typeOptions.some((option) => option.value === submissionType) ? submissionType : typeOptions[0]?.value ?? "";
  const contract = vehicle?.contracts.find((item) => item.id === contractId) ?? vehicle?.contracts[0];
  const schedule = availableType === "WORK_AND_PAY" ? contract?.paymentSchedule : vehicle?.salesTargetPeriod;
  const today = new Date().toISOString().slice(0, 10);

  if (eligibleVehicles.length === 0) {
    return (
      <p className="rounded-lg border p-4 text-sm text-muted-foreground">
        No assigned vehicle has a daily or weekly remittance amount or an active Work & Pay contract. Ask your Fleet Manager to configure the assignment.
      </p>
    );
  }

  return (
    <form action={submitDriverPayment} className="grid gap-5 md:grid-cols-2">
      <div>
        <Label htmlFor="vehicleId">Assigned vehicle</Label>
        <select
          id="vehicleId"
          name="vehicleId"
          value={vehicleId}
          onChange={(event) => {
            const nextVehicle = eligibleVehicles.find((item) => item.id === event.target.value);
            setVehicleId(event.target.value);
            setContractId(nextVehicle?.contracts[0]?.id ?? "");
            setSubmissionType(
              nextVehicle?.salesTargetPeriod === "DAILY"
                ? "DAILY_SALES"
                : nextVehicle?.salesTargetPeriod === "WEEKLY"
                  ? "WEEKLY_SALES"
                  : "WORK_AND_PAY",
            );
          }}
          className="mt-2 h-11 w-full rounded-md border bg-background px-3"
          required
        >
          {eligibleVehicles.map((item) => <option key={item.id} value={item.id}>{item.plateNumber}</option>)}
        </select>
      </div>
      <div>
        <Label htmlFor="submissionType">Payment obligation</Label>
        <select
          id="submissionType"
          name="submissionType"
          value={availableType}
          onChange={(event) => setSubmissionType(event.target.value)}
          className="mt-2 h-11 w-full rounded-md border bg-background px-3"
          required
        >
          {typeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </div>
      {availableType === "WORK_AND_PAY" ? (
        <div className="md:col-span-2">
          <Label htmlFor="contractId">Active Work & Pay contract</Label>
          <select id="contractId" name="contractId" value={contract?.id ?? ""} onChange={(event) => setContractId(event.target.value)} className="mt-2 h-11 w-full rounded-md border bg-background px-3" required>
            {vehicle?.contracts.map((contract) => (
              <option key={contract.id} value={contract.id}>
                {contract.name} ({currency} {Number(contract.scheduledAmount).toFixed(2)} per {contract.paymentSchedule === "DAILY" ? "day" : "week"})
              </option>
            ))}
          </select>
          <p className="mt-2 text-sm text-muted-foreground">Required instalment: {currency} {Number(contract?.scheduledAmount ?? 0).toFixed(2)} per {contract?.paymentSchedule === "DAILY" ? "day" : "week"}.</p>
        </div>
      ) : (
        <div className="rounded-lg border bg-muted/30 p-3 text-sm md:col-span-2">
          Required remittance: {currency} {Number(vehicle?.salesTargetAmount ?? 0).toFixed(2)} per {vehicle?.salesTargetPeriod === "DAILY" ? "day" : "week"}.
          You can record a lower payment, but management will see the shortfall.
        </div>
      )}
      <div className="rounded-lg border border-blue-500/25 bg-blue-500/5 p-3 text-sm md:col-span-2">
        Pay the company first using the selected method. Record the completed payment here so management can verify receipt.
      </div>
      <div>
        <Label htmlFor="periodStart">{schedule === "DAILY" ? "Payment obligation date" : "Week beginning"}</Label>
        <Input id="periodStart" name="periodStart" type="date" defaultValue={today} required />
      </div>
      <div>
        <Label htmlFor="amount">Amount paid to company</Label>
        <Input key={`${vehicleId}-${availableType}-${contract?.id ?? "vehicle"}`} id="amount" name="amount" type="number" min="0.01" step="0.01" defaultValue={availableType === "WORK_AND_PAY" ? contract?.scheduledAmount : vehicle?.salesTargetAmount ?? ""} required />
      </div>
      <div>
        <Label htmlFor="paymentDate">Payment date</Label>
        <Input id="paymentDate" name="paymentDate" type="date" max={today} defaultValue={today} required />
      </div>
      <div>
        <Label htmlFor="paymentMethod">Payment method</Label>
        <select id="paymentMethod" name="paymentMethod" value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)} className="mt-2 h-11 w-full rounded-md border bg-background px-3" required>
          <option value="MOBILE_MONEY">Mobile money</option>
          <option value="BANK_TRANSFER">Bank transfer</option>
          <option value="CASH">Cash</option>
          <option value="CARD">Card</option>
          <option value="CHEQUE">Cheque</option>
          <option value="OTHER">Other</option>
        </select>
      </div>
      <div>
        <Label htmlFor="reference">{paymentMethod === "CASH" ? "Cash receipt reference (optional)" : "Transaction reference"}</Label>
        <Input id="reference" name="reference" placeholder={paymentMethod === "MOBILE_MONEY" ? "MoMo transaction ID" : "Payment reference"} required={paymentMethod !== "CASH"} />
      </div>
      <div>
        <Label htmlFor="notes">Notes (optional)</Label>
        <Textarea id="notes" name="notes" />
      </div>
      <div className="md:col-span-2"><SubmitButton /></div>
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button className="min-h-11 w-full sm:w-auto" type="submit" disabled={pending} aria-disabled={pending}>
      {pending ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : null}
      {pending ? "Recording payment..." : "Record payment for verification"}
    </Button>
  );
}
