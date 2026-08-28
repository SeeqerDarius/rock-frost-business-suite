/**
 * Domain errors from a service layer sometimes arrive as the actual message
 * (e.g. "Batch quantity and expiry are invalid.") rather than a short code:
 * shown as-is via the `error` fallback since those messages are already
 * written to be user-facing. `errorMessages` maps known short codes (e.g.
 * "forbidden", "invalid") to friendlier text.
 */
export function SettingsBanner({
  saved,
  error,
  savedMessage = "Saved.",
  errorMessages,
}: {
  saved?: string;
  error?: string;
  savedMessage?: string;
  errorMessages?: Record<string, string>;
}) {
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
          {errorMessages?.[error] ?? error}
        </div>
      ) : null}
    </>
  );
}
