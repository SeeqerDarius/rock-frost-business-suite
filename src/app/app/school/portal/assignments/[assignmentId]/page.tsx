import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2, Lock, ShieldOff } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormFeedback } from "@/components/school/form-feedback";
import { SectionCard } from "@/components/school/section-card";
import { StudentQuestionInputs, formatDateTime, formatScore, trimZeros } from "@/components/school/assignments/assignment-ui";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { isSchoolPortalGranted } from "@/lib/platform-communications";
import { SchoolNotFoundError, SchoolStateError } from "@/modules/school/service";
import { getSchoolAssignmentForStudent, isSchoolAssignmentsAvailable } from "@/modules/school/assignments-service";
import { submitAssignmentAttemptAction } from "@/app/app/school/assignments/actions";

const RELEASE_TEXT: Record<string, string> = {
  IMMEDIATE: "You see your mark straight after submitting. Written answers show once your teacher marks them.",
  AFTER_DUE: "You see your mark after the due date.",
  ON_RELEASE: "You see your mark when your teacher releases results.",
};

export default async function StudentAssignmentPage({ params, searchParams }: { params: Promise<{ assignmentId: string }>; searchParams: Promise<{ saved?: string; error?: string }> }) {
  const [tenant, { assignmentId }, query] = await Promise.all([requireModuleAccess("school"), params, searchParams]);
  if (!hasPermission(tenant, PERMISSIONS.SCHOOL_PORTAL_VIEW)) {
    return <div className="mx-auto max-w-screen-md space-y-6"><PageHeader title="Assignment" /><EmptyState icon={Lock} title="Portal access is restricted" description="Your role does not include School portal access." /></div>;
  }
  if (!(await isSchoolPortalGranted(tenant.organizationId)) || !(await isSchoolAssignmentsAvailable(tenant.organizationId))) {
    return <div className="mx-auto max-w-screen-md space-y-6"><PageHeader title="Assignment" /><EmptyState icon={ShieldOff} title="Not available right now" description="Online assignments are not currently enabled for your school." /></div>;
  }
  let data: Awaited<ReturnType<typeof getSchoolAssignmentForStudent>>;
  try {
    data = await getSchoolAssignmentForStudent(tenant.organizationId, tenant.userId, assignmentId);
  } catch (error) {
    if (error instanceof SchoolNotFoundError) notFound();
    if (error instanceof SchoolStateError) return <div className="mx-auto max-w-screen-md space-y-6"><PageHeader title="Assignment" /><EmptyState icon={Lock} title="Assignments are for student accounts" description={error.message} /></div>;
    throw error;
  }
  const timeZone = tenant.organization.timezone ?? "UTC";
  const { assignment, availability, canStart, attempts, released, mark } = data;
  // One key per rendered form: a retried or double-clicked submit of this
  // form resolves to the same attempt on the server.
  const idempotencyKey = randomUUID();

  return (
    <div className="mx-auto max-w-screen-md space-y-6">
      <Link href="/app/school/portal/assignments" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground focus-visible:text-foreground"><ArrowLeft className="size-4" />My Assignments</Link>
      <PageHeader title={assignment.title} description={`${assignment.subjectName} · ${assignment.className} · ${assignment.termName}`} />
      {query.saved === "submitted" || query.saved === "already" ? (
        <Alert>
          <CheckCircle2 />
          <AlertTitle>{query.saved === "already" ? "Already received" : "Submitted"}</AlertTitle>
          <AlertDescription>{query.saved === "already" ? "This attempt had already reached your teacher, so it was not counted twice." : "Your answers were received."} {RELEASE_TEXT[assignment.feedbackRelease]}</AlertDescription>
        </Alert>
      ) : (
        <FormFeedback error={query.error} savedMessage="" />
      )}

      <dl className="grid gap-3 rounded-lg border p-4 text-sm sm:grid-cols-2">
        <div><dt className="text-muted-foreground">Due</dt><dd className="font-medium">{formatDateTime(assignment.dueAt, timeZone)}{assignment.allowLateSubmissions ? " (late work accepted, marked late)" : ""}</dd></div>
        <div><dt className="text-muted-foreground">Attempts left</dt><dd className="font-medium">{data.attemptsRemaining} of {assignment.maxAttempts}{assignment.maxAttempts > 1 ? (assignment.attemptScoring === "HIGHEST" ? ", your best marked attempt counts" : ", your latest attempt counts") : ""}</dd></div>
        <div><dt className="text-muted-foreground">Total points</dt><dd className="font-medium">{assignment.maxScore ? trimZeros(assignment.maxScore) : "-"}</dd></div>
        <div><dt className="text-muted-foreground">Your mark</dt><dd className="font-medium">{released ? (mark?.state === "final" ? formatScore(mark.score, mark.maxScore) : mark?.state === "pending" ? "Waiting for marking" : "Not submitted") : attempts.length > 0 ? "Not released yet" : "Not submitted"}</dd></div>
        <p className="text-xs text-muted-foreground sm:col-span-2">{RELEASE_TEXT[assignment.feedbackRelease]}</p>
      </dl>
      {assignment.instructions ? <p className="whitespace-pre-wrap text-sm">{assignment.instructions}</p> : null}

      {canStart ? (
        <SectionCard title={attempts.length === 0 ? "Your answers" : `Attempt ${attempts.length + 1}`} description={availability === "late" ? "The due date has passed. This submission will be marked late." : "Answer every question, then submit. You cannot change an attempt after submitting it."}>
          <form action={submitAssignmentAttemptAction} className="space-y-4">
            <input type="hidden" name="assignmentId" value={assignment.id} />
            <input type="hidden" name="versionId" value={assignment.versionId ?? ""} />
            <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
            <StudentQuestionInputs questions={data.questions} />
            <Button type="submit" pendingLabel="Submitting…">Submit answers</Button>
          </form>
        </SectionCard>
      ) : availability === "scheduled" ? (
        <p className="rounded-lg border p-4 text-sm">This assignment opens {formatDateTime(assignment.availableFrom, timeZone)}.</p>
      ) : attempts.length === 0 ? (
        <p className="rounded-lg border p-4 text-sm text-muted-foreground">This assignment is closed for submissions.</p>
      ) : null}

      {attempts.slice().reverse().map((attempt) => (
        <SectionCard
          key={attempt.id}
          title={`Attempt ${attempt.attemptNumber}`}
          description={`Submitted ${formatDateTime(attempt.submittedAt, timeZone)}${attempt.late ? " (late)" : ""}`}
          actions={attempt.score ? <Badge>{formatScore(attempt.score, attempt.maxScore)}</Badge> : <Badge variant="secondary">{released && attempt.gradingStatus === "PENDING_REVIEW" ? "Waiting for marking" : released ? "Marked" : "Mark not released yet"}</Badge>}
        >
          {attempt.feedback ? <p className="mb-4 whitespace-pre-wrap rounded-md bg-muted/40 p-3 text-sm"><span className="block text-xs text-muted-foreground">Teacher feedback</span>{attempt.feedback}</p> : null}
          <ol className="space-y-3">
            {attempt.questions.map((question, index) => {
              const chosen = new Set(question.answer?.optionIds ?? []);
              return (
                <li key={question.id} className="rounded-lg border p-3 text-sm">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="whitespace-pre-wrap font-medium">{index + 1}. {question.prompt}</p>
                    {question.awarded !== null ? <span className="shrink-0 text-xs tabular-nums">{trimZeros(question.awarded)} / {trimZeros(question.points)}</span> : null}
                  </div>
                  {question.options.length > 0 ? (
                    <ul className="mt-2 space-y-1">
                      {question.options.map((option) => (
                        <li key={option.id} className="flex items-center gap-2">
                          <span aria-hidden="true">{chosen.has(option.id) ? "●" : "○"}</span>
                          <span>{option.label}</span>
                          {chosen.has(option.id) ? <span className="text-xs text-muted-foreground">your answer</span> : null}
                          {question.correctOptionIds?.includes(option.id) ? <span className="text-xs font-medium text-primary">correct answer</span> : null}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 whitespace-pre-wrap text-muted-foreground">{question.answer?.value ?? "No answer"}</p>
                  )}
                  {question.numericAnswer ? <p className="mt-1 text-xs text-primary">Correct answer: {question.numericAnswer}</p> : null}
                  {question.correct !== null ? <p className="mt-1 text-xs">{question.correct ? "Correct" : "Not correct"}</p> : null}
                  {question.feedback ? <p className="mt-1 text-xs">Feedback: {question.feedback}</p> : null}
                </li>
              );
            })}
          </ol>
        </SectionCard>
      ))}
    </div>
  );
}
