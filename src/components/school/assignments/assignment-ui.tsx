import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { CheckboxField, FieldGrid, SelectField, TextField, type SelectOption } from "@/components/school/form-fields";
import { toZonedDateTimeInput } from "@/lib/timezone";
import type { MarkState, StudentQuestion } from "@/modules/school/assignment-grading";

/**
 * Presentational pieces shared by the teacher and student assignment pages.
 * Server-renderable (no hooks), so forms keep working as plain POSTs.
 */

export function formatDateTime(value: Date | null | undefined, timeZone: string) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-GB", { timeZone, day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(value);
}

export function formatScore(score: string | null | undefined, maxScore: string | null | undefined) {
  if (!score || !maxScore) return "-";
  const percent = Number(maxScore) > 0 ? Math.round((Number(score) / Number(maxScore)) * 1000) / 10 : 0;
  return `${trimZeros(score)} / ${trimZeros(maxScore)} (${percent}%)`;
}

export function trimZeros(value: string) {
  return value.includes(".") ? value.replace(/\.?0+$/, "") : value;
}

const DISPLAY_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  Draft: "outline",
  Scheduled: "secondary",
  Open: "default",
  "Past due": "secondary",
  Closed: "secondary",
  Graded: "default",
};

export function AssignmentStateBadge({ state }: { state: string }) {
  return <Badge variant={DISPLAY_VARIANT[state] ?? "outline"}>{state}</Badge>;
}

export function MarkStatusBadge({ mark }: { mark: MarkState }) {
  if (mark.state === "none") return <Badge variant="outline">Not submitted</Badge>;
  if (mark.state === "pending") return <Badge variant="secondary">Pending review</Badge>;
  return <Badge variant="default">{mark.attempt.gradingStatus === "REVIEWED" ? "Manually reviewed" : "Automatically graded"}</Badge>;
}

const GRADEBOOK_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; hint: string }> = {
  excluded: { label: "Excluded", variant: "outline", hint: "This assignment does not count towards the cumulative record." },
  included: { label: "Included", variant: "default", hint: "Recorded as this student's result for the linked exam." },
  pending: { label: "Waiting for marking", variant: "secondary", hint: "Recorded once the counting attempt is marked." },
  none: { label: "Nothing to record", variant: "outline", hint: "No submission, so no result is recorded. Missing work is never scored as zero automatically." },
  "not-recorded": { label: "Not recorded", variant: "destructive", hint: "The mark is final but the linked exam does not show it yet. Save the review again to retry." },
  "exam-locked": { label: "Exam already published", variant: "secondary", hint: "The linked exam is published or closed, so this mark can no longer change the cumulative record." },
};

export function GradebookStatusBadge({ status }: { status: string }) {
  const entry = GRADEBOOK_LABELS[status] ?? GRADEBOOK_LABELS.excluded;
  return <Badge variant={entry.variant} title={entry.hint}>{entry.label}</Badge>;
}

export function gradebookStatusHint(status: string) {
  return (GRADEBOOK_LABELS[status] ?? GRADEBOOK_LABELS.excluded).hint;
}

export const FEEDBACK_RELEASE_LABELS: Record<string, string> = {
  IMMEDIATE: "Straight after submitting",
  AFTER_DUE: "After the due date",
  ON_RELEASE: "When I mark the assignment graded",
};

export const ATTEMPT_SCORING_LABELS: Record<string, string> = {
  HIGHEST: "Highest marked attempt counts",
  LATEST: "Latest attempt counts",
};

export interface AssignmentSettingsDefaults {
  classId?: string;
  subjectId?: string;
  termId?: string;
  title?: string;
  instructions?: string | null;
  availableFrom: Date;
  dueAt: Date;
  allowLateSubmissions?: boolean;
  maxAttempts?: number;
  attemptScoring?: string;
  feedbackRelease?: string;
  showCorrectAnswers?: boolean;
}

/** Settings fields shared by the create and edit dialogs. Dates are entered in the school's timezone. */
export function AssignmentSettingsFields({
  idPrefix,
  classOptions,
  subjectOptions,
  termOptions,
  defaults,
  timeZone,
  academicLocked = false,
}: {
  idPrefix: string;
  classOptions: SelectOption[];
  subjectOptions: SelectOption[];
  termOptions: SelectOption[];
  defaults: AssignmentSettingsDefaults;
  timeZone: string;
  academicLocked?: boolean;
}) {
  return (
    <>
      <TextField id={`${idPrefix}-title`} name="title" label="Title" required maxLength={200} defaultValue={defaults.title} placeholder="Fractions practice, week 3" />
      {academicLocked ? (
        <>
          <input type="hidden" name="classId" value={defaults.classId} />
          <input type="hidden" name="subjectId" value={defaults.subjectId} />
          <input type="hidden" name="termId" value={defaults.termId} />
          <p className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">Class, subject, and term are fixed once an assignment has been published.</p>
        </>
      ) : (
        <FieldGrid columns={3}>
          <SelectField id={`${idPrefix}-class`} name="classId" label="Class" required options={classOptions} defaultValue={defaults.classId} emptyHint="You have no classes to set work for." />
          <SelectField id={`${idPrefix}-subject`} name="subjectId" label="Subject" required options={subjectOptions} defaultValue={defaults.subjectId} emptyHint="Create a subject first." />
          <SelectField id={`${idPrefix}-term`} name="termId" label="Academic year and term" required options={termOptions} defaultValue={defaults.termId} emptyHint="Create a term first." />
        </FieldGrid>
      )}
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-instructions`}>Instructions for students</Label>
        <Textarea id={`${idPrefix}-instructions`} name="instructions" rows={3} maxLength={5000} defaultValue={defaults.instructions ?? ""} />
      </div>
      <FieldGrid>
        <TextField id={`${idPrefix}-from`} name="availableFrom" label="Opens" type="datetime-local" required defaultValue={toZonedDateTimeInput(defaults.availableFrom, timeZone)} hint={`School time (${timeZone}).`} />
        <TextField id={`${idPrefix}-due`} name="dueAt" label="Due" type="datetime-local" required defaultValue={toZonedDateTimeInput(defaults.dueAt, timeZone)} hint={`School time (${timeZone}).`} />
      </FieldGrid>
      <FieldGrid>
        <TextField id={`${idPrefix}-attempts`} name="maxAttempts" label="Attempts allowed" type="number" min="1" max="10" step="1" required defaultValue={String(defaults.maxAttempts ?? 1)} />
        <SelectField id={`${idPrefix}-scoring`} name="attemptScoring" label="If more than one attempt" options={Object.entries(ATTEMPT_SCORING_LABELS).map(([value, label]) => ({ value, label }))} defaultValue={defaults.attemptScoring ?? "HIGHEST"} required />
      </FieldGrid>
      <SelectField id={`${idPrefix}-release`} name="feedbackRelease" label="Students see their score and feedback" options={Object.entries(FEEDBACK_RELEASE_LABELS).map(([value, label]) => ({ value, label }))} defaultValue={defaults.feedbackRelease ?? "ON_RELEASE"} required hint="Written answers always wait for your marking, whatever you choose here." />
      <CheckboxField id={`${idPrefix}-answers`} name="showCorrectAnswers" label="Show correct answers when results are released" hint="Never shown before the release point above." defaultChecked={defaults.showCorrectAnswers ?? false} />
      <CheckboxField id={`${idPrefix}-late`} name="allowLateSubmissions" label="Accept late submissions" hint="Late work is accepted until you close the assignment and is labelled late." defaultChecked={defaults.allowLateSubmissions ?? false} />
    </>
  );
}

/**
 * The questions as a student answers them. Answer keys are never part of
 * StudentQuestion, so nothing here can reveal one. Field names are parsed by
 * submitAssignmentAttemptAction.
 */
export function StudentQuestionInputs({ questions, disabled = false }: { questions: StudentQuestion[]; disabled?: boolean }) {
  return (
    <ol className="space-y-4">
      {questions.map((question, index) => (
        <li key={question.id}>
          <fieldset className="space-y-3 rounded-lg border p-4" disabled={disabled}>
            <legend className="sr-only">Question {index + 1}</legend>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="whitespace-pre-wrap text-sm font-medium"><span className="text-muted-foreground">{index + 1}. </span>{question.prompt}</p>
              <span className="shrink-0 text-xs text-muted-foreground">{trimZeros(question.points)} point{question.points === "1.00" ? "" : "s"}</span>
            </div>
            <QuestionControl question={question} />
            <p className="text-xs text-muted-foreground">{question.rule}{question.type === "NUMERIC" && question.numericTolerance && Number(question.numericTolerance) > 0 ? ` Allowed margin: plus or minus ${trimZeros(question.numericTolerance)}.` : ""}</p>
          </fieldset>
        </li>
      ))}
    </ol>
  );
}

function QuestionControl({ question }: { question: StudentQuestion }) {
  const name = `q_${question.id}`;
  if (question.type === "SINGLE_CHOICE" || question.type === "TRUE_FALSE" || question.type === "MULTI_SELECT") {
    const multi = question.type === "MULTI_SELECT";
    return (
      <div className="grid gap-2 sm:grid-cols-2">
        {question.options.map((option) => (
          <label key={option.id} className="flex min-h-10 cursor-pointer items-center gap-3 rounded-md border px-3 py-2 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5 has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50">
            <input type={multi ? "checkbox" : "radio"} name={`${name}_choice`} value={option.id} className="size-4 accent-primary" />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    );
  }
  if (question.type === "NUMERIC") {
    return (
      <div className="max-w-xs space-y-1.5">
        <Label htmlFor={`${name}-value`}>Your answer</Label>
        <Input id={`${name}-value`} name={`${name}_value`} inputMode="decimal" autoComplete="off" pattern="[+\-]?(\d+(\.\d+)?|\.\d+)" title="A plain number, for example 12.5" />
      </div>
    );
  }
  return (
    <div className="space-y-1.5">
      <Label htmlFor={`${name}-value`}>Your answer</Label>
      <Textarea id={`${name}-value`} name={`${name}_value`} rows={question.type === "ESSAY" ? 8 : 3} maxLength={10000} />
    </div>
  );
}
