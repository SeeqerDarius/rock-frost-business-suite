import { useId, useState, type FormEvent } from "react";
import { Plus, Send } from "lucide-react";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { useApp } from "@/state/AppProvider";
import { createSchoolAdapter } from "@/modules/school/adapter";
import type { SchoolSnapshot } from "@/modules/school/school-data";
import { computeFeeInvoiceOutstanding } from "@/modules/school/fee-utils";
import { Field, inputStyle, selectStyle, ErrorText, SyncBadge, formatMoney } from "@/components/form-fields";

const PAYMENT_METHODS: { value: "CASH" | "CARD" | "MOBILE_MONEY" | "BANK_TRANSFER" | "ONLINE" | "OTHER"; label: string }[] = [
  { value: "CASH", label: "Cash" },
  { value: "CARD", label: "Card" },
  { value: "MOBILE_MONEY", label: "Mobile money" },
  { value: "BANK_TRANSFER", label: "Bank transfer" },
  { value: "ONLINE", label: "Online" },
  { value: "OTHER", label: "Other" },
];

export function SchoolFeesScreen({ snapshot, onChanged }: { snapshot: SchoolSnapshot; onChanged: () => Promise<void> }) {
  return (
    <section aria-labelledby="school-fees-heading" style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <h2 id="school-fees-heading" style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700 }}>
        Fees
      </h2>
      <FeeStructureSection snapshot={snapshot} onChanged={onChanged} />
      <FeeInvoiceSection snapshot={snapshot} onChanged={onChanged} />
    </section>
  );
}

function FeeStructureSection({ snapshot, onChanged }: { snapshot: SchoolSnapshot; onChanged: () => Promise<void> }) {
  const { db, device, recordActivity } = useApp();
  const campusId = useId();
  const yearId = useId();
  const nameId = useId();
  const amountId = useId();
  const [campus, setCampus] = useState("");
  const [academicYear, setAcademicYear] = useState("");
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [issuingId, setIssuingId] = useState<string | null>(null);
  const [justIssuedId, setJustIssuedId] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!device) return;
    if (!campus || !academicYear || !name.trim() || !/^\d{1,12}(\.\d{1,2})?$/.test(amount.trim())) {
      setError("Select a campus and academic year, enter a name, and a valid amount such as 500.00.");
      return;
    }
    setError(null);
    setSaving(true);
    recordActivity();
    try {
      await createSchoolAdapter({ db, organizationId: device.organizationId, actingUserName: device.userName }).createFeeStructure(crypto.randomUUID(), {
        campusId: campus,
        academicYearId: academicYear,
        name: name.trim(),
        amount: amount.trim(),
      });
      setName("");
      setAmount("");
      await onChanged();
    } catch {
      setError("Could not queue this fee structure. Try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleIssue(structureId: string) {
    if (!device) return;
    recordActivity();
    setIssuingId(structureId);
    try {
      await createSchoolAdapter({ db, organizationId: device.organizationId, actingUserName: device.userName }).issueFeeStructure(crypto.randomUUID(), {
        feeStructureId: structureId,
      });
      setJustIssuedId(structureId);
      await onChanged();
    } finally {
      setIssuingId(null);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
      <p style={{ margin: 0, fontSize: "0.875rem", fontWeight: 600 }}>Fee structures</p>
      <Card>
        <form onSubmit={(e) => void handleSubmit(e)} noValidate style={{ display: "flex", gap: "0.6rem", alignItems: "end", flexWrap: "wrap" }}>
          <Field label="Campus" id={campusId}>
            <select id={campusId} value={campus} onChange={(e) => setCampus(e.target.value)} style={{ ...selectStyle, width: "9rem" }}>
              <option value="">Select a campus</option>
              {snapshot.campuses.map((c) => (
                <option key={c.entityId} value={c.entityId}>
                  {c.data.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Academic year" id={yearId}>
            <select id={yearId} value={academicYear} onChange={(e) => setAcademicYear(e.target.value)} style={{ ...selectStyle, width: "9rem" }}>
              <option value="">Select a year</option>
              {snapshot.academicYears.map((y) => (
                <option key={y.entityId} value={y.entityId}>
                  {y.data.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Name" id={nameId} hint="e.g. Term 1 tuition">
            <input id={nameId} value={name} onChange={(e) => setName(e.target.value)} style={{ ...inputStyle, width: "10rem" }} />
          </Field>
          <Field label="Amount" id={amountId}>
            <input id={amountId} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} style={{ ...inputStyle, width: "7rem" }} placeholder="500.00" />
          </Field>
          <Button type="submit" variant="secondary" loading={saving}>
            <Plus size={14} aria-hidden="true" />
            Add structure
          </Button>
        </form>
        {error ? <div style={{ marginTop: "0.6rem" }}><ErrorText>{error}</ErrorText></div> : null}
      </Card>
      {snapshot.feeStructures.length === 0 ? (
        <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--rf-muted-foreground)" }}>No fee structures cached on this device yet.</p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {snapshot.feeStructures.map((structure) => (
            <li key={structure.entityId}>
              <Card style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
                <div style={{ minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: "0.875rem", fontWeight: 600 }}>{structure.data.name}</p>
                  <p style={{ margin: "0.1rem 0 0", fontSize: "0.75rem", color: "var(--rf-muted-foreground)" }}>GHS {formatMoney(structure.data.amount)}</p>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexShrink: 0 }}>
                  {justIssuedId === structure.entityId ? (
                    <span style={{ fontSize: "0.75rem", color: "var(--rf-primary)" }}>Issuance queued</span>
                  ) : null}
                  <SyncBadge pending={structure.hasPendingLocalChange} />
                  <Button
                    variant="secondary"
                    onClick={() => void handleIssue(structure.entityId)}
                    loading={issuingId === structure.entityId}
                    disabled={structure.hasPendingLocalChange}
                  >
                    <Send size={14} aria-hidden="true" />
                    Issue to eligible students
                  </Button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FeeInvoiceSection({ snapshot, onChanged }: { snapshot: SchoolSnapshot; onChanged: () => Promise<void> }) {
  const { db, device, recordActivity } = useApp();
  const yearId = useId();
  const studentId = useId();
  const descriptionId = useId();
  const amountId = useId();
  const [academicYear, setAcademicYear] = useState("");
  const [student, setStudent] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [justCreated, setJustCreated] = useState(false);

  const eligibleStudents = snapshot.students.filter((s) => !s.hasPendingLocalChange);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!device) return;
    if (!academicYear || !student || !description.trim() || !/^\d{1,12}(\.\d{1,2})?$/.test(amount.trim())) {
      setError("Select an academic year and student, enter a description, and a valid amount.");
      return;
    }
    setError(null);
    setSaving(true);
    recordActivity();
    try {
      await createSchoolAdapter({ db, organizationId: device.organizationId, actingUserName: device.userName }).createFeeInvoice(crypto.randomUUID(), {
        academicYearId: academicYear,
        studentId: student,
        description: description.trim(),
        amount: amount.trim(),
      });
      setDescription("");
      setAmount("");
      setJustCreated(true);
      await onChanged();
    } catch {
      setError("Could not queue this invoice. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
      <p style={{ margin: 0, fontSize: "0.875rem", fontWeight: 600 }}>Ad-hoc invoices</p>
      <Card>
        <form onSubmit={(e) => void handleSubmit(e)} noValidate style={{ display: "flex", gap: "0.6rem", alignItems: "end", flexWrap: "wrap" }}>
          <Field label="Academic year" id={yearId}>
            <select id={yearId} value={academicYear} onChange={(e) => setAcademicYear(e.target.value)} style={{ ...selectStyle, width: "9rem" }}>
              <option value="">Select a year</option>
              {snapshot.academicYears.map((y) => (
                <option key={y.entityId} value={y.entityId}>
                  {y.data.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Student" id={studentId}>
            <select id={studentId} value={student} onChange={(e) => setStudent(e.target.value)} style={{ ...selectStyle, width: "10rem" }}>
              <option value="">Select a student</option>
              {eligibleStudents.map((s) => (
                <option key={s.entityId} value={s.entityId}>
                  {s.data.firstName} {s.data.lastName}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Description" id={descriptionId}>
            <input id={descriptionId} value={description} onChange={(e) => setDescription(e.target.value)} style={{ ...inputStyle, width: "10rem" }} placeholder="Field trip fee" />
          </Field>
          <Field label="Amount" id={amountId}>
            <input id={amountId} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} style={{ ...inputStyle, width: "7rem" }} placeholder="50.00" />
          </Field>
          <Button type="submit" variant="secondary" loading={saving} disabled={eligibleStudents.length === 0}>
            <Plus size={14} aria-hidden="true" />
            Create invoice
          </Button>
        </form>
        {eligibleStudents.length === 0 ? <p style={{ margin: "0.6rem 0 0", fontSize: "0.75rem", color: "var(--rf-muted-foreground)" }}>Needs at least one already-synced student.</p> : null}
        {justCreated ? (
          <p style={{ margin: "0.6rem 0 0", fontSize: "0.75rem", color: "var(--rf-primary)" }}>
            Invoice queued. It will appear in the list below, and become payable, once it syncs.
          </p>
        ) : null}
        {error ? <div style={{ marginTop: "0.6rem" }}><ErrorText>{error}</ErrorText></div> : null}
      </Card>

      {snapshot.feeInvoices.length === 0 ? (
        <Card>
          <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--rf-muted-foreground)" }}>No invoices cached on this device yet.</p>
        </Card>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {snapshot.feeInvoices.map((invoice) => (
            <InvoiceRow key={invoice.entityId} entityId={invoice.entityId} data={invoice.data} hasPendingLocalChange={invoice.hasPendingLocalChange} onChanged={onChanged} />
          ))}
        </ul>
      )}
    </div>
  );
}

function InvoiceRow({
  entityId,
  data,
  hasPendingLocalChange,
  onChanged,
}: {
  entityId: string;
  data: SchoolSnapshot["feeInvoices"][number]["data"];
  hasPendingLocalChange: boolean;
  onChanged: () => Promise<void>;
}) {
  const { db, device, recordActivity } = useApp();
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [method, setMethod] = useState<(typeof PAYMENT_METHODS)[number]["value"]>("CASH");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const outstanding = computeFeeInvoiceOutstanding(data);
  const canPay = data.status !== "PAID" && data.status !== "VOID" && outstanding > 0;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!device) return;
    if (!/^\d{1,12}(\.\d{1,2})?$/.test(paymentAmount.trim())) {
      setError("Enter a valid amount such as 50.00.");
      return;
    }
    setError(null);
    setSaving(true);
    recordActivity();
    try {
      await createSchoolAdapter({ db, organizationId: device.organizationId, actingUserName: device.userName }).recordFeePayment(crypto.randomUUID(), {
        invoiceId: entityId,
        amount: paymentAmount.trim(),
        method,
      });
      setPaymentAmount("");
      setShowPaymentForm(false);
      await onChanged();
    } catch {
      setError("Could not queue this payment. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <li>
      <Card style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
          <div style={{ minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: "0.875rem", fontWeight: 600 }}>
              {data.invoiceNumber} &middot; {data.description}
            </p>
            <p style={{ margin: "0.1rem 0 0", fontSize: "0.75rem", color: "var(--rf-muted-foreground)" }}>
              {data.status} &middot; GHS {formatMoney(String(outstanding))} outstanding of GHS {formatMoney(data.amount)}
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexShrink: 0 }}>
            <SyncBadge pending={hasPendingLocalChange} />
            {canPay ? (
              <Button variant="secondary" onClick={() => setShowPaymentForm((v) => !v)}>
                Record payment
              </Button>
            ) : null}
          </div>
        </div>
        {showPaymentForm ? (
          <form onSubmit={(e) => void handleSubmit(e)} noValidate style={{ display: "flex", gap: "0.6rem", alignItems: "end", flexWrap: "wrap" }}>
            <Field label="Amount" id={`fee-payment-amount-${entityId}`}>
              <input
                id={`fee-payment-amount-${entityId}`}
                inputMode="decimal"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                style={{ ...inputStyle, width: "7rem" }}
                placeholder={formatMoney(String(outstanding))}
              />
            </Field>
            <Field label="Method" id={`fee-payment-method-${entityId}`}>
              <select id={`fee-payment-method-${entityId}`} value={method} onChange={(e) => setMethod(e.target.value as typeof method)} style={{ ...selectStyle, width: "9rem" }}>
                {PAYMENT_METHODS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </Field>
            <Button type="submit" loading={saving}>
              Record
            </Button>
            <Button type="button" variant="ghost" onClick={() => setShowPaymentForm(false)}>
              Cancel
            </Button>
          </form>
        ) : null}
        {error ? <ErrorText>{error}</ErrorText> : null}
      </Card>
    </li>
  );
}
