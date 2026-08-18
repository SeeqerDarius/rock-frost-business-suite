import { useId, useMemo, useState, type FormEvent } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useApp } from "@/state/AppProvider";
import { createSchoolAdapter } from "@/modules/school/adapter";
import type { SchoolSnapshot } from "@/modules/school/school-data";
import { Field, ErrorText, SyncBadge } from "@/components/form-fields";

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
    <section aria-labelledby="school-enrollment-heading" className="flex flex-col gap-4">
      <h2 id="school-enrollment-heading" className="m-0 text-[1.05rem] font-bold">
        Enrollment
      </h2>
      <Card>
        <form onSubmit={(e) => void handleSubmit(e)} noValidate className="flex flex-wrap items-end gap-2.5">
          <Field label="Campus" id={campusId} className="w-40">
            <Select
              value={campus}
              onValueChange={(value) => {
                setCampus(value ?? "");
                setStudent("");
                setSchoolClass("");
              }}
            >
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
          <Field label="Academic year" id={yearId} className="w-40">
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
              <SelectTrigger id={studentId} className="w-full" disabled={!campus}>
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
          <Field label="Class" id={classId} className="w-40">
            <Select value={schoolClass} onValueChange={(value) => setSchoolClass(value ?? "")}>
              <SelectTrigger id={classId} className="w-full" disabled={!campus}>
                <SelectValue placeholder="Select a class" />
              </SelectTrigger>
              <SelectContent>
                {eligibleClasses.map((c) => (
                  <SelectItem key={c.entityId} value={c.entityId}>
                    {c.data.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Button type="submit" variant="secondary" loading={saving} disabled={!campus || eligibleStudents.length === 0 || eligibleClasses.length === 0}>
            <Plus size={14} aria-hidden="true" />
            Enroll
          </Button>
        </form>
        {campus && (eligibleStudents.length === 0 || eligibleClasses.length === 0) ? (
          <p className="mt-2.5 mb-0 text-xs text-muted-foreground">
            This campus needs at least one already-synced student and class. One just added offline needs to sync first.
          </p>
        ) : null}
        {error ? <div className="mt-2.5"><ErrorText>{error}</ErrorText></div> : null}
      </Card>

      {snapshot.enrollments.length === 0 ? (
        <Card>
          <p className="m-0 text-sm text-muted-foreground">No active enrollments cached on this device yet.</p>
        </Card>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {snapshot.enrollments.map((enrollment) => (
            <li key={enrollment.entityId}>
              <Card className="flex items-center justify-between gap-4">
                <p className="m-0 text-sm font-semibold">
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
