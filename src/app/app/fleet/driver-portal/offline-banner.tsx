"use client";

import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";

/**
 * Used by both OfflineBanner and PaySubmitButton, so every submit control on
 * this page disables itself while offline with no extra wiring per call
 * site. Lazy initial state (not a synchronous setState inside the effect)
 * reads the real starting value on mount while staying SSR-safe, since
 * `navigator` doesn't exist during server rendering.
 */
export function useIsOffline(): boolean {
  const [isOffline, setIsOffline] = useState(() => typeof navigator !== "undefined" && !navigator.onLine);
  useEffect(() => {
    const goOffline = () => setIsOffline(true);
    const goOnline = () => setIsOffline(false);
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, []);
  return isOffline;
}

/**
 * Detection only, not a queue-and-replay system - reusing the visual
 * language of POS's real offline banner (src/app/app/pos/sell/sale-cart.tsx)
 * since it's the one working precedent in this app. A payment submission is
 * deliberately never queued for later replay here: it would have to
 * interact with duplicate-period prevention and the online-payment flow in
 * ways the existing service functions were never designed for. Disabling
 * submission and explaining why is the correct, bounded scope for a
 * financial form.
 */
export function OfflineBanner() {
  const isOffline = useIsOffline();
  if (!isOffline) return null;

  return (
    <p role="alert" className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300">
      <WifiOff className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      You&apos;re offline. Reconnect before recording a payment or reporting an issue - nothing is saved for later here.
    </p>
  );
}
