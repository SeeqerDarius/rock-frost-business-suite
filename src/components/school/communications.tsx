import Link from "next/link";
import { randomUUID } from "node:crypto";
import { Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/** Shared, server-rendered pieces of School in-app communications (staff screens and the guardian portal). */

export function formatMessageTime(value: Date, timeZone?: string) {
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: timeZone || undefined }).format(value);
}

export function UnreadBadge({ count, label = "unread" }: { count: number; label?: string }) {
  if (count <= 0) return null;
  return <Badge className="min-w-6 justify-center rounded-full px-2" aria-label={`${count} ${label}`}>{count > 99 ? "99+" : count}</Badge>;
}

type ConversationRow = {
  id: string;
  subject: string;
  status: "OPEN" | "CLOSED";
  lastMessageAt: Date;
  student: { firstName: string; lastName: string };
  guardian: { firstName: string; lastName: string };
  preview: string;
  lastSender: string | null;
  unread: number;
};

export function ConversationList({ conversations, hrefBase, viewer, timeZone }: { conversations: ConversationRow[]; hrefBase: string; viewer: "staff" | "guardian"; timeZone?: string }) {
  return (
    <ul className="divide-y rounded-lg border" aria-label="Conversations">
      {conversations.map((conversation) => (
        <li key={conversation.id}>
          <Link href={`${hrefBase}/${conversation.id}`} className={cn("flex items-start gap-3 px-4 py-3 hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none", conversation.unread > 0 && "bg-primary/5")}>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className={cn("truncate text-sm", conversation.unread > 0 ? "font-semibold" : "font-medium")}>{conversation.subject}</p>
                {conversation.status === "CLOSED" ? <Badge variant="outline">Closed</Badge> : null}
              </div>
              <p className="text-xs text-muted-foreground">
                {viewer === "staff" ? `${conversation.guardian.firstName} ${conversation.guardian.lastName}, about ${conversation.student.firstName} ${conversation.student.lastName}` : `About ${conversation.student.firstName} ${conversation.student.lastName}`}
              </p>
              {conversation.preview ? <p className="mt-1 truncate text-sm text-muted-foreground">{conversation.lastSender ? `${conversation.lastSender}: ` : ""}{conversation.preview}</p> : null}
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <time className="text-xs text-muted-foreground" dateTime={conversation.lastMessageAt.toISOString()}>{formatMessageTime(conversation.lastMessageAt, timeZone)}</time>
              <UnreadBadge count={conversation.unread} label="unread messages" />
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

type ThreadMessage = { id: string; body: string; senderSide: "STAFF" | "GUARDIAN"; senderName: string; senderUserId: string; createdAt: Date };

export function MessageThread({ messages, viewerUserId, olderMessageCount, timeZone }: { messages: ThreadMessage[]; viewerUserId: string; olderMessageCount: number; timeZone?: string }) {
  return (
    <div className="space-y-3">
      {olderMessageCount > 0 ? <p className="text-center text-xs text-muted-foreground">{olderMessageCount} earlier message{olderMessageCount === 1 ? "" : "s"} not shown.</p> : null}
      <ol className="space-y-3" aria-label="Message history">
        {messages.map((message) => {
          const mine = message.senderUserId === viewerUserId;
          return (
            <li key={message.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
              <article className={cn("max-w-[85%] rounded-lg border px-3 py-2 sm:max-w-[70%]", mine ? "border-primary/30 bg-primary/10" : "bg-muted/40")} aria-label={`Message from ${mine ? "you" : message.senderName}`}>
                <header className="mb-1 flex flex-wrap items-baseline gap-x-2 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{mine ? "You" : message.senderName}</span>
                  <span>{message.senderSide === "STAFF" ? "School" : "Guardian"}</span>
                  <time dateTime={message.createdAt.toISOString()}>{formatMessageTime(message.createdAt, timeZone)}</time>
                </header>
                <p className="whitespace-pre-wrap break-words text-sm">{message.body}</p>
              </article>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/**
 * Reply box. Each render carries a fresh request id, so submitting the same
 * form twice (a double click or a retried request) records one message; the
 * submit button disables itself while the send is in flight.
 */
export function MessageComposer({ action, conversationId, disabledReason }: { action: (formData: FormData) => Promise<void>; conversationId: string; disabledReason?: string | null }) {
  if (disabledReason) return <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground" role="status">{disabledReason}</p>;
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="conversationId" value={conversationId} />
      <input type="hidden" name="clientRequestId" value={randomUUID()} />
      <Label htmlFor="reply-body">Reply</Label>
      <textarea id="reply-body" name="body" required maxLength={4000} rows={4} className="w-full rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">Up to 4,000 characters. Messages stay in this app; no SMS or email is sent.</p>
        <Button type="submit" pendingLabel="Sending..."><Send />Send</Button>
      </div>
    </form>
  );
}

export function newRequestId() {
  return randomUUID();
}

const ERROR_TITLE: Record<string, string> = {
  forbidden: "You don't have permission to do that",
  "not-found": "That conversation or record could not be found",
  invalid: "Nothing was sent",
  unavailable: "Not available right now",
  closed: "This conversation is closed",
};

/** Result banner. `flash` is the exact server message from the httpOnly cookie, never from the URL. */
export function CommsFeedback({ success, error, flash }: { success?: string | null; error?: string; flash?: string | null }) {
  if (success) return <div role="status" className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">{success}</div>;
  if (!error || !(error in ERROR_TITLE)) return null;
  return (
    <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      <p className="font-medium">{ERROR_TITLE[error]}</p>
      {flash ? <p>{flash}</p> : null}
    </div>
  );
}
