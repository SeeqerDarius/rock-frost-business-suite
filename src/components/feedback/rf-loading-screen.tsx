import Image from "next/image";

/**
 * Branded loading state shown by `loading.tsx` files across the
 * authenticated app while a route segment's server data streams in (see
 * Next.js's `loading.js` file convention). Pure CSS, no client JS and no
 * artificial delay — it renders immediately and is swapped out the instant
 * the real content is ready.
 *
 * Shares its visual language (a rotating ring, not a ping/pulse) with
 * `AppNavigationLoader`'s top-pill so the app has one consistent "loading"
 * identity rather than two — this is the slower, full-boundary variant;
 * that one is the quick, non-blanking transition shown on ordinary link
 * clicks.
 *
 * Reduced motion: `src/app/globals.css` already forces every animation's
 * duration to ~0 under `prefers-reduced-motion: reduce`, so `animate-spin`
 * degrades to a static ring automatically — no extra `motion-safe:`/
 * `motion-reduce:` variants needed here.
 */
export function RfLoadingScreen() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Loading"
      className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-6 text-center"
    >
      <div className="relative flex size-14 items-center justify-center">
        <span className="absolute inset-0 rounded-full border-2 border-primary/15" />
        <span className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-primary" />
        <Image src="/icon.png" alt="" width={32} height={32} priority className="relative rounded-lg" />
      </div>
      <p className="text-sm font-medium text-muted-foreground">Loading…</p>
    </div>
  );
}
