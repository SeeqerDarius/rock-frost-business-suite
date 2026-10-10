import { CheckCircle2, CircleAlert, LockKeyhole } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

/**
 * Success/error banner for School pages.
 *
 * Every School Server Action redirects back to its page with `?saved=1` or
 * `?error=<code>` (see `src/app/app/school/actions.ts`). Before this
 * component existed no School page read those params, so a submit looked
 * identical whether it succeeded or was rejected.
 *
 * `state` is deliberately page-specific: the service layer throws
 * `SchoolStateError` with a precise message ("Class capacity has been
 * reached."), but the action collapses every one of them to `error=state`,
 * so the page supplies the closest honest wording it can. Replacing this
 * with the real reason needs an actions.ts change — tracked in
 * docs/SCHOOL_UI_CUSTOMER_READINESS.md.
 */

export type SchoolErrorCode = "forbidden" | "invalid" | "state" | "not-found" | "wrong-password";

const STATE_REASONS: Record<string, string> = {
  "class-capacity": "That class has reached its configured capacity.",
  "future-attendance": "Attendance cannot be recorded for a future date.",
  "attendance-closed": "The campus attendance correction window has closed for that date.",
  "payment-exceeds-balance": "The payment cannot exceed the invoice's outstanding balance.",
  "refund-exceeds-balance": "The refund cannot exceed the payment's remaining refundable amount.",
  "timetable-conflict": "That period conflicts with an existing class, teacher, or room booking.",
  "marks-out-of-range": "Marks must be between zero and the exam's total marks.",
  "book-unavailable": "No copy of that book is currently available.",
  "stale-record": "The record changed in another request. Refresh and try again.",
  "guardian-duplicate": "A guardian with this name and phone already exists. Use the existing guardian record instead.",
  "rollover-capacity": "One or more destination classes do not have enough places. Increase class capacity or choose other classes, then review the batch again.",
  "rollover-campus-mismatch": "A destination class must be at the same campus as its source class.",
  "closed-rollover-target": "The destination academic year is archived. Choose an open year.",
  "incomplete-rollover-mapping": "Map every source class with active learners before continuing.",
  "invalid-rollover-years": "Choose two different academic years.",
  "invalid-rollover-mapping": "The class mapping is empty or too large. Reload the preview and try again.",
  "rollover-too-large": "The batch is larger than 5,000 learners. Move one campus or class group at a time.",
  "stale-rollover-preview": "Learners or enrollments changed after the preview. Reload it and confirm the latest data.",
  "assignment-linked": "This exam takes its results from an assignment that counts towards the cumulative record. Change the mark on the assignment instead.",
  "assignments-not-granted": "Assignments & Assessments is not enabled for this school. Contact Rock Frost to add it.",
  "class-not-assigned": "You can only work with classes you're assigned to teach.",
  "invalid-dates": "The due date must be after the date the assignment opens.",
  "invalid-attempts": "Allowed attempts must be between 1 and 10.",
  "invalid-question": "That question is incomplete. Check the options, the correct answer, and the points, then save again.",
  "assignment-locked": "The assignment is closed or graded. Reopen it first.",
  "assignment-published": "That change is only possible while the assignment is a draft that has never been published.",
  "assignment-included": "Remove the assignment from the cumulative record first.",
  "assignment-not-published": "Only a published assignment can be closed.",
  "assignment-not-closed": "Close the assignment first.",
  "no-questions": "Add at least one question before publishing.",
  "no-changes": "There are no question changes to publish.",
  "pending-review": "Some submissions still need marking. Mark them before marking the assignment graded.",
  "exam-required": "Choose the exam this assignment should count towards.",
  "exam-mismatch": "The exam must be in the same academic year, term, and subject as the assignment.",
  "exam-locked": "The linked exam is already published or closed, so its results can no longer change here.",
  "exam-linked": "That exam already takes its results from another assignment.",
  "exam-has-results": "That exam already has results entered by hand. Choose an exam with no results so nothing is overwritten.",
  "not-a-student": "Assignments are available to student portal accounts.",
  "student-inactive": "Your student record is not active. Contact the school office.",
  "not-enrolled": "This assignment is not set for your class.",
  "not-open": "This assignment is not open yet.",
  "closed": "This assignment is closed for submissions.",
  "version-changed": "Your teacher updated this assignment while you were working. Your answers were not submitted. Reload it to see the latest questions.",
  "no-attempts": "You have used every attempt for this assignment.",
  "invalid-key": "This form has expired. Reload the page and try again.",
};

const GENERIC: Record<SchoolErrorCode, { title: string; description: string }> = {
  forbidden: { title: "You don't have permission to do that", description: "Your role does not include this School permission. An organization administrator can grant it." },
  invalid: { title: "Nothing was saved", description: "Some values were missing or in the wrong format. Check the highlighted form and submit again." },
  state: { title: "That change isn't allowed right now", description: "The record's current status or a school rule blocked this change. Refresh to see the latest state." },
  "not-found": { title: "That record could not be found", description: "It may have been removed or belongs to another record or organization. Refresh the page and try again." },
  "wrong-password": { title: "Password incorrect", description: "The password you entered doesn't match your account. Nothing was deleted." },
};

interface FormFeedbackProps {
  saved?: string;
  error?: string;
  /** Message shown after a successful submit, e.g. "Student created". */
  savedMessage: string;
  /** Page-specific wording for the `state` code, which the action cannot describe precisely. */
  stateMessage?: string;
}

export function FormFeedback({ saved, error, savedMessage, stateMessage }: FormFeedbackProps) {
  if (saved) {
    return (
      <Alert>
        <CheckCircle2 />
        <AlertTitle>Saved</AlertTitle>
        <AlertDescription>{savedMessage}</AlertDescription>
      </Alert>
    );
  }

  if (!error) return null;
  const [baseCode, ...reasonParts] = error.split("-");
  const code = (baseCode === "state" ? "state" : error) as SchoolErrorCode;
  if (!(code in GENERIC)) return null;
  const copy = GENERIC[code];
  const stableReason = reasonParts.join("-");
  const description = code === "state" ? STATE_REASONS[stableReason] ?? stateMessage ?? copy.description : copy.description;

  return (
    <Alert variant="destructive">
      {code === "forbidden" ? <LockKeyhole /> : <CircleAlert />}
      <AlertTitle>{copy.title}</AlertTitle>
      <AlertDescription>{description}</AlertDescription>
    </Alert>
  );
}

/** Persistent notice shown to roles that can read a School page but not change it. */
export function ReadOnlyNotice({ children }: { children: React.ReactNode }) {
  return (
    <Alert>
      <LockKeyhole />
      <AlertTitle>Read-only access</AlertTitle>
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}
