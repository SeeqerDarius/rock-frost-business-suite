"use client";

import { useMemo, useState } from "react";
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
  contracts: Array<{ id: string; name: string; weeklyAmount: string }>;
};

export function DriverCollectionForm({ vehicles, currency }: { vehicles: DriverVehicleOption[]; currency: string }) {
  const eligibleVehicles = vehicles.filter((vehicle) => vehicle.salesTargetPeriod || vehicle.contracts.length > 0);
  const [vehicleId, setVehicleId] = useState(eligibleVehicles[0]?.id ?? "");
  const vehicle = useMemo(() => eligibleVehicles.find((item) => item.id === vehicleId), [eligibleVehicles, vehicleId]);
  const typeOptions = [
    ...(vehicle?.salesTargetPeriod === "DAILY" ? [{ value: "DAILY_SALES", label: "Daily sales" }] : []),
    ...(vehicle?.salesTargetPeriod === "WEEKLY" ? [{ value: "WEEKLY_SALES", label: "Weekly sales" }] : []),
    ...(vehicle?.contracts.length ? [{ value: "WORK_AND_PAY", label: "Work & Pay" }] : []),
  ];
  const [submissionType, setSubmissionType] = useState(typeOptions[0]?.value ?? "");
  const availableType = typeOptions.some((option) => option.value === submissionType) ? submissionType : typeOptions[0]?.value ?? "";
  const today = new Date().toISOString().slice(0, 10);

  if (eligibleVehicles.length === 0) {
    return (
      <p className="rounded-lg border p-4 text-sm text-muted-foreground">
        No assigned vehicle has a daily sales target, weekly sales target, or active Work & Pay contract. Ask your Fleet Manager to configure the assignment.
      </p>
    );
  }

  return (
    <form action={submitDriverPayment} className="grid gap-4 md:grid-cols-2">
      <div>
        <Label htmlFor="vehicleId">Assigned vehicle</Label>
        <select
          id="vehicleId"
          name="vehicleId"
          value={vehicleId}
          onChange={(event) => {
            const nextVehicle = eligibleVehicles.find((item) => item.id === event.target.value);
            setVehicleId(event.target.value);
            setSubmissionType(
              nextVehicle?.salesTargetPeriod === "DAILY"
                ? "DAILY_SALES"
                : nextVehicle?.salesTargetPeriod === "WEEKLY"
                  ? "WEEKLY_SALES"
                  : "WORK_AND_PAY",
            );
          }}
          className="mt-2 h-10 w-full rounded-md border bg-background px-3"
          required
        >
          {eligibleVehicles.map((item) => <option key={item.id} value={item.id}>{item.plateNumber}</option>)}
        </select>
      </div>
      <div>
        <Label htmlFor="submissionType">Collection type</Label>
        <select
          id="submissionType"
          name="submissionType"
          value={availableType}
          onChange={(event) => setSubmissionType(event.target.value)}
          className="mt-2 h-10 w-full rounded-md border bg-background px-3"
          required
        >
          {typeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </div>
      {availableType === "WORK_AND_PAY" ? (
        <div className="md:col-span-2">
          <Label htmlFor="contractId">Active Work & Pay contract</Label>
          <select id="contractId" name="contractId" className="mt-2 h-10 w-full rounded-md border bg-background px-3" required>
            {vehicle?.contracts.map((contract) => (
              <option key={contract.id} value={contract.id}>
                {contract.name} ({currency} {Number(contract.weeklyAmount).toFixed(2)} weekly)
              </option>
            ))}
          </select>
        </div>
      ) : (
        <div className="rounded-lg border bg-muted/30 p-3 text-sm md:col-span-2">
          Required target: {currency} {Number(vehicle?.salesTargetAmount ?? 0).toFixed(2)} per {vehicle?.salesTargetPeriod === "DAILY" ? "day" : "week"}.
          You can still submit a short collection. Management will see the variance.
        </div>
      )}
      <div>
        <Label htmlFor="periodStart">{availableType === "DAILY_SALES" ? "Sales date" : "Week beginning"}</Label>
        <Input id="periodStart" name="periodStart" type="date" defaultValue={today} required />
      </div>
      <div>
        <Label htmlFor="amount">Amount collected</Label>
        <Input id="amount" name="amount" type="number" min="0.01" step="0.01" required />
      </div>
      <div>
        <Label htmlFor="paymentDate">Payment date</Label>
        <Input id="paymentDate" name="paymentDate" type="date" defaultValue={today} required />
      </div>
      <div>
        <Label htmlFor="paymentMethod">Payment method</Label>
        <Input id="paymentMethod" name="paymentMethod" placeholder="Cash, mobile money, or bank" required />
      </div>
      <div>
        <Label htmlFor="reference">Reference (optional)</Label>
        <Input id="reference" name="reference" />
      </div>
      <div>
        <Label htmlFor="notes">Notes (optional)</Label>
        <Textarea id="notes" name="notes" />
      </div>
      <Button className="md:col-span-2" type="submit">Submit for verification</Button>
    </form>
  );
}
