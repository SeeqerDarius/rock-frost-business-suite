const KNOWN_ERRORS: Record<string, string> = {
  forbidden: "You don't have permission to do that.",
  invalid: "Check the highlighted fields and try again.",
  "missing-new-patient": "Enter a patient number and full name for the new patient.",
  "missing-new-prescriber": "Enter a full name and registration number for the new prescriber.",
};

/**
 * Domain errors from the service layer arrive as the actual message (e.g.
 * "Batch quantity and expiry are invalid.") rather than a short code: shown
 * as-is since those messages are already written to be user-facing.
 */
export function PharmacyStatusBanner({ saved, error, savedMessage = "Saved." }: { saved?: string; error?: string; savedMessage?: string }) {
  if (!saved && !error) return null;
  return (
    <>
      {saved ? (
        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600 dark:text-emerald-400">
          {savedMessage}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {KNOWN_ERRORS[error] ?? error}
        </div>
      ) : null}
    </>
  );
}
