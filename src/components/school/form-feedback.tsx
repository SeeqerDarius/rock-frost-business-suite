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
  "transfer-capacity": "The destination class reached capacity while you were working. Choose another class or increase capacity.",
  "stale-transfer-enrollment": "The student's current class changed. Refresh the profile before transferring.",
  "closed-transfer-year": "Transfers cannot be recorded in a closed academic year.",
  "inactive-transfer-year": "Transfers are only available in the current academic year. Set the correct school year as current before continuing.",
  "same-transfer-class": "Choose a destination class different from the current class.",
  "invalid-transfer-reason": "Enter a clear transfer reason between 5 and 500 characters.",
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
