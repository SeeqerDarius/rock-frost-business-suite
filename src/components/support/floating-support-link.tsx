"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LifeBuoy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface PlatformSupportBubbleLinkProps {
  initialUnread: number;
  /** Lightweight unread-count check, refreshed periodically so the badge stays current while the operator is elsewhere in the platform workspace. */
  onUnreadPoll: () => Promise<number>;
}

/**
 * Floating entry point (bottom-right) to the platform's Support inbox,
 * replacing its sidebar nav entry. Deliberately a link to the full
 * `/app/platform/support` page rather than an inline chat panel — the
 * operator needs to triage many tenant conversations at once, which a
 * small floating widget can't do justice to.
 */
export function PlatformSupportBubbleLink({ initialUnread, onUnreadPoll }: PlatformSupportBubbleLinkProps) {
  const [unread, setUnread] = useState(initialUnread);

  useEffect(() => {
    let cancelled = false;
    async function tick() {
      if (document.visibilityState !== "visible") return;
      try {
        const count = await onUnreadPoll();
        if (!cancelled) setUnread(count);
      } catch {
        // A single missed check isn't worth surfacing — it'll retry on the next tick.
      }
    }
    const interval = setInterval(tick, 15000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [onUnreadPoll]);

  return (
    <Button
      nativeButton={false}
      render={<Link href="/app/platform/support" />}
      size="icon"
      aria-label={unread > 0 ? `Open support inbox, ${unread} unread` : "Open support inbox"}
      className="fixed bottom-4 right-4 z-50 size-14 animate-in fade-in-0 zoom-in-75 rounded-full shadow-lg duration-300 hover:scale-105 active:scale-95 sm:bottom-6 sm:right-6"
    >
      <LifeBuoy className="size-6" />
      {unread > 0 ? (
        <Badge variant="destructive" className="absolute -top-1 -right-1 min-w-5 justify-center border-2 border-background bg-destructive text-destructive-foreground" aria-hidden="true">
          {unread > 99 ? "99+" : unread}
        </Badge>
      ) : null}
    </Button>
  );
}
