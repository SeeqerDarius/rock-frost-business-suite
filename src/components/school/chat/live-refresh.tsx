"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Near-live chat: re-renders the current server page every few seconds while
 * the tab is visible, and immediately when it becomes visible again.
 */
export function LiveRefresh({ intervalMs }: { intervalMs: number }) {
  const router = useRouter();
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const interval = setInterval(tick, intervalMs);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [router, intervalMs]);
  return null;
}

/** Keeps the message list scrolled to the newest message when it changes. */
export function ScrollToLatest({ anchorId, dependency }: { anchorId: string; dependency: string }) {
  useEffect(() => {
    document.getElementById(anchorId)?.scrollIntoView({ block: "end" });
  }, [anchorId, dependency]);
  return null;
}
