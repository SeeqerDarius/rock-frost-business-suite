"use client";

import { useEffect, useRef, useState } from "react";
import { MessageCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SupportChat, type SupportChatMessage } from "@/components/support/support-chat";
import type { SupportMessageTemplate } from "@/lib/support/templates";
import { cn } from "@/lib/utils";

/** Must be >= the panel's exit-animation `duration-*` class below (150ms) — controls how long the panel stays mounted (but non-interactive) while it fades/slides out, before actually unmounting. */
const EXIT_ANIMATION_MS = 160;

interface FloatingSupportWidgetProps {
  initialUnread: number;
  templates?: SupportMessageTemplate[];
  expandHref: string;
  onSend: (content: string) => Promise<{ message: SupportChatMessage; otherPartyReadAt: string | null }>;
  onPoll: (sinceIso: string | null) => Promise<{ messages: SupportChatMessage[]; online: boolean; otherPartyReadAt: string | null }>;
  onHeartbeat: () => Promise<void>;
  onMarkRead: () => Promise<void>;
  /** Lightweight unread-count check, used only while the panel is closed — avoids fetching full message history just to keep the bubble badge fresh. */
  onUnreadPoll: () => Promise<number>;
  onRetry: () => Promise<void>;
}

/**
 * A globally-mounted floating chat bubble (bottom-right) replacing a
 * sidebar nav entry — the panel lazy-loads its message history on first
 * open (SupportChat's own poll effect fires immediately on mount) rather
 * than fetching it on every page navigation across the tenant workspace.
 *
 * Open/close plays a short fade + scale + slide animation (`tw-animate-css`
 * utilities, already used elsewhere in this design system's dropdown/menu
 * components). Closing doesn't unmount immediately — it keeps the panel in
 * the DOM (non-interactive) for EXIT_ANIMATION_MS so the closing animation
 * can actually play, then unmounts. Everything collapses to near-instant
 * under prefers-reduced-motion via this codebase's existing global rule.
 */
export function FloatingSupportWidget({
  initialUnread,
  templates,
  expandHref,
  onSend,
  onPoll,
  onHeartbeat,
  onMarkRead,
  onUnreadPoll,
  onRetry,
}: FloatingSupportWidgetProps) {
  const [open, setOpen] = useState(false);
  const [rendered, setRendered] = useState(false);
  const [unread, setUnread] = useState(initialUnread);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep the badge fresh only while the panel is closed — once it's open,
  // SupportChat's own polling and mark-read calls take over.
  useEffect(() => {
    if (open) return;
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
    const interval = setInterval(tick, 12000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [open, onUnreadPoll]);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closePanel();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
    };
  }, []);

  function openPanel() {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    setRendered(true);
    setOpen(true);
    setUnread(0);
  }

  function closePanel() {
    setOpen(false);
    closeTimeoutRef.current = setTimeout(() => setRendered(false), EXIT_ANIMATION_MS);
    triggerRef.current?.focus();
  }

  function handleToggle() {
    if (open) closePanel();
    else openPanel();
  }

  return (
    <>
      {rendered ? (
        <div
          role="dialog"
          aria-label="Support chat"
          className={cn(
            "fixed right-3 bottom-20 left-3 z-50 h-[min(36rem,calc(100dvh-6rem))] origin-bottom-right sm:right-5 sm:bottom-20 sm:left-auto sm:w-[min(24rem,calc(100vw-2.5rem))]",
            open
              ? "animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-4 duration-200"
              : "pointer-events-none animate-out fade-out-0 zoom-out-95 slide-out-to-bottom-2 duration-150",
          )}
        >
          <SupportChat
            viewerRole="TENANT"
            otherPartyLabel="Rock Frost Support"
            initialMessages={[]}
            initialOnline={false}
            initialOtherPartyReadAt={null}
            templates={templates}
            expandHref={expandHref}
            onSend={onSend}
            onPoll={onPoll}
            onHeartbeat={onHeartbeat}
            onMarkRead={onMarkRead}
            onRetry={onRetry}
            onClose={closePanel}
            className="h-full min-h-0 max-h-none"
          />
        </div>
      ) : null}

      <Button
        ref={triggerRef}
        type="button"
        size="icon"
        onClick={handleToggle}
        aria-label={open ? "Close support chat" : unread > 0 ? `Open support chat, ${unread} unread` : "Open support chat"}
        aria-expanded={open}
        className="fixed right-4 bottom-4 z-50 size-12 animate-in fade-in-0 zoom-in-75 rounded-full shadow-lg duration-300 hover:scale-105 active:scale-95 sm:right-5 sm:bottom-5"
      >
        <span className="relative flex size-5 items-center justify-center">
          <MessageCircle
            aria-hidden="true"
            className={cn(
              "absolute size-5 transition-all duration-200 ease-out",
              open ? "scale-50 rotate-45 opacity-0" : "scale-100 rotate-0 opacity-100",
            )}
          />
          <X
            aria-hidden="true"
            className={cn(
              "absolute size-5 transition-all duration-200 ease-out",
              open ? "scale-100 rotate-0 opacity-100" : "scale-50 -rotate-45 opacity-0",
            )}
          />
        </span>
        {!open && unread > 0 ? (
          <Badge variant="destructive" className="absolute -top-1 -right-1 min-w-5 justify-center border-2 border-background bg-destructive text-destructive-foreground" aria-hidden="true">
            {unread > 99 ? "99+" : unread}
          </Badge>
        ) : null}
      </Button>
    </>
  );
}
