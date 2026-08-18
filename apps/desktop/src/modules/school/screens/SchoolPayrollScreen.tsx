import { useId, useState, type FormEvent } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Input } from "@/components/ui/input";
import { useApp } from "@/state/AppProvider";
import { createSchoolAdapter } from "@/modules/school/adapter";
import type { SchoolSnapshot } from "@/modules/school/school-data";
import { Field, ErrorText, SyncBadge, formatMoney } from "@/components/form-fields";

export function SchoolPayrollScreen({ snapshot, onChanged }: { snapshot: SchoolSnapshot; onChanged: () => Promise<void> }) {
  const { db, device, recordActivity } = useApp();
  const employeeId = useId();
  const periodId = useId();
  const typeId = useId();
  const descriptionId = useId();
  const amountId = useId();
  const [employee, setEmployee] = useState("");
  const [period, setPeriod] = useState("");
  const [type, setType] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!device) return;
    if (!employee.trim() || !period.trim() || !type.trim() || !description.trim() || !/^\d{1,12}(\.\d{1,2})?$/.test(amount.trim()) || Number(amount) <= 0) {
      setError("Enter an employee, period, type, description, and a positive amount.");
      return;
    }
    setError(null);
    setSaving(true);
    recordActivity();
    try {
      await createSchoolAdapter({ db, organizationId: device.organizationId, actingUserName: device.userName }).createPayrollAdjustment(crypto.randomUUID(), {
        employeeId: employee.trim(),
        period: period.trim(),
        type: type.trim(),
        description: description.trim(),
        amount: amount.trim(),
      });
      setEmployee("");
      setPeriod("");
      setType("");
      setDescription("");
      setAmount("");
      await onChanged();
    } catch {
      setError("Could not queue this adjustment. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section aria-labelledby="school-payroll-heading" className="flex flex-col gap-6">
      <h2 id="school-payroll-heading" className="m-0 text-[1.05rem] font-bold">
        Payroll adjustments
      </h2>
      <div className="flex flex-col gap-2.5">
        <Card>
          <form onSubmit={(e) => void handleSubmit(e)} noValidate className="flex flex-wrap items-end gap-2.5">
            <Field label="Employee ID" id={employeeId} className="w-36">
              <Input id={employeeId} value={employee} onChange={(e) => setEmployee(e.target.value)} />
            </Field>
            <Field label="Period" id={periodId} hint="e.g. 2026-08" className="w-28">
              <Input id={periodId} value={period} onChange={(e) => setPeriod(e.target.value)} />
            </Field>
            <Field label="Type" id={typeId} hint="e.g. bonus" className="w-28">
              <Input id={typeId} value={type} onChange={(e) => setType(e.target.value)} />
            </Field>
            <Field label="Description" id={descriptionId} className="w-48">
              <Input id={descriptionId} value={description} onChange={(e) => setDescription(e.target.value)} />
            </Field>
            <Field label="Amount" id={amountId} className="w-24">
              <Input id={amountId} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </Field>
            <Button type="submit" variant="secondary" loading={saving}>
              <Plus size={14} aria-hidden="true" />
              Add adjustment
            </Button>
          </form>
          {error ? <div className="mt-2.5"><ErrorText>{error}</ErrorText></div> : null}
        </Card>

        {snapshot.payrollAdjustments.length === 0 ? (
          <p className="m-0 text-[0.8125rem] text-muted-foreground">No payroll adjustments cached on this device yet.</p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {snapshot.payrollAdjustments.map((adjustment) => (
              <li key={adjustment.entityId}>
                <Card className="flex flex-wrap items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="m-0 text-sm font-semibold">
                      {adjustment.data.employeeId} &middot; {adjustment.data.type}
                    </p>
                    <p className="mt-0.5 mb-0 text-xs text-muted-foreground">
                      {adjustment.data.period} &middot; {adjustment.data.description} &middot; {formatMoney(adjustment.data.amount)}
                    </p>
                  </div>
                  <SyncBadge pending={adjustment.hasPendingLocalChange} />
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
