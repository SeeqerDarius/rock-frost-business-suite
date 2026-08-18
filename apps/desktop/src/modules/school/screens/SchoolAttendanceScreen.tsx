import { useId, useMemo, useState, type FormEvent } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useApp } from "@/state/AppProvider";
import { createSchoolAdapter } from "@/modules/school/adapter";
import type { SchoolSnapshot } from "@/modules/school/school-data";
import { Field, ErrorText, SyncBadge, formatRelativeTime } from "@/components/form-fields";

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
  const statusId = useId();
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
    <section aria-labelledby="school-attendance-heading" className="flex flex-col gap-4">
      <h2 id="school-attendance-heading" className="m-0 text-[1.05rem] font-bold">
        Attendance
      </h2>
      <Card>
        <form onSubmit={(e) => void handleSubmit(e)} noValidate className="flex flex-wrap items-end gap-2.5">
          <Field label="Term" id={termId} className="w-36">
            <Select value={term} onValueChange={(value) => setTerm(value ?? "")}>
              <SelectTrigger id={termId} className="w-full">
                <SelectValue placeholder="Select a term" />
              </SelectTrigger>
              <SelectContent>
                {snapshot.terms.map((t) => (
                  <SelectItem key={t.entityId} value={t.entityId}>
                    {t.data.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Class" id={classId} className="w-36">
            <Select
              value={schoolClass}
              onValueChange={(value) => {
                setSchoolClass(value ?? "");
                setStudent("");
              }}
            >
              <SelectTrigger id={classId} className="w-full">
                <SelectValue placeholder="Select a class" />
              </SelectTrigger>
              <SelectContent>
                {snapshot.classes.map((c) => (
                  <SelectItem key={c.entityId} value={c.entityId}>
                    {c.data.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Student" id={studentId} className="w-36">
            <Select value={student} onValueChange={(value) => setStudent(value ?? "")}>
              <SelectTrigger id={studentId} className="w-full" disabled={!schoolClass}>
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
          <Field label="Date" id={dateId}>
            <Input id={dateId} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Status" id={statusId} className="w-32">
            <Select value={status} onValueChange={(value) => setStatus(value as typeof status)}>
              <SelectTrigger id={statusId} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Button type="submit" variant="secondary" loading={saving} disabled={!schoolClass || eligibleStudents.length === 0}>
            <Plus size={14} aria-hidden="true" />
            Record
          </Button>
        </form>
        {schoolClass && eligibleStudents.length === 0 ? (
          <p className="mt-2.5 mb-0 text-xs text-muted-foreground">
            No already-synced, actively enrolled student for this class yet.
          </p>
        ) : null}
        {error ? <div className="mt-2.5"><ErrorText>{error}</ErrorText></div> : null}
      </Card>

      {snapshot.attendance.length === 0 ? (
        <Card>
          <p className="m-0 text-sm text-muted-foreground">No attendance records cached on this device yet.</p>
        </Card>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {snapshot.attendance.slice(0, 100).map((record) => (
            <li key={record.entityId}>
              <Card className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="m-0 text-sm font-semibold">
                    {nameFor(record.data.studentId)} &middot; {record.data.status}
                  </p>
                  <p className="mt-0.5 mb-0 text-xs text-muted-foreground">
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
