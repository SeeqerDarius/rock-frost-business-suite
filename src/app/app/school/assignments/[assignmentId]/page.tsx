import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowDown, ArrowLeft, ArrowUp, Eye, History, Lock, Pencil, Plus, ShieldOff, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { EntityDialog } from "@/components/forms/entity-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { FormFeedback } from "@/components/school/form-feedback";
import { SectionCard } from "@/components/school/section-card";
import { QuestionFields } from "@/components/school/assignments/question-fields";
import {
  ATTEMPT_SCORING_LABELS,
  AssignmentSettingsFields,
  AssignmentStateBadge,
  FEEDBACK_RELEASE_LABELS,
  GradebookStatusBadge,
  MarkStatusBadge,
  formatDateTime,
  formatScore,
  gradebookStatusHint,
  trimZeros,
} from "@/components/school/assignments/assignment-ui";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getSchoolAcademicSetup, resolveTeacherClassScope, SchoolNotFoundError, SchoolStateError } from "@/modules/school/service";
import {
  describeGradebookWeight,
  getSchoolAssignmentForStaff,
  hasUnpublishedChanges,
  isSchoolAssignmentsAvailable,
  listGradebookExamCandidates,
} from "@/modules/school/assignments-service";
import { QUESTION_TYPE_LABELS, QUESTION_TYPE_RULES, isAutoMarked, teacherDisplayState, type AssignmentQuestionType } from "@/modules/school/assignment-grading";
import {
  closeAssignmentAction,
  deleteAssignmentDraftAction,
  deleteQuestionAction,
  markAssignmentGradedAction,
  moveQuestionAction,
  publishAssignmentAction,
  reopenAssignmentAction,
  saveQuestionAction,
  setGradebookInclusionAction,
  updateAssignmentSettingsAction,
} from "../actions";

const SAVED_MESSAGES: Record<string, string> = {
  created: "Draft created. Add questions, preview it, then publish.",
  settings: "Settings saved.",
  question: "Questions saved. Publish to make changes visible to students.",
  published: "Published. Students in the class can now see it from the date it opens.",
  closed: "Closed. Students can no longer submit.",
  reopened: "Reopened for submissions.",
  graded: "Marked graded. Results set to release on grading are now visible to students.",
  included: "The assignment now counts towards the cumulative record.",
  excluded: "The assignment no longer counts towards the cumulative record.",
};

const EVENT_LABELS: Record<string, string> = {
  created: "Created",
  settings_updated: "Settings changed",
  published: "Published",
  closed: "Closed",
  reopened: "Reopened",
  graded: "Marked graded",
  inclusion_changed: "Cumulative record setting changed",
  gradebook_recorded: "Exam result recorded",
  gradebook_removed: "Exam result removed",
  grade_changed: "Mark changed",
  feedback_updated: "Feedback updated",
  submitted: "Submitted, waiting for marking",
  auto_graded: "Submitted and marked automatically",
};

export default async function SchoolAssignmentDetailPage({ params, searchParams }: { params: Promise<{ assignmentId: string }>; searchParams: Promise<{ saved?: string; error?: string }> }) {
  const [tenant, { assignmentId }, query] = await Promise.all([requireModuleAccess("school"), params, searchParams]);
  if (!hasPermission(tenant, PERMISSIONS.SCHOOL_EXAMS_MANAGE)) {
    return <div className="mx-auto max-w-screen-xl space-y-6"><PageHeader title="Assignment" /><EmptyState icon={Lock} title="Assignments are restricted" description="Your role needs the School exam management permission to set and mark assignments." /></div>;
  }
  if (!(await isSchoolAssignmentsAvailable(tenant.organizationId))) {
    return <div className="mx-auto max-w-screen-xl space-y-6"><PageHeader title="Assignment" /><EmptyState icon={ShieldOff} title="Assignments & Assessments isn't enabled" description="This is an optional School add-on. Contact Rock Frost to add it for your school." /></div>;
  }

  let data: Awaited<ReturnType<typeof getSchoolAssignmentForStaff>>;
  try {
    data = await getSchoolAssignmentForStaff(tenant.organizationId, tenant.userId, assignmentId);
  } catch (error) {
    if (error instanceof SchoolNotFoundError) notFound();
    if (error instanceof SchoolStateError) {
      return <div className="mx-auto max-w-screen-xl space-y-6"><PageHeader title="Assignment" /><EmptyState icon={Lock} title="Not one of your classes" description={error.message} /></div>;
    }
    throw error;
  }
  const { assignment, roster, submissions, examEditable } = data;
  const timeZone = tenant.organization.timezone ?? "UTC";
  const now = new Date();
  const state = teacherDisplayState({ status: assignment.status, availableFrom: assignment.availableFrom, dueAt: assignment.dueAt, now });
  const editable = assignment.status === "DRAFT" || assignment.status === "PUBLISHED";
  const [[years, allClasses, subjects], scope, unpublished, candidates, weight] = await Promise.all([
    getSchoolAcademicSetup(tenant.organizationId),
    resolveTeacherClassScope(tenant.organizationId, tenant.userId),
    hasUnpublishedChanges(tenant.organizationId, assignment.id),
    assignment.includeInGradebook ? Promise.resolve([]) : listGradebookExamCandidates(tenant.organizationId, assignment.id),
    assignment.gradebookExamId ? describeGradebookWeight(tenant.organizationId, assignment.gradebookExamId) : Promise.resolve(null),
  ]);
  const classes = scope ? allClasses.filter((schoolClass) => scope.has(schoolClass.id)) : allClasses;
  const classOptions = classes.map((schoolClass) => ({ value: schoolClass.id, label: `${schoolClass.campus.name} · ${schoolClass.name}` }));
  const subjectOptions = subjects.map((subject) => ({ value: subject.id, label: subject.name }));
  const termOptions = years.flatMap((year) => year.terms.map((term) => ({ value: term.id, label: `${year.name} · ${term.name}` })));
  const totalPoints = assignment.questions.reduce((sum, question) => sum + Number(question.points), 0);
  const pendingCount = submissions.filter((submission) => submission.gradingStatus === "PENDING_REVIEW").length;
  const currentVersion = assignment.versions[0];
  const submissionsOnOlderVersions = currentVersion ? submissions.filter((submission) => submission.version.version !== currentVersion.version).length : 0;

  const settingsDialog = (
    <EntityDialog
      trigger={<Button size="sm" variant="outline"><Pencil />Edit settings</Button>}
      title="Assignment settings"
      action={updateAssignmentSettingsAction}
      submitLabel="Save settings"
      contentClassName="sm:max-w-2xl max-h-[90vh] overflow-y-auto"
    >
      <input type="hidden" name="assignmentId" value={assignment.id} />
      <AssignmentSettingsFields
        idPrefix="edit-assignment"
        classOptions={classOptions}
        subjectOptions={subjectOptions}
        termOptions={termOptions}
        timeZone={timeZone}
        academicLocked={assignment.status !== "DRAFT" || assignment.includeInGradebook}
        defaults={{ ...assignment, attemptScoring: assignment.attemptScoring, feedbackRelease: assignment.feedbackRelease }}
      />
    </EntityDialog>
  );

  const lifecycleButton = (action: (formData: FormData) => Promise<void>, label: string, variant: "default" | "outline" = "outline") => (
    <form action={action}>
      <input type="hidden" name="assignmentId" value={assignment.id} />
      <Button type="submit" size="sm" variant={variant}>{label}</Button>
    </form>
  );

  return (
    <div className="mx-auto max-w-screen-xl space-y-6">
      <Link href="/app/school/assignments" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground focus-visible:text-foreground"><ArrowLeft className="size-4" />All assignments</Link>
      <PageHeader
        title={assignment.title}
        description={`${assignment.class.name} · ${assignment.subject.name} · ${assignment.term.academicYear.name} ${assignment.term.name}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <AssignmentStateBadge state={state} />
            {currentVersion ? <Badge variant="outline">Version {currentVersion.version}</Badge> : null}
          </div>
        }
      />
      <FormFeedback saved={query.saved} error={query.error} savedMessage={SAVED_MESSAGES[query.saved ?? ""] ?? "Saved."} />

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" nativeButton={false} render={<Link href={`/app/school/assignments/${assignment.id}/preview`} />}><Eye />Preview as student</Button>
        {editable ? settingsDialog : null}
        {assignment.status === "DRAFT" ? lifecycleButton(publishAssignmentAction, "Publish to class", "default") : null}
        {assignment.status === "PUBLISHED" && unpublished ? lifecycleButton(publishAssignmentAction, "Publish question changes", "default") : null}
        {assignment.status === "PUBLISHED" ? lifecycleButton(closeAssignmentAction, "Close submissions") : null}
        {assignment.status === "CLOSED" ? lifecycleButton(markAssignmentGradedAction, "Mark graded and release", "default") : null}
        {assignment.status === "CLOSED" || assignment.status === "GRADED" ? lifecycleButton(reopenAssignmentAction, "Reopen") : null}
        {assignment.status === "DRAFT" && !assignment.currentVersionId ? (
          <form action={deleteAssignmentDraftAction}>
            <input type="hidden" name="assignmentId" value={assignment.id} />
            <Button type="submit" size="sm" variant="ghost"><Trash2 />Delete draft</Button>
          </form>
        ) : null}
      </div>

      <dl className="grid gap-3 rounded-lg border p-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div><dt className="text-muted-foreground">Opens</dt><dd className="font-medium">{formatDateTime(assignment.availableFrom, timeZone)}</dd></div>
        <div><dt className="text-muted-foreground">Due</dt><dd className="font-medium">{formatDateTime(assignment.dueAt, timeZone)}{assignment.allowLateSubmissions ? " (late work accepted)" : ""}</dd></div>
        <div><dt className="text-muted-foreground">Attempts</dt><dd className="font-medium">{assignment.maxAttempts}{assignment.maxAttempts > 1 ? ` · ${ATTEMPT_SCORING_LABELS[assignment.attemptScoring]}` : ""}</dd></div>
        <div><dt className="text-muted-foreground">Results visible</dt><dd className="font-medium">{FEEDBACK_RELEASE_LABELS[assignment.feedbackRelease]}{assignment.showCorrectAnswers ? ", with correct answers" : ""}</dd></div>
        <div><dt className="text-muted-foreground">Maximum score</dt><dd className="font-medium">{currentVersion ? trimZeros(currentVersion.maxScore.toFixed(2)) : "-"} published{unpublished ? ` · ${trimZeros(totalPoints.toFixed(2))} in your edits` : ""}</dd></div>
        <div><dt className="text-muted-foreground">Submissions</dt><dd className="font-medium">{submissions.length} from {roster.filter((row) => row.attempts > 0).length} of {roster.length} students</dd></div>
        <div><dt className="text-muted-foreground">Waiting for marking</dt><dd className="font-medium">{pendingCount}</dd></div>
        {assignment.instructions ? <div className="sm:col-span-2 lg:col-span-4"><dt className="text-muted-foreground">Instructions</dt><dd className="whitespace-pre-wrap">{assignment.instructions}</dd></div> : null}
      </dl>

      {assignment.status === "PUBLISHED" && unpublished ? (
        <Alert>
          <AlertTitle>You have unpublished question changes</AlertTitle>
          <AlertDescription>
            Students still see version {currentVersion?.version}. Publishing creates version {(currentVersion?.version ?? 0) + 1} for new attempts only.
            {submissions.length > 0 ? ` The ${submissions.length} existing submission${submissions.length === 1 ? "" : "s"} keep the questions and marks they were given.` : ""}
          </AlertDescription>
        </Alert>
      ) : null}

      <SectionCard
        title={`Questions (${assignment.questions.length})`}
        description="Single choice, multiple select, true or false, and numeric questions are marked automatically on the server. Written answers are always marked by you. Nothing is marked by AI."
        actions={editable ? (
          <EntityDialog trigger={<Button size="sm"><Plus />Add question</Button>} title="Add question" action={saveQuestionAction} submitLabel="Save question" contentClassName="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
            <input type="hidden" name="assignmentId" value={assignment.id} />
            <QuestionFields />
          </EntityDialog>
        ) : undefined}
        className="scroll-mt-24"
      >
        <div id="questions" />
        {assignment.questions.length === 0 ? (
          <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">No questions yet. Add at least one before publishing.</p>
        ) : (
          <ol className="space-y-3">
            {assignment.questions.map((question, index) => {
              const options = Array.isArray(question.options) ? (question.options as { id: string; label: string }[]) : [];
              const type = question.type as AssignmentQuestionType;
              return (
                <li key={question.id} className="rounded-lg border p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-medium text-muted-foreground">Question {index + 1}</span>
                        <Badge variant="outline">{QUESTION_TYPE_LABELS[type]}</Badge>
                        <Badge variant={isAutoMarked(type) ? "secondary" : "outline"}>{isAutoMarked(type) ? "Auto-marked" : "You mark it"}</Badge>
                        <span className="text-muted-foreground">{trimZeros(question.points.toFixed(2))} points</span>
                      </div>
                      <p className="whitespace-pre-wrap text-sm">{question.prompt}</p>
                      {options.length > 0 ? (
                        <ul className="grid gap-1 text-sm sm:grid-cols-2">
                          {options.map((option) => (
                            <li key={option.id} className={question.correctOptionIds.includes(option.id) ? "font-medium text-primary" : "text-muted-foreground"}>
                              {question.correctOptionIds.includes(option.id) ? "Correct: " : ""}{option.label}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      {type === "TRUE_FALSE" ? <p className="text-sm text-primary">Correct: {question.correctOptionIds[0] === "true" ? "True" : "False"}</p> : null}
                      {type === "NUMERIC" ? <p className="text-sm text-primary">Expected {question.numericAnswer?.toString()} (plus or minus {question.numericTolerance?.toString() ?? "0"})</p> : null}
                      {question.markingGuide ? <p className="text-xs text-muted-foreground">Marking guide: {question.markingGuide}</p> : null}
                      <p className="text-xs text-muted-foreground">{QUESTION_TYPE_RULES[type]}</p>
                    </div>
                    {editable ? (
                      <div className="flex shrink-0 flex-wrap gap-1">
                        <form action={moveQuestionAction}><input type="hidden" name="assignmentId" value={assignment.id} /><input type="hidden" name="questionId" value={question.id} /><input type="hidden" name="direction" value="up" /><Button type="submit" size="icon-sm" variant="ghost" aria-label={`Move question ${index + 1} up`} disabled={index === 0}><ArrowUp /></Button></form>
                        <form action={moveQuestionAction}><input type="hidden" name="assignmentId" value={assignment.id} /><input type="hidden" name="questionId" value={question.id} /><input type="hidden" name="direction" value="down" /><Button type="submit" size="icon-sm" variant="ghost" aria-label={`Move question ${index + 1} down`} disabled={index === assignment.questions.length - 1}><ArrowDown /></Button></form>
                        <EntityDialog trigger={<Button size="sm" variant="outline" aria-label={`Edit question ${index + 1}`}><Pencil />Edit</Button>} title={`Edit question ${index + 1}`} action={saveQuestionAction} submitLabel="Save question" contentClassName="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
                          <input type="hidden" name="assignmentId" value={assignment.id} />
                          <input type="hidden" name="questionId" value={question.id} />
                          <QuestionFields defaults={{ type, prompt: question.prompt, points: question.points.toFixed(2), options, correctOptionIds: question.correctOptionIds, numericAnswer: question.numericAnswer?.toString() ?? null, numericTolerance: question.numericTolerance?.toString() ?? null, markingGuide: question.markingGuide }} />
                        </EntityDialog>
                        <form action={deleteQuestionAction}><input type="hidden" name="assignmentId" value={assignment.id} /><input type="hidden" name="questionId" value={question.id} /><Button type="submit" size="sm" variant="ghost" aria-label={`Remove question ${index + 1}`}><Trash2 />Remove</Button></form>
                      </div>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </SectionCard>

      <SectionCard
        title="Cumulative record"
        description="Off by default. An assignment only counts towards a student's term result when you link it to one of this subject's existing exams."
        className="scroll-mt-24"
      >
        <div id="gradebook" />
        {assignment.includeInGradebook && assignment.gradebookExam ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge>Included</Badge>
              <span className="text-sm">Counts as the result for <strong>{assignment.gradebookExam.name}</strong> ({assignment.gradebookExam.status.toLowerCase()}).</span>
            </div>
            <div className="space-y-2 rounded-lg bg-muted/40 p-4 text-sm">
              <p className="font-medium">How it counts</p>
              <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                <li>Each student&apos;s counting mark is scaled to the exam&apos;s {trimZeros(assignment.gradebookExam.totalMarks.toFixed(2))} marks and recorded as their result for that exam. The percentage stays the same.</li>
                <li>
                  It reaches the broadsheet and report only once that exam is published, using the existing exam rules. The exam&apos;s weight is {trimZeros(assignment.gradebookExam.weight.toFixed(2))}
                  {weight?.sharePercent !== null && weight ? `, about ${weight.sharePercent}% of the ${assignment.subject.name} result for ${assignment.term.name} across ${weight.siblings.length} exam${weight.siblings.length === 1 ? "" : "s"}` : ""}.
                </li>
                <li>Students who did not submit get no result for that exam, never an automatic zero. Marks waiting for review are recorded once you mark them.</li>
                <li>While included, results for {assignment.gradebookExam.name} can only change here, so there is one source for each mark.</li>
              </ul>
            </div>
            {examEditable ? (
              <form action={setGradebookInclusionAction} className="space-y-3 rounded-lg border p-4">
                <input type="hidden" name="assignmentId" value={assignment.id} />
                <input type="hidden" name="include" value="false" />
                <div className="space-y-1.5">
                  <Label htmlFor="exclude-note">Reason for removing (kept in the history)</Label>
                  <Textarea id="exclude-note" name="note" rows={2} maxLength={1000} required />
                </div>
                <p className="text-xs text-muted-foreground">Removing deletes every result this assignment recorded for {assignment.gradebookExam.name}. Student submissions and marks on the assignment are kept.</p>
                <Button type="submit" size="sm" variant="outline">Stop counting towards the cumulative record</Button>
              </form>
            ) : (
              <p className="rounded-lg border p-3 text-sm text-muted-foreground">{assignment.gradebookExam.name} is already published or closed, so this link and the recorded marks are part of the released record and can no longer be changed here.</p>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2"><Badge variant="outline">Excluded</Badge><span className="text-sm text-muted-foreground">Marks stay on this assignment only.</span></div>
            {candidates.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                To include it, an exam for {assignment.subject.name} in {assignment.term.name} must exist, still accept results, have no results yet, and not already be linked to another assignment.{" "}
                <Link href="/app/school/exams" className="font-medium text-foreground underline underline-offset-4">Create one in Exams & Grading</Link>, for example &quot;Class assignment 1&quot; with the weight your school uses for continuous assessment.
              </p>
            ) : (
              <form action={setGradebookInclusionAction} className="space-y-3 rounded-lg border p-4">
                <input type="hidden" name="assignmentId" value={assignment.id} />
                <input type="hidden" name="include" value="true" />
                <fieldset className="space-y-2">
                  <legend className="text-sm font-medium">Count it as the result for</legend>
                  {candidates.map((exam) => (
                    <label key={exam.id} className="flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm has-[:checked]:border-primary has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50">
                      <input type="radio" name="examId" value={exam.id} required className="mt-0.5 size-4 accent-primary" />
                      <span>
                        <span className="block font-medium">{exam.name}</span>
                        <span className="block text-xs text-muted-foreground">Out of {trimZeros(exam.totalMarks.toFixed(2))} · weight {trimZeros(exam.weight.toFixed(2))} · {exam.status.toLowerCase()}</span>
                      </span>
                    </label>
                  ))}
                </fieldset>
                <div className="space-y-1.5">
                  <Label htmlFor="include-note">Note (optional, kept in the history)</Label>
                  <Textarea id="include-note" name="note" rows={2} maxLength={1000} />
                </div>
                <p className="text-xs text-muted-foreground">Marks are scaled to the exam&apos;s total and recorded as each student&apos;s result for it. They reach the broadsheet only when the exam is published, combined with the subject&apos;s other exams by each exam&apos;s weight. No other weighting is applied.</p>
                <Button type="submit" size="sm">Count towards the cumulative record</Button>
              </form>
            )}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Students and marks" description={`${roster.length} student${roster.length === 1 ? "" : "s"}. ${assignment.maxAttempts > 1 ? ATTEMPT_SCORING_LABELS[assignment.attemptScoring] + "." : ""}${submissionsOnOlderVersions > 0 ? ` ${submissionsOnOlderVersions} submission${submissionsOnOlderVersions === 1 ? " was" : "s were"} answered on an earlier version and keep${submissionsOnOlderVersions === 1 ? "s" : ""} its questions.` : ""}`}>
        {roster.length === 0 ? (
          <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">No students are actively enrolled in {assignment.class.name} for this academic year.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Student</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden sm:table-cell">Mark</TableHead>
                <TableHead className="hidden md:table-cell">Cumulative record</TableHead>
                <TableHead><span className="sr-only">Open</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {roster.map((row) => {
                const latest = submissions.find((submission) => submission.studentId === row.studentId);
                const target = row.mark.state === "none" ? null : row.mark.attempt.id;
                return (
                  <TableRow key={row.studentId}>
                    <TableCell>
                      <span className="font-medium">{row.lastName}, {row.firstName}</span>
                      <span className="block font-mono text-xs text-muted-foreground">{row.admissionNumber}</span>
                      {latest?.late ? <Badge variant="secondary" className="mt-1">Late</Badge> : null}
                    </TableCell>
                    <TableCell>
                      <MarkStatusBadge mark={row.mark} />
                      <span className="mt-1 block text-xs text-muted-foreground">{row.attempts} of {assignment.maxAttempts} attempt{assignment.maxAttempts === 1 ? "" : "s"}</span>
                    </TableCell>
                    <TableCell className="hidden tabular-nums sm:table-cell">{row.mark.state === "final" ? formatScore(row.mark.score, row.mark.maxScore) : "-"}</TableCell>
                    <TableCell className="hidden md:table-cell">
                      <GradebookStatusBadge status={row.gradebook} />
                      <span className="sr-only">{gradebookStatusHint(row.gradebook)}</span>
                      {row.gradebook === "included" && row.gradebookMarks && assignment.gradebookExam ? <span className="block text-xs text-muted-foreground">{trimZeros(row.gradebookMarks)} / {trimZeros(assignment.gradebookExam.totalMarks.toFixed(2))}</span> : null}
                    </TableCell>
                    <TableCell className="text-right">
                      {target ? <Button size="sm" variant="outline" nativeButton={false} render={<Link href={`/app/school/assignments/${assignment.id}/submissions/${target}`} />}>{row.mark.state === "pending" ? "Mark" : "Review"}</Button> : null}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </SectionCard>

      <SectionCard title="History" description="Publishing, cumulative record changes, and every mark change, newest first.">
        {assignment.events.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing recorded yet.</p>
        ) : (
          <ol className="space-y-2 text-sm">
            {assignment.events.map((event) => (
              <li key={event.id} className="flex gap-3">
                <History className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <div>
                  <span className="font-medium">{EVENT_LABELS[event.action] ?? event.action}</span>
                  {event.previousValue || event.newValue ? <span className="text-muted-foreground">: {event.previousValue ?? "none"} to {event.newValue ?? "none"}</span> : null}
                  <span className="block text-xs text-muted-foreground">{formatDateTime(event.createdAt, timeZone)}{event.note ? ` · Note: ${event.note}` : ""}</span>
                </div>
              </li>
            ))}
          </ol>
        )}
      </SectionCard>
    </div>
  );
}
