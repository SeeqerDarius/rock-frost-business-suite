"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { getNotificationUnreadCount } from "@/app/app/(overview)/notifications/actions";

const POLL_INTERVAL_MS = 12000;

/**
 * Self-contained unread badge for the sidebar's Notifications item — fetches
 * its own count on mount and polls thereafter, same visibility-gated
 * interval pattern as FloatingSupportWidget's bubble badge. Renders nothing
 * until the first successful fetch (no count is a legitimate zero, not a
 * loading state worth showing), and nothing at all once the count is zero.
 */
export function NotificationBadge() {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function tick() {
      if (document.visibilityState !== "visible") return;
      try {
        const value = await getNotificationUnreadCount();
        if (!cancelled) setCount(value);
      } catch {
        // A single missed check isn't worth surfacing - it'll retry on the next tick.
      }
    }
    tick();
    const interval = setInterval(tick, POLL_INTERVAL_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);

  if (!count) return null;
  return (
    <Badge className="ml-auto h-5 min-w-5 shrink-0 justify-center rounded-full px-1 text-[10px] tabular-nums">
      {count > 99 ? "99+" : count}
    </Badge>
  );
}
