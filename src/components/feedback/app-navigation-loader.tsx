"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

// Below this, the loader would flash on for less time than it takes a human
// eye to register it as intentional rather than a glitch.
const MIN_VISIBLE_MS = 260;
// If navigation somehow never resolves (a hung request, a dropped
// prefetch), this guarantees the full-screen overlay — which intentionally
// blocks repeat clicks — cannot get stuck forever.
const SAFETY_TIMEOUT_MS = 8000;
// Eases toward this ceiling while waiting for the real destination; it only
// ever reaches 100 once navigation actually completes (see the pathname/
// searchParams effect below), so the bar never lies about being "done".
const PROGRESS_CEILING = 86;

export function AppNavigationLoader() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(0);

  const shownAtRef = useRef<number | null>(null);
  const growTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const safetyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const routeKeyRef = useRef(`${pathname}?${searchParams.toString()}`);

  function clearTimers() {
    if (growTimerRef.current) clearInterval(growTimerRef.current);
    if (safetyTimerRef.current) clearTimeout(safetyTimerRef.current);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
  }

  function finish() {
    clearTimers();
    setProgress(100);
    // Let the bar visibly reach the end before the whole overlay fades —
    // snapping straight to invisible at 86% would look like it stalled.
    hideTimerRef.current = setTimeout(() => {
      setVisible(false);
      setProgress(0);
    }, 150);
  }

  // Start on a genuine internal navigation click.
  useEffect(() => {
    function start(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest<HTMLAnchorElement>("a[href]");
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const destination = new URL(anchor.href, window.location.href);
      if (destination.origin !== window.location.origin || destination.href === window.location.href) return;
      if (destination.pathname === window.location.pathname && destination.search === window.location.search) return;

      clearTimers();
      shownAtRef.current = Date.now();
      setProgress(14);
      setVisible(true);

      // Fast at first, then eases off — never claims to be finished on its
      // own. Actual completion is driven by the route-change effect below.
      growTimerRef.current = setInterval(() => {
        setProgress((current) => (current < PROGRESS_CEILING ? current + (PROGRESS_CEILING - current) * 0.15 : current));
      }, 150);

      safetyTimerRef.current = setTimeout(finish, SAFETY_TIMEOUT_MS);
    }

    document.addEventListener("click", start, true);
    return () => {
      document.removeEventListener("click", start, true);
      clearTimers();
    };
    // finish/clearTimers only touch refs and setState setters (both
    // reference-stable across renders) — safe to omit, and including them
    // would just re-attach this listener every render for no benefit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Real completion signal: the route actually changed underneath us.
  useEffect(() => {
    const routeKey = `${pathname}?${searchParams.toString()}`;
    if (routeKey === routeKeyRef.current) return;
    routeKeyRef.current = routeKey;
    if (shownAtRef.current === null) return;

    const elapsed = Date.now() - shownAtRef.current;
    shownAtRef.current = null;
    if (elapsed >= MIN_VISIBLE_MS) {
      finish();
    } else {
      hideTimerRef.current = setTimeout(finish, MIN_VISIBLE_MS - elapsed);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, searchParams]);

  if (!visible) return null;

  return (
    <div role="status" aria-live="polite" aria-label="Loading" aria-busy="true" className="fixed inset-0 z-[100] cursor-progress">
      <div className="absolute inset-x-0 top-0 h-[3px] overflow-hidden bg-primary/15">
        <div
          className="h-full bg-primary transition-[width] duration-150 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="absolute left-1/2 top-5 flex -translate-x-1/2 items-center gap-2.5 rounded-full border bg-background/97 py-2 pl-2.5 pr-4 shadow-lg backdrop-blur-md">
        <span className="relative flex size-5 shrink-0 items-center justify-center" aria-hidden="true">
          <span className="absolute inset-0 rounded-full border-2 border-primary/20" />
          <span className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-primary" />
        </span>
        <span className="text-sm font-medium">Loading…</span>
      </div>
    </div>
  );
}
