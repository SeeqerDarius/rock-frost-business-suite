import Image from "next/image";

/**
 * Transparent navigation overlay. It intentionally paints no background, so
 * the current workspace stays visible until the destination is ready.
 */
export function RfLoadingScreen() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Loading"
      aria-busy="true"
      className="fixed inset-0 z-[100] flex cursor-progress flex-col items-center justify-center gap-4 p-6 text-center"
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
