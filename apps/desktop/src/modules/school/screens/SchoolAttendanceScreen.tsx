import { useId, useMemo, useState, type FormEvent } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { useApp } from "@/state/AppProvider";
import { createSchoolAdapter } from "@/modules/school/adapter";
import type { SchoolSnapshot } from "@/modules/school/school-data";
import { Field, inputStyle, selectStyle, ErrorText, SyncBadge, formatRelativeTime } from "@/components/form-fields";

const STATUS_OPTIONS: { value: "PRESENT" | "ABSENT" | "LATE" | "EXCUSED"; label: string }[] = [
  { value: "PRESENT", label: "Present" },
  { value: "ABSENT", label: "Absent" },
  { value: "LATE", label: "Late" },
  { value: "EXCUSED", label: "Excused" },
];

export function SchoolAttendanceScreen({ snapshot, onChanged }: { snapshot: SchoolSnapshot; onChanged: () => Promise<void> }) {
  const { db, device, recordActivity } = useApp();
  const termId = useId();
  const classId = useId();
  const studentId = useId();
  const dateId = useId();
  const [term, setTerm] = useState("");
  const [schoolClass, setSchoolClass] = useState("");
  const [student, setStudent] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [status, setStatus] = useState<"PRESENT" | "ABSENT" | "LATE" | "EXCUSED">("PRESENT");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // A student must have an active enrollment in the selected class -
  // matching recordSchoolAttendance's own requirement - and must already
  // be synced (real id) for the same reason enrollment/guardian-linking
  // require it (see SchoolStudentsScreen's notYetSynced comment).
  const eligibleStudents = useMemo(() => {
    if (!schoolClass) return [];
    const enrolledIds = new Set(snapshot.enrollments.filter((e) => e.data.classId === schoolClass).map((e) => e.data.studentId));
    return snapshot.students.filter((s) => !s.hasPendingLocalChange && enrolledIds.has(s.entityId));
  }, [snapshot.enrollments, snapshot.students, schoolClass]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!device) return;
    if (!term || !schoolClass || !student || !date) {
      setError("Select a term, class, student, and date.");
      return;
    }
    setError(null);
    setSaving(true);
    recordActivity();
    try {
      await createSchoolAdapter({ db, organizationId: device.organizationId, actingUserName: device.userName }).recordAttendance(crypto.randomUUID(), {
        termId: term,
        classId: schoolClass,
        studentId: student,
        date,
        status,
      });
      setStudent("");
      await onChanged();
    } catch {
      setError("Could not queue this attendance record. Try again.");
    } finally {
      setSaving(false);
    }
  }

  const nameFor = (id: string) => {
    const row = snapshot.students.find((r) => r.entityId === id);
    return row ? `${row.data.firstName} ${row.data.lastName}` : id.slice(0, 8);
  };

  return (
    <section aria-labelledby="school-attendance-heading" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <h2 id="school-attendance-heading" style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700 }}>
        Attendance
      </h2>
      <Card>
        <form onSubmit={(e) => void handleSubmit(e)} noValidate style={{ display: "flex", gap: "0.6rem", alignItems: "end", flexWrap: "wrap" }}>
          <Field label="Term" id={termId}>
            <select id={termId} value={term} onChange={(e) => setTerm(e.target.value)} style={{ ...selectStyle, width: "9rem" }}>
              <option value="">Select a term</option>
              {snapshot.terms.map((t) => (
                <option key={t.entityId} value={t.entityId}>
                  {t.data.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Class" id={classId}>
            <select
              id={classId}
              value={schoolClass}
              onChange={(e) => {
                setSchoolClass(e.target.value);
                setStudent("");
              }}
              style={{ ...selectStyle, width: "9rem" }}
            >
              <option value="">Select a class</option>
              {snapshot.classes.map((c) => (
                <option key={c.entityId} value={c.entityId}>
                  {c.data.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Student" id={studentId}>
            <select id={studentId} value={student} onChange={(e) => setStudent(e.target.value)} style={{ ...selectStyle, width: "9rem" }} disabled={!schoolClass}>
              <option value="">Select a student</option>
              {eligibleStudents.map((s) => (
                <option key={s.entityId} value={s.entityId}>
                  {s.data.firstName} {s.data.lastName}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Date" id={dateId}>
            <input id={dateId} type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inputStyle} />
          </Field>
          <Field label="Status" id="school-attendance-status">
            <select id="school-attendance-status" value={status} onChange={(e) => setStatus(e.target.value as typeof status)} style={{ ...selectStyle, width: "8rem" }}>
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
          <Button type="submit" variant="secondary" loading={saving} disabled={!schoolClass || eligibleStudents.length === 0}>
            <Plus size={14} aria-hidden="true" />
            Record
          </Button>
        </form>
        {schoolClass && eligibleStudents.length === 0 ? (
          <p style={{ margin: "0.6rem 0 0", fontSize: "0.75rem", color: "var(--rf-muted-foreground)" }}>
            No already-synced, actively enrolled student for this class yet.
          </p>
        ) : null}
        {error ? <div style={{ marginTop: "0.6rem" }}><ErrorText>{error}</ErrorText></div> : null}
      </Card>

      {snapshot.attendance.length === 0 ? (
        <Card>
          <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--rf-muted-foreground)" }}>No attendance records cached on this device yet.</p>
        </Card>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {snapshot.attendance.slice(0, 100).map((record) => (
            <li key={record.entityId}>
              <Card style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem" }}>
                <div style={{ minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: "0.875rem", fontWeight: 600 }}>
                    {nameFor(record.data.studentId)} &middot; {record.data.status}
                  </p>
                  <p style={{ margin: "0.1rem 0 0", fontSize: "0.75rem", color: "var(--rf-muted-foreground)" }}>
                    {new Date(record.data.date).toLocaleDateString()} &middot; recorded {formatRelativeTime(record.data.date)}
                  </p>
                </div>
                <SyncBadge pending={record.hasPendingLocalChange} />
              </Card>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
