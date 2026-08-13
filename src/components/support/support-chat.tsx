"use client";

import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarBadge } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

export interface SupportChatMessage {
  id: string;
  content: string;
  createdAt: string;
  senderRole: "TENANT" | "PLATFORM";
  senderName: string;
}

function initialsFor(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

function formatTimestamp(iso: string) {
  const date = new Date(iso);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  return sameDay
    ? date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
    : date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

interface SupportChatProps {
  /** Which side of the conversation the current viewer is on. */
  viewerRole: "TENANT" | "PLATFORM";
  /** Display name for the other party in this conversation (e.g. "Rock Frost Support", or a tenant's org name). */
  otherPartyLabel: string;
  initialMessages: SupportChatMessage[];
  initialOnline: boolean;
  disabled?: boolean;
  disabledReason?: string;
  onSend: (content: string) => Promise<SupportChatMessage>;
  onPoll: (sinceIso: string | null) => Promise<{ messages: SupportChatMessage[]; online: boolean }>;
  onHeartbeat: () => Promise<void>;
  onMarkRead?: () => Promise<void>;
}

export function SupportChat({
  viewerRole,
  otherPartyLabel,
  initialMessages,
  initialOnline,
  disabled = false,
  disabledReason,
  onSend,
  onPoll,
  onHeartbeat,
  onMarkRead,
}: SupportChatProps) {
  const [messages, setMessages] = useState<SupportChatMessage[]>(initialMessages);
  const [online, setOnline] = useState(initialOnline);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSending, startSendTransition] = useTransition();
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const lastTimestampRef = useRef<string | null>(initialMessages.at(-1)?.createdAt ?? null);
  const isNearBottomRef = useRef(true);

  useEffect(() => {
    onMarkRead?.();
  }, [onMarkRead]);

  // Auto-scroll to the newest message, but only if the viewer was already
  // near the bottom — someone scrolling up to re-read history shouldn't get
  // yanked back down by an incoming message.
  useEffect(() => {
    const viewport = scrollRef.current;
    if (viewport && isNearBottomRef.current) {
      viewport.scrollTo({ top: viewport.scrollHeight, behavior: "smooth" });
    }
  }, [messages]);

  useEffect(() => {
    function handleScroll() {
      const viewport = scrollRef.current;
      if (!viewport) return;
      isNearBottomRef.current = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 120;
    }
    const viewport = scrollRef.current;
    viewport?.addEventListener("scroll", handleScroll, { passive: true });
    return () => viewport?.removeEventListener("scroll", handleScroll);
  }, []);

  // Poll for new messages and presence only while the tab is actually
  // visible — no point spending network/battery on a background tab.
  useEffect(() => {
    let cancelled = false;
    async function tick() {
      if (document.visibilityState !== "visible") return;
      try {
        const result = await onPoll(lastTimestampRef.current);
        if (cancelled) return;
        setOnline(result.online);
        if (result.messages.length > 0) {
          setMessages((prev) => {
            const known = new Set(prev.map((m) => m.id));
            const fresh = result.messages.filter((m) => !known.has(m.id));
            return fresh.length ? [...prev, ...fresh] : prev;
          });
          lastTimestampRef.current = result.messages.at(-1)!.createdAt;
          onMarkRead?.();
        }
      } catch {
        // A single missed poll isn't worth surfacing — it'll retry on the next tick.
      }
    }
    const interval = setInterval(tick, 4000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", tick);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function beat() {
      if (document.visibilityState === "visible") void onHeartbeat();
    }
    beat();
    const interval = setInterval(beat, 20000);
    document.addEventListener("visibilitychange", beat);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", beat);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const content = draft.trim();
    if (!content || isSending) return;
    setError(null);
    startSendTransition(async () => {
      try {
        const sent = await onSend(content);
        setMessages((prev) => [...prev, sent]);
        lastTimestampRef.current = sent.createdAt;
        setDraft("");
        inputRef.current?.focus();
      } catch {
        setError("Couldn't send that message. Please try again.");
      }
    });
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSubmit(event);
    }
  }

  return (
    <div className="flex h-[32rem] flex-col overflow-hidden rounded-xl border bg-background">
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <Avatar size="sm">
            <AvatarFallback>{initialsFor(otherPartyLabel)}</AvatarFallback>
            <AvatarBadge aria-hidden="true" className={online ? "bg-emerald-500" : "bg-muted-foreground/50"} />
          </Avatar>
          <p className="truncate text-sm font-medium">{otherPartyLabel}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
          <span
            aria-hidden="true"
            className={cn("size-2 rounded-full", online ? "bg-emerald-500" : "bg-muted-foreground/40")}
          />
          <span>{online ? "Online" : "Offline"}</span>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div ref={scrollRef} className="flex h-full flex-col gap-3 overflow-y-auto p-4">
          <div aria-live="polite" className="sr-only">
            {messages.length > 0 ? `Latest message from ${messages.at(-1)!.senderName}: ${messages.at(-1)!.content}` : ""}
          </div>
          {messages.length === 0 ? (
            <p className="m-auto max-w-xs text-center text-sm text-muted-foreground">
              No messages yet. {viewerRole === "TENANT" ? "Send a message below and the Rock Frost team will reply here." : "Waiting for this organization to reach out."}
            </p>
          ) : (
            messages.map((message) => {
              const isOwn = message.senderRole === viewerRole;
              return (
                <div key={message.id} className={cn("flex items-end gap-2", isOwn ? "flex-row-reverse" : "flex-row")}>
                  <Avatar size="sm" className="mb-4 shrink-0">
                    <AvatarFallback>{initialsFor(message.senderName)}</AvatarFallback>
                  </Avatar>
                  <div className={cn("flex max-w-[75%] flex-col gap-1", isOwn ? "items-end" : "items-start")}>
                    <div
                      className={cn(
                        "rounded-2xl px-3.5 py-2 text-sm leading-relaxed whitespace-pre-wrap break-words",
                        isOwn ? "rounded-br-sm bg-primary text-primary-foreground" : "rounded-bl-sm bg-muted text-foreground",
                      )}
                    >
                      {message.content}
                    </div>
                    <p className="px-1 text-[11px] text-muted-foreground">
                      {isOwn ? "You" : message.senderName} · {formatTimestamp(message.createdAt)}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </ScrollArea>

      <form onSubmit={handleSubmit} className="border-t p-3">
        {disabled ? (
          <p className="rounded-md bg-muted/60 px-3 py-2 text-center text-xs text-muted-foreground">{disabledReason}</p>
        ) : (
          <>
            <div className="flex items-end gap-2">
              <label htmlFor="support-chat-input" className="sr-only">
                Message
              </label>
              <Textarea
                id="support-chat-input"
                ref={inputRef}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Write a message…"
                rows={1}
                maxLength={4000}
                disabled={isSending}
                className="max-h-32 resize-none"
              />
              <Button type="submit" size="icon" disabled={isSending || draft.trim().length === 0} aria-label="Send message">
                <Send className="size-4" />
              </Button>
            </div>
            {error ? <p className="mt-1.5 text-xs text-destructive">{error}</p> : <p className="mt-1.5 text-xs text-muted-foreground">Enter to send · Shift+Enter for a new line</p>}
          </>
        )}
      </form>
    </div>
  );
}
