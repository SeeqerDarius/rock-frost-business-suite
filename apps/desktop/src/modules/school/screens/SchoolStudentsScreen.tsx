import { useId, useState, type FormEvent } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useApp } from "@/state/AppProvider";
import { createSchoolAdapter } from "@/modules/school/adapter";
import type { SchoolSnapshot, SchoolStudentRow } from "@/modules/school/school-data";
import type { SchoolStudentStatus } from "@/modules/school/types";
import { Field, ErrorText, SyncBadge } from "@/components/form-fields";

const STUDENT_TRANSITIONS: Record<SchoolStudentStatus, SchoolStudentStatus[]> = {
  APPLICANT: ["ACTIVE", "WITHDRAWN"],
  ACTIVE: ["SUSPENDED", "WITHDRAWN", "GRADUATED"],
  SUSPENDED: ["ACTIVE", "WITHDRAWN"],
  WITHDRAWN: [],
  GRADUATED: [],
};

const CHANGE_STATUS_PLACEHOLDER = "__change_status__";

export function SchoolStudentsScreen({ snapshot, onChanged }: { snapshot: SchoolSnapshot; onChanged: () => Promise<void> }) {
  return (
    <section aria-labelledby="school-students-heading" className="flex flex-col gap-6">
      <h2 id="school-students-heading" className="m-0 text-[1.05rem] font-bold">
        Students &amp; guardians
      </h2>
      <StudentSection snapshot={snapshot} onChanged={onChanged} />
      <GuardianSection snapshot={snapshot} onChanged={onChanged} />
      <GuardianLinkSection snapshot={snapshot} onChanged={onChanged} />
    </section>
  );
}

function StudentSection({ snapshot, onChanged }: { snapshot: SchoolSnapshot; onChanged: () => Promise<void> }) {
  const { db, device, recordActivity } = useApp();
  const campusId = useId();
  const firstId = useId();
  const lastId = useId();
  const [campus, setCampus] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [transitioningId, setTransitioningId] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!device) return;
    if (!campus || !firstName.trim() || !lastName.trim()) {
      setError("Select a campus and enter a first and last name.");
      return;
    }
    setError(null);
    setSaving(true);
    recordActivity();
    try {
      await createSchoolAdapter({ db, organizationId: device.organizationId, actingUserName: device.userName }).createStudent(crypto.randomUUID(), {
        campusId: campus,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
      });
      setFirstName("");
      setLastName("");
      await onChanged();
    } catch {
      setError("Could not queue this student. Try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleTransition(student: SchoolStudentRow, toStatus: SchoolStudentStatus) {
    if (!device) return;
    recordActivity();
    setTransitioningId(student.entityId);
    try {
      await createSchoolAdapter({ db, organizationId: device.organizationId, actingUserName: device.userName }).updateStudentStatus(
        student.entityId,
        { toStatus, reason: null },
        student.version,
      );
      await onChanged();
    } finally {
      setTransitioningId(null);
    }
  }

  return (
    <div className="flex flex-col gap-2.5">
      <p className="m-0 text-sm font-semibold">Students</p>
      <Card>
        <form onSubmit={(e) => void handleSubmit(e)} noValidate className="flex flex-wrap items-end gap-2.5">
          <Field label="Campus" id={campusId} className="w-40">
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
          <Field label="First name" id={firstId} className="w-36">
            <Input id={firstId} value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          </Field>
          <Field label="Last name" id={lastId} className="w-36">
            <Input id={lastId} value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </Field>
          <Button type="submit" variant="secondary" loading={saving} disabled={snapshot.campuses.length === 0}>
            <Plus size={14} aria-hidden="true" />
            Add student
          </Button>
        </form>
        {snapshot.campuses.length === 0 ? <p className="mt-2.5 mb-0 text-xs text-muted-foreground">Add a campus first.</p> : null}
        {error ? <div className="mt-2.5"><ErrorText>{error}</ErrorText></div> : null}
      </Card>

      {snapshot.students.length === 0 ? (
        <p className="m-0 text-[0.8125rem] text-muted-foreground">No students cached on this device yet.</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {snapshot.students.map((student) => {
            // A student still pending its own offline create has no real,
            // server-confirmed id yet - version stays 0 until the first
            // pull confirms it (see the adapter's docstring). Changing
            // status against that id would fail as ENTITY_DELETED at sync.
            const notYetSynced = student.hasPendingLocalChange && student.version === 0;
            const nextStatuses = STUDENT_TRANSITIONS[student.data.status];
            return (
              <li key={student.entityId}>
                <Card className="flex flex-wrap items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="m-0 text-sm font-semibold">
                      {student.data.firstName} {student.data.lastName}
                    </p>
                    <p className="mt-0.5 mb-0 text-xs text-muted-foreground">
                      {student.data.admissionNumber} &middot; {student.data.status}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2.5">
                    <SyncBadge pending={student.hasPendingLocalChange} />
                    {nextStatuses.length > 0 && !notYetSynced ? (
                      <Select
                        value={CHANGE_STATUS_PLACEHOLDER}
                        onValueChange={(value) => {
                          if (value && value !== CHANGE_STATUS_PLACEHOLDER) void handleTransition(student, value as SchoolStudentStatus);
                        }}
                      >
                        <SelectTrigger
                          size="sm"
                          aria-label={`Change status for ${student.data.firstName} ${student.data.lastName}`}
                          disabled={transitioningId === student.entityId}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={CHANGE_STATUS_PLACEHOLDER}>Change status</SelectItem>
                          {nextStatuses.map((status) => (
                            <SelectItem key={status} value={status}>
                              Move to {status.toLowerCase()}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : notYetSynced ? (
                      <span className="text-xs text-muted-foreground">Sync to change status</span>
                    ) : null}
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function GuardianSection({ snapshot, onChanged }: { snapshot: SchoolSnapshot; onChanged: () => Promise<void> }) {
  const { db, device, recordActivity } = useApp();
  const firstId = useId();
  const lastId = useId();
  const phoneId = useId();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!device) return;
    if (!firstName.trim() || !lastName.trim() || !phone.trim()) {
      setError("Enter a first name, last name, and phone number.");
      return;
    }
    setError(null);
    setSaving(true);
    recordActivity();
    try {
      await createSchoolAdapter({ db, organizationId: device.organizationId, actingUserName: device.userName }).createGuardian(crypto.randomUUID(), {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: null,
        phone: phone.trim(),
      });
      setFirstName("");
      setLastName("");
      setPhone("");
      await onChanged();
    } catch {
      setError("Could not queue this guardian. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-2.5">
      <p className="m-0 text-sm font-semibold">Guardians</p>
      <Card>
        <form onSubmit={(e) => void handleSubmit(e)} noValidate className="flex flex-wrap items-end gap-2.5">
          <Field label="First name" id={firstId} className="w-36">
            <Input id={firstId} value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          </Field>
          <Field label="Last name" id={lastId} className="w-36">
            <Input id={lastId} value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </Field>
          <Field label="Phone" id={phoneId} className="w-36">
            <Input id={phoneId} value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
          <Button type="submit" variant="secondary" loading={saving}>
            <Plus size={14} aria-hidden="true" />
            Add guardian
          </Button>
        </form>
        {error ? <div className="mt-2.5"><ErrorText>{error}</ErrorText></div> : null}
      </Card>
      {snapshot.guardians.length === 0 ? (
        <p className="m-0 text-[0.8125rem] text-muted-foreground">No guardians cached on this device yet.</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {snapshot.guardians.map((guardian) => (
            <li key={guardian.entityId}>
              <Card className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="m-0 text-sm font-semibold">
                    {guardian.data.firstName} {guardian.data.lastName}
                  </p>
                  <p className="mt-0.5 mb-0 text-xs text-muted-foreground">{guardian.data.phone}</p>
                </div>
                <SyncBadge pending={guardian.hasPendingLocalChange} />
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function GuardianLinkSection({ snapshot, onChanged }: { snapshot: SchoolSnapshot; onChanged: () => Promise<void> }) {
  const { db, device, recordActivity } = useApp();
  const studentId = useId();
  const guardianId = useId();
  const relationshipId = useId();
  const primaryId = useId();
  const [student, setStudent] = useState("");
  const [guardian, setGuardian] = useState("");
  const [relationship, setRelationship] = useState("");
  const [primary, setPrimary] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Only already-synced students/guardians have a real id the server can
  // link against; one still pending its own offline create would fail the
  // link at sync time (see StudentSection's notYetSynced comment above).
  const eligibleStudents = snapshot.students.filter((s) => !s.hasPendingLocalChange);
  const eligibleGuardians = snapshot.guardians.filter((g) => !g.hasPendingLocalChange);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!device) return;
    if (!student || !guardian || !relationship.trim()) {
      setError("Select a student, a guardian, and enter the relationship.");
      return;
    }
    setError(null);
    setSaving(true);
    recordActivity();
    try {
      await createSchoolAdapter({ db, organizationId: device.organizationId, actingUserName: device.userName }).linkGuardian(crypto.randomUUID(), {
        studentId: student,
        guardianId: guardian,
        relationship: relationship.trim(),
        primary,
      });
      setRelationship("");
      setPrimary(false);
      await onChanged();
    } catch {
      setError("Could not queue this link. Try again.");
    } finally {
      setSaving(false);
    }
  }

  const nameFor = (id: string, rows: SchoolSnapshot["students"] | SchoolSnapshot["guardians"]) => {
    const row = rows.find((r) => r.entityId === id);
    return row ? `${row.data.firstName} ${row.data.lastName}` : id.slice(0, 8);
  };

  return (
    <div className="flex flex-col gap-2.5">
      <p className="m-0 text-sm font-semibold">Guardian links</p>
      <Card>
        <form onSubmit={(e) => void handleSubmit(e)} noValidate className="flex flex-wrap items-end gap-2.5">
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
          <Field label="Guardian" id={guardianId} className="w-40">
            <Select value={guardian} onValueChange={(value) => setGuardian(value ?? "")}>
              <SelectTrigger id={guardianId} className="w-full">
                <SelectValue placeholder="Select a guardian" />
              </SelectTrigger>
              <SelectContent>
                {eligibleGuardians.map((g) => (
                  <SelectItem key={g.entityId} value={g.entityId}>
                    {g.data.firstName} {g.data.lastName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Relationship" id={relationshipId} className="w-32">
            <Input id={relationshipId} value={relationship} onChange={(e) => setRelationship(e.target.value)} placeholder="Mother" />
          </Field>
          <label htmlFor={primaryId} className="flex items-center gap-1.5 pb-2.5 text-[0.8125rem]">
            <Checkbox id={primaryId} checked={primary} onCheckedChange={(checked) => setPrimary(checked === true)} />
            Primary contact
          </label>
          <Button type="submit" variant="secondary" loading={saving} disabled={eligibleStudents.length === 0 || eligibleGuardians.length === 0}>
            <Plus size={14} aria-hidden="true" />
            Link
          </Button>
        </form>
        {eligibleStudents.length === 0 || eligibleGuardians.length === 0 ? (
          <p className="mt-2.5 mb-0 text-xs text-muted-foreground">
            Needs at least one already-synced student and guardian. A student or guardian just added offline needs to sync first.
          </p>
        ) : null}
        {error ? <div className="mt-2.5"><ErrorText>{error}</ErrorText></div> : null}
      </Card>
      {snapshot.guardianLinks.length === 0 ? (
        <p className="m-0 text-[0.8125rem] text-muted-foreground">No guardian links cached on this device yet.</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {snapshot.guardianLinks.map((link) => (
            <li key={link.entityId}>
              <Card className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="m-0 text-sm font-semibold">
                    {nameFor(link.data.studentId, snapshot.students)} &middot; {nameFor(link.data.guardianId, snapshot.guardians)}
                  </p>
                  <p className="mt-0.5 mb-0 text-xs text-muted-foreground">
                    {link.data.relationship} {link.data.primary ? <span className="text-primary">&middot; Primary</span> : null}
                  </p>
                </div>
                <SyncBadge pending={link.hasPendingLocalChange} />
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
