import { useId, useMemo, useState, type FormEvent } from "react";
import { Plus, Send, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useApp } from "@/state/AppProvider";
import { createSchoolAdapter } from "@/modules/school/adapter";
import type { SchoolSnapshot } from "@/modules/school/school-data";
import { Field, ErrorText, SyncBadge } from "@/components/form-fields";

export function SchoolExamsScreen({ snapshot, onChanged }: { snapshot: SchoolSnapshot; onChanged: () => Promise<void> }) {
  return (
    <section aria-labelledby="school-exams-heading" className="flex flex-col gap-6">
      <h2 id="school-exams-heading" className="m-0 text-[1.05rem] font-bold">
        Exams
      </h2>
      <ExamSection snapshot={snapshot} onChanged={onChanged} />
      <ExamResultSection snapshot={snapshot} onChanged={onChanged} />
    </section>
  );
}

function ExamSection({ snapshot, onChanged }: { snapshot: SchoolSnapshot; onChanged: () => Promise<void> }) {
  const { db, device, recordActivity } = useApp();
  const yearId = useId();
  const termId = useId();
  const subjectId = useId();
  const nameId = useId();
  const totalMarksId = useId();
  const weightId = useId();
  const [academicYear, setAcademicYear] = useState("");
  const [term, setTerm] = useState("");
  const [subject, setSubject] = useState("");
  const [name, setName] = useState("");
  const [totalMarks, setTotalMarks] = useState("100.00");
  const [weight, setWeight] = useState("100.00");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!device) return;
    if (!academicYear || !term || !subject || !name.trim() || !/^\d{1,6}(\.\d{1,2})?$/.test(totalMarks.trim()) || !/^\d{1,3}(\.\d{1,2})?$/.test(weight.trim())) {
      setError("Select an academic year, term, and subject, enter a name, and valid marks/weight.");
      return;
    }
    setError(null);
    setSaving(true);
    recordActivity();
    try {
      await createSchoolAdapter({ db, organizationId: device.organizationId, actingUserName: device.userName }).createExam(crypto.randomUUID(), {
        academicYearId: academicYear,
        termId: term,
        subjectId: subject,
        name: name.trim(),
        totalMarks: totalMarks.trim(),
        weight: weight.trim(),
      });
      setName("");
      await onChanged();
    } catch {
      setError("Could not queue this exam. Try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmitForModeration(examId: string) {
    if (!device) return;
    recordActivity();
    setBusyId(examId);
    try {
      await createSchoolAdapter({ db, organizationId: device.organizationId, actingUserName: device.userName }).submitExamForModeration(crypto.randomUUID(), { examId });
      await onChanged();
    } finally {
      setBusyId(null);
    }
  }

  async function handlePublish(examId: string) {
    if (!device) return;
    recordActivity();
    setBusyId(examId);
    try {
      await createSchoolAdapter({ db, organizationId: device.organizationId, actingUserName: device.userName }).publishExam(crypto.randomUUID(), { examId });
      await onChanged();
    } finally {
      setBusyId(null);
    }
  }

  const nameForSubject = (id: string) => snapshot.subjects.find((s) => s.entityId === id)?.data.name ?? id.slice(0, 8);

  return (
    <div className="flex flex-col gap-2.5">
      <p className="m-0 text-sm font-semibold">Exams</p>
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
          <Field label="Term" id={termId} className="w-32">
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
          <Field label="Subject" id={subjectId} className="w-36">
            <Select value={subject} onValueChange={(value) => setSubject(value ?? "")}>
              <SelectTrigger id={subjectId} className="w-full">
                <SelectValue placeholder="Select a subject" />
              </SelectTrigger>
              <SelectContent>
                {snapshot.subjects.map((s) => (
                  <SelectItem key={s.entityId} value={s.entityId}>
                    {s.data.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Name" id={nameId} hint="e.g. Midterm" className="w-32">
            <Input id={nameId} value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Total marks" id={totalMarksId} className="w-24">
            <Input id={totalMarksId} inputMode="decimal" value={totalMarks} onChange={(e) => setTotalMarks(e.target.value)} />
          </Field>
          <Field label="Weight %" id={weightId} className="w-20">
            <Input id={weightId} inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} />
          </Field>
          <Button type="submit" variant="secondary" loading={saving}>
            <Plus size={14} aria-hidden="true" />
            Add exam
          </Button>
        </form>
        {error ? <div className="mt-2.5"><ErrorText>{error}</ErrorText></div> : null}
      </Card>

      {snapshot.exams.length === 0 ? (
        <p className="m-0 text-[0.8125rem] text-muted-foreground">No exams cached on this device yet.</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {snapshot.exams.map((exam) => (
            <li key={exam.entityId}>
              <Card className="flex flex-wrap items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="m-0 text-sm font-semibold">
                    {exam.data.name} &middot; {nameForSubject(exam.data.subjectId)}
                  </p>
                  <p className="mt-0.5 mb-0 text-xs text-muted-foreground">
                    {exam.data.status} &middot; {exam.data.results.length} result(s) recorded
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2.5">
                  <SyncBadge pending={exam.hasPendingLocalChange} />
                  {exam.data.status === "OPEN" ? (
                    <Button variant="secondary" onClick={() => void handleSubmitForModeration(exam.entityId)} loading={busyId === exam.entityId} disabled={exam.hasPendingLocalChange}>
                      Submit for moderation
                    </Button>
                  ) : null}
                  {exam.data.status === "MODERATION" ? (
                    <Button variant="secondary" onClick={() => void handlePublish(exam.entityId)} loading={busyId === exam.entityId} disabled={exam.hasPendingLocalChange}>
                      <Send size={14} aria-hidden="true" />
                      Publish
                    </Button>
                  ) : null}
                  {exam.data.status === "PUBLISHED" ? (
                    <span className="inline-flex items-center gap-1 text-xs text-primary">
                      <CheckCircle2 size={14} aria-hidden="true" />
                      Published
                    </span>
                  ) : null}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ExamResultSection({ snapshot, onChanged }: { snapshot: SchoolSnapshot; onChanged: () => Promise<void> }) {
  const { db, device, recordActivity } = useApp();
  const examId = useId();
  const classId = useId();
  const studentId = useId();
  const marksId = useId();
  const gradeId = useId();
  const [exam, setExam] = useState("");
  const [schoolClass, setSchoolClass] = useState("");
  const [student, setStudent] = useState("");
  const [marks, setMarks] = useState("");
  const [grade, setGrade] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Results cannot be recorded once an exam is published, matching
  // recordSchoolExamResult's own status guard server-side.
  const recordableExams = snapshot.exams.filter((e) => e.data.status !== "PUBLISHED" && !e.hasPendingLocalChange);

  const eligibleStudents = useMemo(() => {
    if (!schoolClass) return [];
    const enrolledIds = new Set(snapshot.enrollments.filter((en) => en.data.classId === schoolClass).map((en) => en.data.studentId));
    return snapshot.students.filter((s) => !s.hasPendingLocalChange && enrolledIds.has(s.entityId));
  }, [snapshot.enrollments, snapshot.students, schoolClass]);

  const selectedExam = snapshot.exams.find((e) => e.entityId === exam);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!device || !selectedExam) return;
    const marksValue = Number(marks);
    if (!schoolClass || !student || !Number.isFinite(marksValue) || marksValue < 0) {
      setError("Select a class and student, and enter a valid mark of 0 or more.");
      return;
    }
    setError(null);
    setSaving(true);
    recordActivity();
    try {
      await createSchoolAdapter({ db, organizationId: device.organizationId, actingUserName: device.userName }).recordExamResult(crypto.randomUUID(), {
        examId: exam,
        studentId: student,
        classId: schoolClass,
        subjectId: selectedExam.data.subjectId,
        marks: marksValue,
        grade: grade.trim() || null,
      });
      setMarks("");
      setGrade("");
      await onChanged();
    } catch {
      setError("Could not queue this result. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-2.5">
      <p className="m-0 text-sm font-semibold">Record a result</p>
      <Card>
        <form onSubmit={(e) => void handleSubmit(e)} noValidate className="flex flex-wrap items-end gap-2.5">
          <Field label="Exam" id={examId} className="w-40">
            <Select
              value={exam}
              onValueChange={(value) => {
                setExam(value ?? "");
                setStudent("");
              }}
            >
              <SelectTrigger id={examId} className="w-full">
                <SelectValue placeholder="Select an exam" />
              </SelectTrigger>
              <SelectContent>
                {recordableExams.map((e) => (
                  <SelectItem key={e.entityId} value={e.entityId}>
                    {e.data.name}
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
              <SelectTrigger id={classId} className="w-full" disabled={!exam}>
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
          <Field label="Marks" id={marksId} hint={selectedExam ? `out of ${selectedExam.data.totalMarks}` : undefined} className="w-24">
            <Input id={marksId} inputMode="decimal" value={marks} onChange={(e) => setMarks(e.target.value)} />
          </Field>
          <Field label="Grade" id={gradeId} hint="Optional, auto-derived if blank" className="w-20">
            <Input id={gradeId} value={grade} onChange={(e) => setGrade(e.target.value)} />
          </Field>
          <Button type="submit" variant="secondary" loading={saving} disabled={eligibleStudents.length === 0}>
            <Plus size={14} aria-hidden="true" />
            Record
          </Button>
        </form>
        {exam && schoolClass && eligibleStudents.length === 0 ? (
          <p className="mt-2.5 mb-0 text-xs text-muted-foreground">No already-synced, actively enrolled student for this class yet.</p>
        ) : null}
        {error ? <div className="mt-2.5"><ErrorText>{error}</ErrorText></div> : null}
      </Card>
    </div>
  );
}
