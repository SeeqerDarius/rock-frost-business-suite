import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Lock, ShieldOff } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FormFeedback } from "@/components/school/form-feedback";
import { SectionCard } from "@/components/school/section-card";
import { formatDateTime, formatScore, trimZeros } from "@/components/school/assignments/assignment-ui";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { SchoolNotFoundError, SchoolStateError } from "@/modules/school/service";
import { getSchoolAssignmentSubmissionForStaff, isSchoolAssignmentsAvailable } from "@/modules/school/assignments-service";
import { QUESTION_TYPE_LABELS, isAutoMarked, type AnswerMap, type QuestionResultMap } from "@/modules/school/assignment-grading";
import { reviewSubmissionAction } from "../../../actions";

const GRADING_LABELS: Record<string, string> = {
  PENDING_REVIEW: "Pending review",
  AUTO_GRADED: "Automatically graded",
  REVIEWED: "Manually reviewed",
};

export default async function SubmissionReviewPage({ params, searchParams }: { params: Promise<{ assignmentId: string; submissionId: string }>; searchParams: Promise<{ saved?: string; error?: string }> }) {
  const [tenant, { assignmentId, submissionId }, query] = await Promise.all([requireModuleAccess("school"), params, searchParams]);
  if (!hasPermission(tenant, PERMISSIONS.SCHOOL_EXAMS_MANAGE)) {
    return <div className="mx-auto max-w-screen-lg space-y-6"><PageHeader title="Submission" /><EmptyState icon={Lock} title="Marking is restricted" description="Your role needs the School exam management permission to mark assignments." /></div>;
  }
  if (!(await isSchoolAssignmentsAvailable(tenant.organizationId))) {
    return <div className="mx-auto max-w-screen-lg space-y-6"><PageHeader title="Submission" /><EmptyState icon={ShieldOff} title="Assignments & Assessments isn't enabled" description="This is an optional School add-on. Contact Rock Frost to add it for your school." /></div>;
  }
  let data: Awaited<ReturnType<typeof getSchoolAssignmentSubmissionForStaff>>;
  try {
    data = await getSchoolAssignmentSubmissionForStaff(tenant.organizationId, tenant.userId, submissionId);
  } catch (error) {
    if (error instanceof SchoolNotFoundError) notFound();
    if (error instanceof SchoolStateError) return <div className="mx-auto max-w-screen-lg space-y-6"><PageHeader title="Submission" /><EmptyState icon={Lock} title="Not one of your classes" description={error.message} /></div>;
    throw error;
  }
  const { submission, questions } = data;
  if (submission.assignmentId !== assignmentId) notFound();
  const timeZone = tenant.organization.timezone ?? "UTC";
  const answers = submission.answers as unknown as AnswerMap;
  const results = submission.questionResults as unknown as QuestionResultMap;
  const locked = submission.assignment.status === "GRADED";
  const included = submission.assignment.includeInGradebook && submission.assignment.gradebookExam;

  return (
    <div className="mx-auto max-w-screen-lg space-y-6">
      <Link href={`/app/school/assignments/${assignmentId}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground focus-visible:text-foreground"><ArrowLeft className="size-4" />{submission.assignment.title}</Link>
      <PageHeader
        title={`${submission.student.firstName} ${submission.student.lastName}`}
        description={`Attempt ${submission.attemptNumber} · version ${submission.version.version} · submitted ${formatDateTime(submission.submittedAt, timeZone)}${submission.late ? " (late)" : ""}`}
        actions={<Badge variant={submission.gradingStatus === "PENDING_REVIEW" ? "secondary" : "default"}>{GRADING_LABELS[submission.gradingStatus]}</Badge>}
      />
      <FormFeedback saved={query.saved} error={query.error} savedMessage={included ? "Marks saved. The linked exam result was updated where the exam still accepts results." : "Marks saved."} />
      <p className="text-sm">
        Score: <strong className="tabular-nums">{submission.score ? formatScore(submission.score.toFixed(2), submission.maxScore.toFixed(2)) : `${trimZeros(submission.autoScore.toFixed(2))} auto-marked so far, out of ${trimZeros(submission.maxScore.toFixed(2))}`}</strong>
        {included ? <span className="text-muted-foreground"> · Counts towards {submission.assignment.gradebookExam!.name}</span> : <span className="text-muted-foreground"> · Not included in the cumulative record</span>}
      </p>
      {locked ? <p className="rounded-lg border p-3 text-sm text-muted-foreground">This assignment is marked graded. Reopen it to change a mark.</p> : null}

      <form action={reviewSubmissionAction} className="space-y-4">
        <input type="hidden" name="assignmentId" value={assignmentId} />
        <input type="hidden" name="submissionId" value={submission.id} />
        <ol className="space-y-4">
          {questions.map((question, index) => {
            const answer = answers[question.id];
            const result = results[question.id];
            const auto = isAutoMarked(question.type);
            const chosen = new Set(answer?.optionIds ?? []);
            const options = question.type === "TRUE_FALSE" ? [{ id: "true", label: "True" }, { id: "false", label: "False" }] : question.options;
            return (
              <li key={question.id}>
                <fieldset className="space-y-3 rounded-lg border p-4" disabled={locked}>
                  <legend className="sr-only">Question {index + 1}</legend>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-medium text-muted-foreground">Question {index + 1}</span>
                    <Badge variant="outline">{QUESTION_TYPE_LABELS[question.type]}</Badge>
                    {auto ? <Badge variant={result?.correct ? "default" : "destructive"}>{result?.correct ? "Correct" : "Incorrect"}</Badge> : <Badge variant="secondary">You mark it</Badge>}
                  </div>
                  <p className="whitespace-pre-wrap text-sm font-medium">{question.prompt}</p>
                  {options.length > 0 ? (
                    <ul className="grid gap-1 text-sm sm:grid-cols-2">
                      {options.map((option) => (
                        <li key={option.id} className="flex items-center gap-2">
                          <span aria-hidden="true">{chosen.has(option.id) ? "●" : "○"}</span>
                          <span className={question.correctOptionIds.includes(option.id) ? "font-medium text-primary" : undefined}>{option.label}</span>
                          {chosen.has(option.id) ? <span className="sr-only">(student chose this)</span> : null}
                          {question.correctOptionIds.includes(option.id) ? <span className="text-xs text-primary">correct</span> : null}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="rounded-md bg-muted/40 p-3 text-sm">
                      <p className="text-xs text-muted-foreground">Student answer</p>
                      <p className="whitespace-pre-wrap">{answer?.value ?? <span className="italic text-muted-foreground">No answer</span>}</p>
                    </div>
                  )}
                  {question.type === "NUMERIC" ? <p className="text-xs text-muted-foreground">Expected {question.numericAnswer} (plus or minus {question.numericTolerance ?? "0"})</p> : null}
                  {question.markingGuide ? <p className="text-xs text-muted-foreground">Marking guide: {question.markingGuide}</p> : null}
                  <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
                    <div className="space-y-1.5">
                      <Label htmlFor={`award-${question.id}`}>Points (max {trimZeros(question.points)})</Label>
                      <Input id={`award-${question.id}`} name={`award_${question.id}`} type="number" min="0" max={question.points} step="0.01" required={!auto} defaultValue={result?.awarded ?? ""} aria-describedby={auto ? `award-${question.id}-hint` : undefined} />
                      {auto ? <p id={`award-${question.id}-hint`} className="text-xs text-muted-foreground">Marked automatically. Change only to correct a faulty question.</p> : null}
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`feedback-${question.id}`}>Feedback on this answer</Label>
                      <Textarea id={`feedback-${question.id}`} name={`feedback_${question.id}`} rows={2} maxLength={2000} defaultValue={result?.feedback ?? ""} />
                    </div>
                  </div>
                </fieldset>
              </li>
            );
          })}
        </ol>
        <SectionCard title="Overall feedback">
          <fieldset className="space-y-3" disabled={locked}>
            <div className="space-y-1.5">
              <Label htmlFor="overall-feedback">Feedback for the student</Label>
              <Textarea id="overall-feedback" name="feedback" rows={3} maxLength={5000} defaultValue={submission.feedback ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="review-note">Reason for a mark change (staff only, kept in the history)</Label>
              <Input id="review-note" name="note" maxLength={1000} />
            </div>
            <Button type="submit">Save marks</Button>
          </fieldset>
        </SectionCard>
      </form>

      <SectionCard title="Grading history">
        {submission.events.length === 0 ? <p className="text-sm text-muted-foreground">Nothing recorded yet.</p> : (
          <ol className="space-y-2 text-sm">
            {submission.events.map((event) => (
              <li key={event.id}>
                <span className="font-medium">{event.action.replaceAll("_", " ")}</span>
                {event.previousValue || event.newValue ? <span className="text-muted-foreground">: {event.previousValue ?? "none"} to {event.newValue ?? "none"}</span> : null}
                <span className="block text-xs text-muted-foreground">{formatDateTime(event.createdAt, timeZone)}{event.note ? ` · ${event.note}` : ""}</span>
              </li>
            ))}
          </ol>
        )}
      </SectionCard>
    </div>
  );
}
