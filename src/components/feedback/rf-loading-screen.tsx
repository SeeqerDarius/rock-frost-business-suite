import Image from "next/image";

/**
 * Branded loading state shown by `loading.tsx` files across the
 * authenticated app while a route segment's server data streams in (see
 * Next.js's `loading.js` file convention). Pure CSS, no client JS and no
 * artificial delay — it renders immediately and is swapped out the instant
 * the real content is ready.
 *
 * Reduced motion: `src/app/globals.css` already forces every animation's
 * duration to ~0 under `prefers-reduced-motion: reduce`, so the pulse/ping
 * utilities below degrade to a static mark automatically — no extra
 * `motion-safe:`/`motion-reduce:` variants needed here.
 */
export function RfLoadingScreen() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Loading"
      className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-6 text-center"
    >
      <div className="relative flex size-16 items-center justify-center">
        <span className="absolute inset-0 animate-ping rounded-full bg-primary/20" />
        <span className="absolute inset-0 animate-pulse rounded-full bg-primary/10" />
        <Image src="/icon.png" alt="" width={40} height={40} priority className="relative rounded-lg" />
      </div>
      <p className="text-sm font-medium text-muted-foreground">Loading…</p>
    </div>
  );
}
