"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { MessageSquareHeart, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BUSINESS_MOTIVATIONS, shouldShowMotivation } from "@/lib/workspace-moments";

const EXCLUDED = ["/app/account", "/app/organization/billing", "/app/support", "/app/platform", "/app/feedback"];

export function WorkspaceMoments({ userId }: { userId: string }) {
  const pathname = usePathname();
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (EXCLUDED.some((prefix) => pathname.startsWith(prefix))) return;
    const key = `rockfrost:motivation:${userId}`;
    const recentKey = `${key}:recent`;
    const now = Date.now();
    const lastShown = Number(window.localStorage.getItem(key)) || null;
    if (!shouldShowMotivation(lastShown, now)) return;
    const timer = window.setTimeout(() => {
      const recent = window.localStorage.getItem(recentKey);
      const choices = BUSINESS_MOTIVATIONS.filter((item) => item !== recent);
      const selected = choices[Math.floor(Math.random() * choices.length)] ?? BUSINESS_MOTIVATIONS[0];
      setMessage(selected);
      window.localStorage.setItem(key, String(now));
      window.localStorage.setItem(recentKey, selected);
    }, 1800);
    return () => window.clearTimeout(timer);
  }, [pathname, userId]);

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(null), 10000);
    return () => window.clearTimeout(timer);
  }, [message]);

  return (
    // lg:left-72 clears the sidebar's own footer controls (its "Collapse
    // sidebar" button sits in that same bottom-left corner on desktop,
    // where the sidebar is always present - AppShell's sidebar is up to
    // w-64/16rem wide, so 72/18rem gives clearance in either its expanded
    // or collapsed width). Below lg, the sidebar is a slide-out sheet
    // instead of a persistent column, so there's nothing there to collide
    // with and the original corner position is fine.
    <div className="pointer-events-none fixed bottom-5 left-4 z-40 flex max-w-[calc(100vw-2rem)] flex-col items-start gap-2 sm:left-6 lg:left-72">
      {message ? (
        <aside className="pointer-events-auto flex max-w-sm items-start gap-3 rounded-xl border bg-background/95 p-4 shadow-lg backdrop-blur motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2" aria-live="polite">
          <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
          <div className="min-w-0"><p className="text-xs font-medium text-muted-foreground">A thought for your day</p><p className="mt-1 text-sm">{message}</p></div>
          <Button type="button" size="icon-sm" variant="ghost" onClick={() => setMessage(null)} aria-label="Dismiss motivation"><X /></Button>
        </aside>
      ) : null}
      <Button className="pointer-events-auto shadow-sm" size="sm" variant="outline" nativeButton={false} render={<Link href="/app/feedback" />}>
        <MessageSquareHeart /> Share feedback
      </Button>
    </div>
  );
}
