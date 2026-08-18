"use client";

import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import Link from "next/link";
import { Send, X, ExternalLink, Sparkles, CheckCheck, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarBadge } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { SupportMessageTemplate } from "@/lib/support/templates";

export interface SupportChatMessage {
  id: string;
  content: string;
  createdAt: string;
  senderRole: "TENANT" | "PLATFORM" | "AI";
  senderName: string;
}

interface SendResult {
  message: SupportChatMessage;
  otherPartyReadAt: string | null;
}

interface PollResult {
  messages: SupportChatMessage[];
  online: boolean;
  otherPartyReadAt: string | null;
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
  /** When did the other side last read the conversation, as of the initial (SSR) fetch — drives "Read"/"Sent" receipts on the viewer's own messages. */
  initialOtherPartyReadAt?: string | null;
  disabled?: boolean;
  disabledReason?: string;
  onSend: (content: string) => Promise<SendResult>;
  onPoll: (sinceIso: string | null) => Promise<PollResult>;
  onHeartbeat: () => Promise<void>;
  onMarkRead?: () => Promise<void>;
  /** Optional quick-start messages the viewer can pick and edit before sending — never sent automatically. */
  templates?: SupportMessageTemplate[];
  /** Renders a close (X) button in the header — for embedding inside a floating widget panel. */
  onClose?: () => void;
  /** Renders a small "Open full page" link in the header — lets a floating-widget user switch to the dedicated, larger page. */
  expandHref?: string;
  /** Merged onto the outer container — lets a floating widget override the default fixed height/corner styling with responsive sizing of its own. */
  className?: string;
}

export function SupportChat({
  viewerRole,
  otherPartyLabel,
  initialMessages,
  initialOnline,
  initialOtherPartyReadAt = null,
  disabled = false,
  disabledReason,
  onSend,
  onPoll,
  onHeartbeat,
  onMarkRead,
  templates,
  onClose,
  expandHref,
  className,
}: SupportChatProps) {
  const [messages, setMessages] = useState<SupportChatMessage[]>(initialMessages);
  const [online, setOnline] = useState(initialOnline);
  const [otherPartyReadAt, setOtherPartyReadAt] = useState(initialOtherPartyReadAt);
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

  // Poll for new messages, presence, and read receipts only while the tab is
  // actually visible — no point spending network/battery on a background
  // tab. Fires once immediately (not just on the interval) so a component
  // that mounts without SSR-provided history — e.g. the floating widget's
  // panel, which lazy-loads on first open — populates right away instead of
  // sitting empty for up to 4 seconds.
  useEffect(() => {
    let cancelled = false;
    async function tick() {
      if (document.visibilityState !== "visible") return;
      try {
        const result = await onPoll(lastTimestampRef.current);
        if (cancelled) return;
        setOnline(result.online);
        setOtherPartyReadAt(result.otherPartyReadAt);
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
    void tick();
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
        const result = await onSend(content);
        setMessages((prev) => [...prev, result.message]);
        lastTimestampRef.current = result.message.createdAt;
        setOtherPartyReadAt(result.otherPartyReadAt);
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

  function handleSelectTemplate(template: SupportMessageTemplate) {
    setDraft(template.content);
    inputRef.current?.focus();
  }

  return (
    <div className={cn("flex h-[32rem] flex-col overflow-hidden rounded-xl border bg-background", className)}>
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <Avatar size="sm">
            <AvatarFallback>{initialsFor(otherPartyLabel)}</AvatarFallback>
            <AvatarBadge aria-hidden="true" className={online ? "bg-emerald-500" : "bg-muted-foreground/50"} />
          </Avatar>
          <p className="truncate text-sm font-medium">{otherPartyLabel}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span
              aria-hidden="true"
              className={cn("size-2 rounded-full", online ? "bg-emerald-500" : "bg-muted-foreground/40")}
            />
            <span>{online ? "Online" : "Offline"}</span>
          </div>
          {expandHref ? (
            <Button variant="ghost" size="icon" className="size-7" nativeButton={false} render={<Link href={expandHref} />} aria-label="Open full page">
              <ExternalLink className="size-3.5" />
            </Button>
          ) : null}
          {onClose ? (
            <Button variant="ghost" size="icon" className="size-7" onClick={onClose} aria-label="Close support chat">
              <X className="size-4" />
            </Button>
          ) : null}
        </div>
      </div>

      {messages.some((message) => message.senderRole === "AI") ? (
        <p className="border-b bg-muted/40 px-4 py-1.5 text-center text-[11px] text-muted-foreground">
          Some replies here are automated. The Rock Frost team can always help too.
        </p>
      ) : null}

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
              const isAi = message.senderRole === "AI";
              const isRead = isOwn && otherPartyReadAt !== null && message.createdAt <= otherPartyReadAt;
              return (
                <div key={message.id} className={cn("flex items-end gap-2", isOwn ? "flex-row-reverse" : "flex-row")}>
                  <Avatar size="sm" className="mb-4 shrink-0">
                    <AvatarFallback className={isAi ? "bg-accent text-accent-foreground" : undefined}>
                      {isAi ? <Sparkles className="size-3.5" aria-hidden="true" /> : initialsFor(message.senderName)}
                    </AvatarFallback>
                  </Avatar>
                  <div className={cn("flex max-w-[75%] flex-col gap-1", isOwn ? "items-end" : "items-start")}>
                    <div
                      className={cn(
                        "rounded-2xl px-3.5 py-2 text-sm leading-relaxed whitespace-pre-wrap break-words",
                        isOwn ? "rounded-br-sm bg-primary text-primary-foreground"
                          : isAi ? "rounded-bl-sm bg-accent text-accent-foreground"
                          : "rounded-bl-sm bg-muted text-foreground",
                      )}
                    >
                      {message.content}
                    </div>
                    <p className="flex items-center gap-1 px-1 text-[11px] text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        {isOwn ? "You" : message.senderName}
                        {isAi ? (
                          <Badge variant="outline" className="h-4 rounded-full px-1.5 text-[9px] leading-none font-medium">
                            AI
                          </Badge>
                        ) : null}
                        <span>· {formatTimestamp(message.createdAt)}</span>
                      </span>
                      {isOwn ? (
                        isRead ? (
                          <span className="flex items-center gap-0.5 text-primary" title="Read">
                            <CheckCheck className="size-3" aria-hidden="true" />
                            <span className="sr-only">Read</span>
                          </span>
                        ) : (
                          <span className="flex items-center gap-0.5" title="Sent">
                            <Check className="size-3" aria-hidden="true" />
                            <span className="sr-only">Sent</span>
                          </span>
                        )
                      ) : null}
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
              {templates && templates.length > 0 ? (
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={<Button type="button" variant="outline" size="icon" disabled={isSending} aria-label="Insert a quick-reply template" />}
                  >
                    <Sparkles className="size-4" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" side="top">
                    <DropdownMenuLabel>Quick replies</DropdownMenuLabel>
                    {templates.map((template) => (
                      <DropdownMenuItem key={template.label} onClick={() => handleSelectTemplate(template)}>
                        {template.label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
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
            {error ? <p className="mt-1.5 text-xs text-destructive">{error}</p> : <p className="mt-1.5 text-xs text-muted-foreground">Enter to send · Shift+Enter for a new line{templates && templates.length > 0 ? " · Quick replies available" : ""}</p>}
          </>
        )}
      </form>
    </div>
  );
}
