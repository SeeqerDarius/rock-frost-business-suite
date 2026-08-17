import { useId, useState, type FormEvent } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { useApp } from "@/state/AppProvider";
import { createSchoolAdapter } from "@/modules/school/adapter";
import type { SchoolSnapshot, SchoolStudentRow } from "@/modules/school/school-data";
import type { SchoolStudentStatus } from "@/modules/school/types";
import { Field, inputStyle, selectStyle, ErrorText, SyncBadge } from "@/components/form-fields";

const STUDENT_TRANSITIONS: Record<SchoolStudentStatus, SchoolStudentStatus[]> = {
  APPLICANT: ["ACTIVE", "WITHDRAWN"],
  ACTIVE: ["SUSPENDED", "WITHDRAWN", "GRADUATED"],
  SUSPENDED: ["ACTIVE", "WITHDRAWN"],
  WITHDRAWN: [],
  GRADUATED: [],
};

export function SchoolStudentsScreen({ snapshot, onChanged }: { snapshot: SchoolSnapshot; onChanged: () => Promise<void> }) {
  return (
    <section aria-labelledby="school-students-heading" style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <h2 id="school-students-heading" style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700 }}>
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
    <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
      <p style={{ margin: 0, fontSize: "0.875rem", fontWeight: 600 }}>Students</p>
      <Card>
        <form onSubmit={(e) => void handleSubmit(e)} noValidate style={{ display: "flex", gap: "0.6rem", alignItems: "end", flexWrap: "wrap" }}>
          <Field label="Campus" id={campusId}>
            <select id={campusId} value={campus} onChange={(e) => setCampus(e.target.value)} style={{ ...selectStyle, width: "10rem" }}>
              <option value="">Select a campus</option>
              {snapshot.campuses.map((c) => (
                <option key={c.entityId} value={c.entityId}>
                  {c.data.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="First name" id={firstId}>
            <input id={firstId} value={firstName} onChange={(e) => setFirstName(e.target.value)} style={{ ...inputStyle, width: "9rem" }} />
          </Field>
          <Field label="Last name" id={lastId}>
            <input id={lastId} value={lastName} onChange={(e) => setLastName(e.target.value)} style={{ ...inputStyle, width: "9rem" }} />
          </Field>
          <Button type="submit" variant="secondary" loading={saving} disabled={snapshot.campuses.length === 0}>
            <Plus size={14} aria-hidden="true" />
            Add student
          </Button>
        </form>
        {snapshot.campuses.length === 0 ? <p style={{ margin: "0.6rem 0 0", fontSize: "0.75rem", color: "var(--rf-muted-foreground)" }}>Add a campus first.</p> : null}
        {error ? <div style={{ marginTop: "0.6rem" }}><ErrorText>{error}</ErrorText></div> : null}
      </Card>

      {snapshot.students.length === 0 ? (
        <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--rf-muted-foreground)" }}>No students cached on this device yet.</p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {snapshot.students.map((student) => {
            // A student still pending its own offline create has no real,
            // server-confirmed id yet - version stays 0 until the first
            // pull confirms it (see the adapter's docstring). Changing
            // status against that id would fail as ENTITY_DELETED at sync.
            const notYetSynced = student.hasPendingLocalChange && student.version === 0;
            const nextStatuses = STUDENT_TRANSITIONS[student.data.status];
            return (
              <li key={student.entityId}>
                <Card style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: "0.875rem", fontWeight: 600 }}>
                      {student.data.firstName} {student.data.lastName}
                    </p>
                    <p style={{ margin: "0.1rem 0 0", fontSize: "0.75rem", color: "var(--rf-muted-foreground)" }}>
                      {student.data.admissionNumber} &middot; {student.data.status}
                    </p>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexShrink: 0 }}>
                    <SyncBadge pending={student.hasPendingLocalChange} />
                    {nextStatuses.length > 0 && !notYetSynced ? (
                      <select
                        aria-label={`Change status for ${student.data.firstName} ${student.data.lastName}`}
                        disabled={transitioningId === student.entityId}
                        value=""
                        onChange={(e) => {
                          const toStatus = e.target.value as SchoolStudentStatus;
                          if (toStatus) void handleTransition(student, toStatus);
                        }}
                        style={{ ...selectStyle, width: "auto", padding: "0.4rem 0.6rem", fontSize: "0.8125rem" }}
                      >
                        <option value="">Change status</option>
                        {nextStatuses.map((status) => (
                          <option key={status} value={status}>
                            Move to {status.toLowerCase()}
                          </option>
                        ))}
                      </select>
                    ) : notYetSynced ? (
                      <span style={{ fontSize: "0.75rem", color: "var(--rf-muted-foreground)" }}>Sync to change status</span>
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
    <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
      <p style={{ margin: 0, fontSize: "0.875rem", fontWeight: 600 }}>Guardians</p>
      <Card>
        <form onSubmit={(e) => void handleSubmit(e)} noValidate style={{ display: "flex", gap: "0.6rem", alignItems: "end", flexWrap: "wrap" }}>
          <Field label="First name" id={firstId}>
            <input id={firstId} value={firstName} onChange={(e) => setFirstName(e.target.value)} style={{ ...inputStyle, width: "9rem" }} />
          </Field>
          <Field label="Last name" id={lastId}>
            <input id={lastId} value={lastName} onChange={(e) => setLastName(e.target.value)} style={{ ...inputStyle, width: "9rem" }} />
          </Field>
          <Field label="Phone" id={phoneId}>
            <input id={phoneId} value={phone} onChange={(e) => setPhone(e.target.value)} style={{ ...inputStyle, width: "9rem" }} />
          </Field>
          <Button type="submit" variant="secondary" loading={saving}>
            <Plus size={14} aria-hidden="true" />
            Add guardian
          </Button>
        </form>
        {error ? <div style={{ marginTop: "0.6rem" }}><ErrorText>{error}</ErrorText></div> : null}
      </Card>
      {snapshot.guardians.length === 0 ? (
        <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--rf-muted-foreground)" }}>No guardians cached on this device yet.</p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {snapshot.guardians.map((guardian) => (
            <li key={guardian.entityId}>
              <Card style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem" }}>
                <div style={{ minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: "0.875rem", fontWeight: 600 }}>
                    {guardian.data.firstName} {guardian.data.lastName}
                  </p>
                  <p style={{ margin: "0.1rem 0 0", fontSize: "0.75rem", color: "var(--rf-muted-foreground)" }}>{guardian.data.phone}</p>
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
    <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
      <p style={{ margin: 0, fontSize: "0.875rem", fontWeight: 600 }}>Guardian links</p>
      <Card>
        <form onSubmit={(e) => void handleSubmit(e)} noValidate style={{ display: "flex", gap: "0.6rem", alignItems: "end", flexWrap: "wrap" }}>
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
          <Field label="Guardian" id={guardianId}>
            <select id={guardianId} value={guardian} onChange={(e) => setGuardian(e.target.value)} style={{ ...selectStyle, width: "10rem" }}>
              <option value="">Select a guardian</option>
              {eligibleGuardians.map((g) => (
                <option key={g.entityId} value={g.entityId}>
                  {g.data.firstName} {g.data.lastName}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Relationship" id={relationshipId}>
            <input id={relationshipId} value={relationship} onChange={(e) => setRelationship(e.target.value)} style={{ ...inputStyle, width: "8rem" }} placeholder="Mother" />
          </Field>
          <label htmlFor={primaryId} style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.8125rem", paddingBottom: "0.6rem" }}>
            <input id={primaryId} type="checkbox" checked={primary} onChange={(e) => setPrimary(e.target.checked)} />
            Primary contact
          </label>
          <Button type="submit" variant="secondary" loading={saving} disabled={eligibleStudents.length === 0 || eligibleGuardians.length === 0}>
            <Plus size={14} aria-hidden="true" />
            Link
          </Button>
        </form>
        {eligibleStudents.length === 0 || eligibleGuardians.length === 0 ? (
          <p style={{ margin: "0.6rem 0 0", fontSize: "0.75rem", color: "var(--rf-muted-foreground)" }}>
            Needs at least one already-synced student and guardian. A student or guardian just added offline needs to sync first.
          </p>
        ) : null}
        {error ? <div style={{ marginTop: "0.6rem" }}><ErrorText>{error}</ErrorText></div> : null}
      </Card>
      {snapshot.guardianLinks.length === 0 ? (
        <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--rf-muted-foreground)" }}>No guardian links cached on this device yet.</p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {snapshot.guardianLinks.map((link) => (
            <li key={link.entityId}>
              <Card style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem" }}>
                <div style={{ minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: "0.875rem", fontWeight: 600 }}>
                    {nameFor(link.data.studentId, snapshot.students)} &middot; {nameFor(link.data.guardianId, snapshot.guardians)}
                  </p>
                  <p style={{ margin: "0.1rem 0 0", fontSize: "0.75rem", color: "var(--rf-muted-foreground)" }}>
                    {link.data.relationship} {link.data.primary ? <span style={{ color: "var(--rf-primary)" }}>&middot; Primary</span> : null}
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
