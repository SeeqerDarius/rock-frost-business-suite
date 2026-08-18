import { useId, useState, type FormEvent } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { useApp } from "@/state/AppProvider";
import { createSchoolAdapter } from "@/modules/school/adapter";
import type { SchoolSnapshot } from "@/modules/school/school-data";
import { Field, inputStyle, ErrorText, SyncBadge, formatMoney } from "@/components/form-fields";

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
    <section aria-labelledby="school-payroll-heading" style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <h2 id="school-payroll-heading" style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700 }}>
        Payroll adjustments
      </h2>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
        <Card>
          <form onSubmit={(e) => void handleSubmit(e)} noValidate style={{ display: "flex", gap: "0.6rem", alignItems: "end", flexWrap: "wrap" }}>
            <Field label="Employee ID" id={employeeId}>
              <input id={employeeId} value={employee} onChange={(e) => setEmployee(e.target.value)} style={{ ...inputStyle, width: "9rem" }} />
            </Field>
            <Field label="Period" id={periodId} hint="e.g. 2026-08">
              <input id={periodId} value={period} onChange={(e) => setPeriod(e.target.value)} style={{ ...inputStyle, width: "7rem" }} />
            </Field>
            <Field label="Type" id={typeId} hint="e.g. bonus">
              <input id={typeId} value={type} onChange={(e) => setType(e.target.value)} style={{ ...inputStyle, width: "7rem" }} />
            </Field>
            <Field label="Description" id={descriptionId}>
              <input id={descriptionId} value={description} onChange={(e) => setDescription(e.target.value)} style={{ ...inputStyle, width: "12rem" }} />
            </Field>
            <Field label="Amount" id={amountId}>
              <input id={amountId} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} style={{ ...inputStyle, width: "6rem" }} />
            </Field>
            <Button type="submit" variant="secondary" loading={saving}>
              <Plus size={14} aria-hidden="true" />
              Add adjustment
            </Button>
          </form>
          {error ? <div style={{ marginTop: "0.6rem" }}><ErrorText>{error}</ErrorText></div> : null}
        </Card>

        {snapshot.payrollAdjustments.length === 0 ? (
          <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--rf-muted-foreground)" }}>No payroll adjustments cached on this device yet.</p>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {snapshot.payrollAdjustments.map((adjustment) => (
              <li key={adjustment.entityId}>
                <Card style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: "0.875rem", fontWeight: 600 }}>
                      {adjustment.data.employeeId} &middot; {adjustment.data.type}
                    </p>
                    <p style={{ margin: "0.1rem 0 0", fontSize: "0.75rem", color: "var(--rf-muted-foreground)" }}>
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
