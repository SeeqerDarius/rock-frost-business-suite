import { useId, useMemo, useState, type FormEvent } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { useApp } from "@/state/AppProvider";
import { createSchoolAdapter } from "@/modules/school/adapter";
import type { SchoolSnapshot } from "@/modules/school/school-data";
import { Field, selectStyle, ErrorText, SyncBadge } from "@/components/form-fields";

export function SchoolEnrollmentScreen({ snapshot, onChanged }: { snapshot: SchoolSnapshot; onChanged: () => Promise<void> }) {
  const { db, device, recordActivity } = useApp();
  const campusId = useId();
  const yearId = useId();
  const studentId = useId();
  const classId = useId();
  const [campus, setCampus] = useState("");
  const [academicYear, setAcademicYear] = useState("");
  const [student, setStudent] = useState("");
  const [schoolClass, setSchoolClass] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Only already-synced students and classes have a real id the server
  // recognizes; either just created offline would fail the enrollment as
  // a not-found at sync time. Both are further narrowed to the selected
  // campus, matching enrollSchoolStudent's own campus-consistency check.
  const eligibleStudents = useMemo(
    () => snapshot.students.filter((s) => !s.hasPendingLocalChange && (!campus || s.data.campusId === campus)),
    [snapshot.students, campus],
  );
  const eligibleClasses = useMemo(
    () => snapshot.classes.filter((c) => !c.hasPendingLocalChange && (!campus || c.data.campusId === campus)),
    [snapshot.classes, campus],
  );

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!device) return;
    if (!campus || !academicYear || !student || !schoolClass) {
      setError("Select a campus, academic year, student, and class.");
      return;
    }
    setError(null);
    setSaving(true);
    recordActivity();
    try {
      await createSchoolAdapter({ db, organizationId: device.organizationId, actingUserName: device.userName }).enrollStudent(crypto.randomUUID(), {
        campusId: campus,
        academicYearId: academicYear,
        studentId: student,
        classId: schoolClass,
      });
      setStudent("");
      setSchoolClass("");
      await onChanged();
    } catch {
      setError("Could not queue this enrollment. Try again.");
    } finally {
      setSaving(false);
    }
  }

  const nameFor = (id: string, rows: SchoolSnapshot["students"] | SchoolSnapshot["classes"]) => {
    const row = rows.find((r) => r.entityId === id);
    return row ? ("firstName" in row.data ? `${row.data.firstName} ${row.data.lastName}` : row.data.name) : id.slice(0, 8);
  };

  return (
    <section aria-labelledby="school-enrollment-heading" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <h2 id="school-enrollment-heading" style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700 }}>
        Enrollment
      </h2>
      <Card>
        <form onSubmit={(e) => void handleSubmit(e)} noValidate style={{ display: "flex", gap: "0.6rem", alignItems: "end", flexWrap: "wrap" }}>
          <Field label="Campus" id={campusId}>
            <select
              id={campusId}
              value={campus}
              onChange={(e) => {
                setCampus(e.target.value);
                setStudent("");
                setSchoolClass("");
              }}
              style={{ ...selectStyle, width: "10rem" }}
            >
              <option value="">Select a campus</option>
              {snapshot.campuses.map((c) => (
                <option key={c.entityId} value={c.entityId}>
                  {c.data.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Academic year" id={yearId}>
            <select id={yearId} value={academicYear} onChange={(e) => setAcademicYear(e.target.value)} style={{ ...selectStyle, width: "10rem" }}>
              <option value="">Select a year</option>
              {snapshot.academicYears.map((y) => (
                <option key={y.entityId} value={y.entityId}>
                  {y.data.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Student" id={studentId}>
            <select id={studentId} value={student} onChange={(e) => setStudent(e.target.value)} style={{ ...selectStyle, width: "10rem" }} disabled={!campus}>
              <option value="">Select a student</option>
              {eligibleStudents.map((s) => (
                <option key={s.entityId} value={s.entityId}>
                  {s.data.firstName} {s.data.lastName}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Class" id={classId}>
            <select id={classId} value={schoolClass} onChange={(e) => setSchoolClass(e.target.value)} style={{ ...selectStyle, width: "10rem" }} disabled={!campus}>
              <option value="">Select a class</option>
              {eligibleClasses.map((c) => (
                <option key={c.entityId} value={c.entityId}>
                  {c.data.name}
                </option>
              ))}
            </select>
          </Field>
          <Button type="submit" variant="secondary" loading={saving} disabled={!campus || eligibleStudents.length === 0 || eligibleClasses.length === 0}>
            <Plus size={14} aria-hidden="true" />
            Enroll
          </Button>
        </form>
        {campus && (eligibleStudents.length === 0 || eligibleClasses.length === 0) ? (
          <p style={{ margin: "0.6rem 0 0", fontSize: "0.75rem", color: "var(--rf-muted-foreground)" }}>
            This campus needs at least one already-synced student and class. One just added offline needs to sync first.
          </p>
        ) : null}
        {error ? <div style={{ marginTop: "0.6rem" }}><ErrorText>{error}</ErrorText></div> : null}
      </Card>

      {snapshot.enrollments.length === 0 ? (
        <Card>
          <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--rf-muted-foreground)" }}>No active enrollments cached on this device yet.</p>
        </Card>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {snapshot.enrollments.map((enrollment) => (
            <li key={enrollment.entityId}>
              <Card style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem" }}>
                <p style={{ margin: 0, fontSize: "0.875rem", fontWeight: 600 }}>
                  {nameFor(enrollment.data.studentId, snapshot.students)} &middot; {nameFor(enrollment.data.classId, snapshot.classes)}
                </p>
                <SyncBadge pending={enrollment.hasPendingLocalChange} />
              </Card>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
