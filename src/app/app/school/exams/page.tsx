import { GraduationCap, Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { EntityDialog } from "@/components/forms/entity-dialog";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FormFeedback, ReadOnlyNotice } from "@/components/school/form-feedback";
import { FieldGrid, SelectField, TextField } from "@/components/school/form-fields";
import { PrerequisiteNotice, SectionCard } from "@/components/school/section-card";
import { StatusBadge } from "@/components/school/status-badge";
import { formatDate } from "@/components/school/format";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getSchoolAcademicSetup, listSchoolExams, listSchoolStudents } from "@/modules/school/service";
import { createExamAction, publishExamAction, recordExamResultAction, submitExamForModerationAction } from "../actions";

export default async function SchoolExamsPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const [tenant, query] = await Promise.all([requireModuleAccess("school"), searchParams]);
  const canManage = hasPermission(tenant, PERMISSIONS.SCHOOL_EXAMS_MANAGE);
  const canPublish = hasPermission(tenant, PERMISSIONS.SCHOOL_EXAMS_PUBLISH);
  const [[years, classes, subjects], students, exams] = await Promise.all([
    getSchoolAcademicSetup(tenant.organizationId),
    listSchoolStudents(tenant.organizationId),
    listSchoolExams(tenant.organizationId),
  ]);

  const termOptions = years.flatMap((year) => year.terms.map((term) => ({ value: term.id, label: `${year.name} · ${term.name}${term.current ? " (current)" : ""}` })));
  const studentOptions = students.filter((student) => student.status === "ACTIVE").map((student) => ({ value: student.id, label: `${student.lastName}, ${student.firstName} (${student.admissionNumber})` }));
  const classOptions = classes.map((schoolClass) => ({ value: schoolClass.id, label: `${schoolClass.campus.name} · ${schoolClass.name}` }));

  const newExamDialog = (
    <EntityDialog
      trigger={<Button size="sm"><Plus />New exam</Button>}
      title="New exam"
      description="A new exam opens for result entry immediately."
      action={createExamAction}
      submitLabel="Create exam"
    >
      <TextField id="exam-name" name="name" label="Exam name" placeholder="End of Term 1 Mathematics" required maxLength={200} />
      <SelectField id="exam-year" name="academicYearId" label="Academic year" required options={years.map((year) => ({ value: year.id, label: year.current ? `${year.name} (current)` : year.name }))} emptyHint="Create an academic year first." />
      <SelectField id="exam-term" name="termId" label="Term" required options={termOptions} emptyHint="Create a term first." hint="The term must belong to the academic year you selected." />
      <SelectField id="exam-subject" name="subjectId" label="Subject" required options={subjects.map((subject) => ({ value: subject.id, label: subject.name }))} emptyHint="Create a subject first." />
      <FieldGrid>
        <TextField id="exam-total-marks" name="totalMarks" label="Total marks" type="number" step="0.01" min="0.01" defaultValue="100" required />
        <TextField id="exam-weight" name="weight" label="Weight" type="number" step="0.01" min="0.01" defaultValue="100" required hint="Contribution to the final grade." />
      </FieldGrid>
      <TextField id="exam-date" name="examDate" label="Exam date" type="date" hint="Optional." />
    </EntityDialog>
  );

  return (
    <div className="mx-auto max-w-screen-2xl space-y-6">
      <PageHeader
        title="Exams & Grading"
        description="Assessments move through result entry, moderation, and publishing. Results become visible to families only once published."
        actions={canManage && termOptions.length > 0 && subjects.length > 0 ? newExamDialog : undefined}
      />

      <FormFeedback
        saved={query.saved}
        error={query.error}
        savedMessage="The exam record is up to date."
        stateMessage="Check the workflow: marks must be within the exam total, only open exams with results can go to moderation, and only moderated exams can be published."
      />
      {!canManage && !canPublish ? <ReadOnlyNotice>Your role can review exams but cannot enter results or publish them.</ReadOnlyNotice> : null}
      {canManage && !canPublish ? <ReadOnlyNotice>You can enter results and submit them for moderation. Publishing requires the exam publishing permission.</ReadOnlyNotice> : null}
      <PrerequisiteNotice
        items={[
          { satisfied: termOptions.length > 0, label: "Create a term", href: "/app/school/academic-periods" },
          { satisfied: subjects.length > 0, label: "Create a subject", href: "/app/school/classes" },
        ]}
      />

      {exams.length === 0 ? (
        <EmptyState
          icon={GraduationCap}
          title="No exams yet"
          description="Create an exam, enter results against actively enrolled students, then submit for moderation and publish."
          action={canManage && termOptions.length > 0 && subjects.length > 0 ? newExamDialog : undefined}
        />
      ) : (
        exams.map((exam) => {
          const acceptsResults = exam.status === "DRAFT" || exam.status === "OPEN" || exam.status === "MODERATION";
          const canSubmit = canManage && exam.status === "OPEN" && exam.results.length > 0;
          const canPublishThis = canPublish && exam.status === "MODERATION" && exam.results.length > 0;

          return (
            <SectionCard
              key={exam.id}
              title={exam.name}
              description={`${exam.subject.name} · ${exam.academicYear.name} · ${exam.term.name} · Out of ${Number(exam.totalMarks)}${exam.examDate ? ` · ${formatDate(exam.examDate)}` : ""}`}
              actions={
                <>
                  <StatusBadge status={exam.status} />
                  {canManage && acceptsResults ? (
                    <EntityDialog
                      trigger={<Button size="sm" variant="outline">Enter result</Button>}
                      title={`Enter a result for ${exam.name}`}
                      description={`${exam.subject.name}. Entering a result for the same student again updates it.`}
                      action={recordExamResultAction}
                      submitLabel="Save result"
                    >
                      {/* The service requires the subject to match the exam's own subject, so it is fixed here rather than chosen. */}
                      <input type="hidden" name="examId" value={exam.id} />
                      <input type="hidden" name="subjectId" value={exam.subjectId} />
                      <SelectField id={`result-student-${exam.id}`} name="studentId" label="Student" required options={studentOptions} emptyHint="Only active students can be marked." />
                      <SelectField id={`result-class-${exam.id}`} name="classId" label="Class" required options={classOptions} emptyHint="Create a class first." hint="The student must be actively enrolled in this class for the exam's academic year." />
                      <TextField id={`result-marks-${exam.id}`} name="marks" label="Marks" type="number" step="0.01" min="0" max={Number(exam.totalMarks)} required hint={`Between 0 and ${Number(exam.totalMarks)}.`} />
                      <FieldGrid>
                        <TextField id={`result-grade-${exam.id}`} name="grade" label="Grade" maxLength={200} hint="Optional." />
                        <TextField id={`result-remark-${exam.id}`} name="remark" label="Remark" maxLength={200} hint="Optional." />
                      </FieldGrid>
                    </EntityDialog>
                  ) : null}
                  {canSubmit ? (
                    <form action={submitExamForModerationAction}>
                      <input type="hidden" name="examId" value={exam.id} />
                      <Button type="submit" size="sm" variant="outline">Submit for moderation</Button>
                    </form>
                  ) : null}
                  {canPublishThis ? (
                    <form action={publishExamAction}>
                      <input type="hidden" name="examId" value={exam.id} />
                      <Button type="submit" size="sm">Publish results</Button>
                    </form>
                  ) : null}
                </>
              }
            >
              {exam.results.length === 0 ? (
                <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                  No results entered yet. An exam needs at least one result before it can be submitted for moderation.
                </p>
              ) : (
                <div className="space-y-3">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Student</TableHead>
                        <TableHead className="hidden md:table-cell">Class</TableHead>
                        <TableHead>Marks</TableHead>
                        <TableHead className="hidden sm:table-cell">Grade</TableHead>
                        <TableHead className="hidden lg:table-cell">Remark</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {exam.results.map((result) => (
                        <TableRow key={result.id}>
                          <TableCell>
                            <span className="font-medium">{result.student.firstName} {result.student.lastName}</span>
                            <span className="block font-mono text-xs text-muted-foreground">{result.student.admissionNumber}</span>
                          </TableCell>
                          <TableCell className="hidden text-muted-foreground md:table-cell">{result.class.name}</TableCell>
                          <TableCell className="tabular-nums">{Number(result.marks)} / {Number(exam.totalMarks)}</TableCell>
                          <TableCell className="hidden sm:table-cell">{result.grade ?? "—"}</TableCell>
                          <TableCell className="hidden text-muted-foreground lg:table-cell">{result.remark ?? "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <p className="text-xs text-muted-foreground">
                    {exam.results.length} result{exam.results.length === 1 ? "" : "s"} entered
                    {exam.status === "PUBLISHED" && exam.publishedAt ? ` · Published ${formatDate(exam.publishedAt)}` : ""}
                  </p>
                </div>
              )}
            </SectionCard>
          );
        })
      )}
    </div>
  );
}
