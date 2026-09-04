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
  "timetable-conflict": "That period conflicts with an existing class, teacher, or room booking.",
  "marks-out-of-range": "Marks must be between zero and the exam's total marks.",
  "book-unavailable": "No copy of that book is currently available.",
  "stale-record": "The record changed in another request. Refresh and try again.",
  "guardian-duplicate": "A guardian with this name and phone already exists. Use the existing guardian record instead.",
};

const GENERIC: Record<SchoolErrorCode, { title: string; description: string }> = {
  forbidden: { title: "You don't have permission to do that", description: "Your role does not include this School permission. An organization administrator can grant it." },
  invalid: { title: "Nothing was saved", description: "Some values were missing or in the wrong format. Check the highlighted form and submit again." },
  state: { title: "That change isn't allowed right now", description: "The record's current status or a school rule blocked this change. Refresh to see the latest state." },
  "not-found": { title: "That record could not be found", description: "It may have been removed or belongs to another campus. Refresh the page and try again." },
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
