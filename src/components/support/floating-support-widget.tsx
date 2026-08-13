"use client";

import { useEffect, useRef, useState } from "react";
import { MessageCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SupportChat, type SupportChatMessage } from "@/components/support/support-chat";
import type { SupportMessageTemplate } from "@/lib/support/templates";

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
}

/**
 * A globally-mounted floating chat bubble (bottom-right) replacing a
 * sidebar nav entry — the panel lazy-loads its message history on first
 * open (SupportChat's own poll effect fires immediately on mount) rather
 * than fetching it on every page navigation across the tenant workspace.
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
}: FloatingSupportWidgetProps) {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(initialUnread);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

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
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  function handleToggle() {
    setOpen((value) => {
      const next = !value;
      if (next) setUnread(0);
      return next;
    });
  }

  return (
    <>
      {open ? (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Support chat"
          className="fixed bottom-24 right-4 z-50 w-[calc(100vw-2rem)] max-w-sm sm:right-6"
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
            onClose={() => {
              setOpen(false);
              triggerRef.current?.focus();
            }}
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
        className="fixed bottom-4 right-4 z-50 size-14 rounded-full shadow-lg sm:bottom-6 sm:right-6"
      >
        {open ? <X className="size-6" /> : <MessageCircle className="size-6" />}
        {!open && unread > 0 ? (
          <Badge variant="destructive" className="absolute -top-1 -right-1 min-w-5 justify-center border-2 border-background bg-destructive text-destructive-foreground" aria-hidden="true">
            {unread > 99 ? "99+" : unread}
          </Badge>
        ) : null}
      </Button>
    </>
  );
}
