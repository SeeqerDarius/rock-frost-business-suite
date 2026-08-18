import { useId, useState, type FormEvent } from "react";
import { Plus, Send } from "lucide-react";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useApp } from "@/state/AppProvider";
import { createSchoolAdapter } from "@/modules/school/adapter";
import type { SchoolSnapshot } from "@/modules/school/school-data";
import { computeFeeInvoiceOutstanding } from "@/modules/school/fee-utils";
import { Field, ErrorText, SyncBadge, formatMoney } from "@/components/form-fields";

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
    <section aria-labelledby="school-fees-heading" className="flex flex-col gap-6">
      <h2 id="school-fees-heading" className="m-0 text-[1.05rem] font-bold">
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
    <div className="flex flex-col gap-2.5">
      <p className="m-0 text-sm font-semibold">Fee structures</p>
      <Card>
        <form onSubmit={(e) => void handleSubmit(e)} noValidate className="flex flex-wrap items-end gap-2.5">
          <Field label="Campus" id={campusId} className="w-36">
            <Select value={campus} onValueChange={(value) => setCampus(value ?? "")}>
              <SelectTrigger id={campusId} className="w-full">
                <SelectValue placeholder="Select a campus" />
              </SelectTrigger>
              <SelectContent>
                {snapshot.campuses.map((c) => (
                  <SelectItem key={c.entityId} value={c.entityId}>
                    {c.data.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Academic year" id={yearId} className="w-36">
            <Select value={academicYear} onValueChange={(value) => setAcademicYear(value ?? "")}>
              <SelectTrigger id={yearId} className="w-full">
                <SelectValue placeholder="Select a year" />
              </SelectTrigger>
              <SelectContent>
                {snapshot.academicYears.map((y) => (
                  <SelectItem key={y.entityId} value={y.entityId}>
                    {y.data.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Name" id={nameId} hint="e.g. Term 1 tuition" className="w-40">
            <Input id={nameId} value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Amount" id={amountId} className="w-28">
            <Input id={amountId} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="500.00" />
          </Field>
          <Button type="submit" variant="secondary" loading={saving}>
            <Plus size={14} aria-hidden="true" />
            Add structure
          </Button>
        </form>
        {error ? <div className="mt-2.5"><ErrorText>{error}</ErrorText></div> : null}
      </Card>
      {snapshot.feeStructures.length === 0 ? (
        <p className="m-0 text-[0.8125rem] text-muted-foreground">No fee structures cached on this device yet.</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {snapshot.feeStructures.map((structure) => (
            <li key={structure.entityId}>
              <Card className="flex flex-wrap items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="m-0 text-sm font-semibold">{structure.data.name}</p>
                  <p className="mt-0.5 mb-0 text-xs text-muted-foreground">GHS {formatMoney(structure.data.amount)}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2.5">
                  {justIssuedId === structure.entityId ? (
                    <span className="text-xs text-primary">Issuance queued</span>
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
    <div className="flex flex-col gap-2.5">
      <p className="m-0 text-sm font-semibold">Ad-hoc invoices</p>
      <Card>
        <form onSubmit={(e) => void handleSubmit(e)} noValidate className="flex flex-wrap items-end gap-2.5">
          <Field label="Academic year" id={yearId} className="w-36">
            <Select value={academicYear} onValueChange={(value) => setAcademicYear(value ?? "")}>
              <SelectTrigger id={yearId} className="w-full">
                <SelectValue placeholder="Select a year" />
              </SelectTrigger>
              <SelectContent>
                {snapshot.academicYears.map((y) => (
                  <SelectItem key={y.entityId} value={y.entityId}>
                    {y.data.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Student" id={studentId} className="w-40">
            <Select value={student} onValueChange={(value) => setStudent(value ?? "")}>
              <SelectTrigger id={studentId} className="w-full">
                <SelectValue placeholder="Select a student" />
              </SelectTrigger>
              <SelectContent>
                {eligibleStudents.map((s) => (
                  <SelectItem key={s.entityId} value={s.entityId}>
                    {s.data.firstName} {s.data.lastName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Description" id={descriptionId} className="w-40">
            <Input id={descriptionId} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Field trip fee" />
          </Field>
          <Field label="Amount" id={amountId} className="w-28">
            <Input id={amountId} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="50.00" />
          </Field>
          <Button type="submit" variant="secondary" loading={saving} disabled={eligibleStudents.length === 0}>
            <Plus size={14} aria-hidden="true" />
            Create invoice
          </Button>
        </form>
        {eligibleStudents.length === 0 ? <p className="mt-2.5 mb-0 text-xs text-muted-foreground">Needs at least one already-synced student.</p> : null}
        {justCreated ? (
          <p className="mt-2.5 mb-0 text-xs text-primary">
            Invoice queued. It will appear in the list below, and become payable, once it syncs.
          </p>
        ) : null}
        {error ? <div className="mt-2.5"><ErrorText>{error}</ErrorText></div> : null}
      </Card>

      {snapshot.feeInvoices.length === 0 ? (
        <Card>
          <p className="m-0 text-sm text-muted-foreground">No invoices cached on this device yet.</p>
        </Card>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
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
      <Card className="flex flex-col gap-2.5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="m-0 text-sm font-semibold">
              {data.invoiceNumber} &middot; {data.description}
            </p>
            <p className="mt-0.5 mb-0 text-xs text-muted-foreground">
              {data.status} &middot; GHS {formatMoney(String(outstanding))} outstanding of GHS {formatMoney(data.amount)}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2.5">
            <SyncBadge pending={hasPendingLocalChange} />
            {canPay ? (
              <Button variant="secondary" onClick={() => setShowPaymentForm((v) => !v)}>
                Record payment
              </Button>
            ) : null}
          </div>
        </div>
        {showPaymentForm ? (
          <form onSubmit={(e) => void handleSubmit(e)} noValidate className="flex flex-wrap items-end gap-2.5">
            <Field label="Amount" id={`fee-payment-amount-${entityId}`} className="w-28">
              <Input
                id={`fee-payment-amount-${entityId}`}
                inputMode="decimal"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                placeholder={formatMoney(String(outstanding))}
              />
            </Field>
            <Field label="Method" id={`fee-payment-method-${entityId}`} className="w-36">
              <Select value={method} onValueChange={(value) => setMethod(value as typeof method)}>
                <SelectTrigger id={`fee-payment-method-${entityId}`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
