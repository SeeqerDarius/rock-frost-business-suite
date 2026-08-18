import { useId, useMemo, useState, type FormEvent } from "react";
import { Plus, Send, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { useApp } from "@/state/AppProvider";
import { createSchoolAdapter } from "@/modules/school/adapter";
import type { SchoolSnapshot } from "@/modules/school/school-data";
import { Field, inputStyle, selectStyle, ErrorText, SyncBadge } from "@/components/form-fields";

export function SchoolExamsScreen({ snapshot, onChanged }: { snapshot: SchoolSnapshot; onChanged: () => Promise<void> }) {
  return (
    <section aria-labelledby="school-exams-heading" style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <h2 id="school-exams-heading" style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700 }}>
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
    <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
      <p style={{ margin: 0, fontSize: "0.875rem", fontWeight: 600 }}>Exams</p>
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
          <Field label="Term" id={termId}>
            <select id={termId} value={term} onChange={(e) => setTerm(e.target.value)} style={{ ...selectStyle, width: "8rem" }}>
              <option value="">Select a term</option>
              {snapshot.terms.map((t) => (
                <option key={t.entityId} value={t.entityId}>
                  {t.data.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Subject" id={subjectId}>
            <select id={subjectId} value={subject} onChange={(e) => setSubject(e.target.value)} style={{ ...selectStyle, width: "9rem" }}>
              <option value="">Select a subject</option>
              {snapshot.subjects.map((s) => (
                <option key={s.entityId} value={s.entityId}>
                  {s.data.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Name" id={nameId} hint="e.g. Midterm">
            <input id={nameId} value={name} onChange={(e) => setName(e.target.value)} style={{ ...inputStyle, width: "8rem" }} />
          </Field>
          <Field label="Total marks" id={totalMarksId}>
            <input id={totalMarksId} inputMode="decimal" value={totalMarks} onChange={(e) => setTotalMarks(e.target.value)} style={{ ...inputStyle, width: "5.5rem" }} />
          </Field>
          <Field label="Weight %" id={weightId}>
            <input id={weightId} inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} style={{ ...inputStyle, width: "5rem" }} />
          </Field>
          <Button type="submit" variant="secondary" loading={saving}>
            <Plus size={14} aria-hidden="true" />
            Add exam
          </Button>
        </form>
        {error ? <div style={{ marginTop: "0.6rem" }}><ErrorText>{error}</ErrorText></div> : null}
      </Card>

      {snapshot.exams.length === 0 ? (
        <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--rf-muted-foreground)" }}>No exams cached on this device yet.</p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {snapshot.exams.map((exam) => (
            <li key={exam.entityId}>
              <Card style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
                <div style={{ minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: "0.875rem", fontWeight: 600 }}>
                    {exam.data.name} &middot; {nameForSubject(exam.data.subjectId)}
                  </p>
                  <p style={{ margin: "0.1rem 0 0", fontSize: "0.75rem", color: "var(--rf-muted-foreground)" }}>
                    {exam.data.status} &middot; {exam.data.results.length} result(s) recorded
                  </p>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexShrink: 0 }}>
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
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem", fontSize: "0.75rem", color: "var(--rf-primary)" }}>
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
    <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
      <p style={{ margin: 0, fontSize: "0.875rem", fontWeight: 600 }}>Record a result</p>
      <Card>
        <form onSubmit={(e) => void handleSubmit(e)} noValidate style={{ display: "flex", gap: "0.6rem", alignItems: "end", flexWrap: "wrap" }}>
          <Field label="Exam" id={examId}>
            <select
              id={examId}
              value={exam}
              onChange={(e) => {
                setExam(e.target.value);
                setStudent("");
              }}
              style={{ ...selectStyle, width: "10rem" }}
            >
              <option value="">Select an exam</option>
              {recordableExams.map((e) => (
                <option key={e.entityId} value={e.entityId}>
                  {e.data.name}
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
              disabled={!exam}
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
          <Field label="Marks" id={marksId} hint={selectedExam ? `out of ${selectedExam.data.totalMarks}` : undefined}>
            <input id={marksId} inputMode="decimal" value={marks} onChange={(e) => setMarks(e.target.value)} style={{ ...inputStyle, width: "5.5rem" }} />
          </Field>
          <Field label="Grade" id={gradeId} hint="Optional, auto-derived if blank">
            <input id={gradeId} value={grade} onChange={(e) => setGrade(e.target.value)} style={{ ...inputStyle, width: "5rem" }} />
          </Field>
          <Button type="submit" variant="secondary" loading={saving} disabled={eligibleStudents.length === 0}>
            <Plus size={14} aria-hidden="true" />
            Record
          </Button>
        </form>
        {exam && schoolClass && eligibleStudents.length === 0 ? (
          <p style={{ margin: "0.6rem 0 0", fontSize: "0.75rem", color: "var(--rf-muted-foreground)" }}>No already-synced, actively enrolled student for this class yet.</p>
        ) : null}
        {error ? <div style={{ marginTop: "0.6rem" }}><ErrorText>{error}</ErrorText></div> : null}
      </Card>
    </div>
  );
}
