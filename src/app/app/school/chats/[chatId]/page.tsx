import Link from "next/link";
import { cookies } from "next/headers";
import { ArrowLeft, Archive, BellOff, Check, CheckCheck, ChevronDown, FileText, Info, Lock, MessageSquareOff, Megaphone, Pin, Reply, Search, Users } from "lucide-react";
import { EmptyState } from "@/components/feedback/empty-state";
import { CommsFeedback } from "@/components/school/communications";
import { ChatComposer } from "@/components/school/chat/chat-composer";
import { initials } from "@/components/school/chat/chat-sidebar";
import { LiveRefresh, ScrollToLatest } from "@/components/school/chat/live-refresh";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission } from "@/lib/auth/permissions";
import { cn } from "@/lib/utils";
import { CHAT_REACTIONS, getChat, resolveChatViewer, SchoolChatError } from "@/modules/school/chat-service";
import { SCHOOL_COMMS_FLASH_COOKIE } from "@/modules/school/communications-flash";
import { deleteChatMessageAction, editChatMessageAction, reactToChatMessageAction, sendChatMessageAction, setChatPreferencesAction } from "../actions";

function time(value: Date, timeZone?: string) {
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone }).format(value);
}
function day(value: Date, timeZone?: string) {
  return new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone }).format(value);
}
function sizeLabel(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export default async function SchoolChatPage({ params, searchParams }: { params: Promise<{ chatId: string }>; searchParams: Promise<{ reply?: string; edit?: string; q?: string; error?: string; saved?: string }> }) {
  const [tenant, { chatId }, query] = await Promise.all([requireModuleAccess("school"), params, searchParams]);
  const back = <Link href="/app/school/chats" className="rounded-md p-2 hover:bg-muted md:hidden" aria-label="Back to chats"><ArrowLeft className="size-5" /></Link>;
  const viewer = await resolveChatViewer(tenant, (permission) => hasPermission(tenant, permission));
  if (!viewer) return <div className="p-6"><EmptyState icon={Lock} title="Chats are not available to you" description="Your role does not include School chat." /></div>;

  let chat: Awaited<ReturnType<typeof getChat>>;
  try {
    chat = await getChat(viewer, chatId, { search: query.q });
  } catch (error) {
    if (error instanceof SchoolChatError) return <div className="flex flex-1 flex-col p-4">{back}<EmptyState icon={MessageSquareOff} title={error.code === "unavailable" ? "Chat is not available" : "Chat not found"} description={error.message} /></div>;
    throw error;
  }
  const flash = query.error ? (await cookies()).get(SCHOOL_COMMS_FLASH_COOKIE)?.value : null;
  const timeZone = tenant.organization.timezone;
  const base = `/app/school/chats/${chat.id}`;
  const replyTarget = query.reply ? chat.messages.find((message) => message.id === query.reply && !message.deleted && message.kind !== "SYSTEM") : null;
  const editTarget = query.edit ? chat.messages.find((message) => message.id === query.edit && message.canEdit) : null;
  const others = chat.members.filter((member) => !member.isYou);
  const subtitle = chat.type === "GROUP" ? chat.members.map((member) => (member.isYou ? "You" : member.name)).join(", ") : others[0]?.side === "GUARDIAN" ? "Guardian" : "School staff";
  const lastId = chat.messages.at(-1)?.id ?? "none";
  // Remount the composer (fresh request id, empty box) only after your own sends, never when others post, so drafts survive live refreshes.
  const lastMineId = chat.messages.filter((message) => message.mine).at(-1)?.id ?? "none";
  // Day dividers: computed up front so rendering never mutates a variable.
  const dayLabels = chat.messages.map((message) => day(message.createdAt, timeZone));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <LiveRefresh intervalMs={4000} />
      <header className="flex items-center gap-2 border-b px-2 py-2 sm:px-3">
        {back}
        <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold", chat.type === "GROUP" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-primary/15 text-primary")} aria-hidden>
          {chat.type === "GROUP" ? <Users className="size-5" /> : initials(chat.title)}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-semibold">{chat.title}</h2>
          <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
        </div>
        <form className="hidden sm:block" role="search" action={base}>
          <label htmlFor="chat-search" className="sr-only">Search this chat</label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input id="chat-search" name="q" defaultValue={query.q ?? ""} placeholder="Search" className="h-9 w-40 rounded-md border bg-background pl-7 pr-2 text-sm" />
          </div>
        </form>
        <details className="relative">
          <summary className="flex cursor-pointer list-none items-center gap-1 rounded-md p-2 hover:bg-muted" aria-label="Chat options"><ChevronDown className="size-5" /></summary>
          <div className="absolute right-0 z-20 mt-1 w-56 rounded-md border bg-popover p-1 text-sm shadow-lg">
            {chat.type === "GROUP" ? <Link href={`${base}/info`} className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-muted"><Info className="size-4" />Group info</Link> : null}
            <form action={setChatPreferencesAction}><input type="hidden" name="chatId" value={chat.id} /><input type="hidden" name="preference" value={chat.pinned ? "unpin" : "pin"} /><button className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-muted"><Pin className="size-4" />{chat.pinned ? "Unpin chat" : "Pin chat"}</button></form>
            {chat.muted ? (
              <form action={setChatPreferencesAction}><input type="hidden" name="chatId" value={chat.id} /><input type="hidden" name="mute" value="off" /><button className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-muted"><BellOff className="size-4" />Unmute</button></form>
            ) : (["8h", "1w", "always"] as const).map((duration) => (
              <form key={duration} action={setChatPreferencesAction}><input type="hidden" name="chatId" value={chat.id} /><input type="hidden" name="mute" value={duration} /><button className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-muted"><BellOff className="size-4" />Mute {duration === "8h" ? "for 8 hours" : duration === "1w" ? "for 1 week" : "always"}</button></form>
            ))}
            <form action={setChatPreferencesAction}><input type="hidden" name="chatId" value={chat.id} /><input type="hidden" name="preference" value={chat.archived ? "unarchive" : "archive"} /><button className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-muted"><Archive className="size-4" />{chat.archived ? "Unarchive" : "Archive chat"}</button></form>
          </div>
        </details>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto bg-muted/20 px-2 py-3 sm:px-4" aria-live="polite">
        <CommsFeedback error={query.error} flash={flash} />
        {query.q ? <p className="mb-2 text-center text-xs text-muted-foreground">Showing messages matching &quot;{query.q}&quot;. <Link href={base} className="underline">Clear search</Link></p> : null}
        {chat.olderCount > 0 ? <p className="mb-2 text-center text-xs text-muted-foreground">{chat.olderCount} earlier message{chat.olderCount === 1 ? "" : "s"} not shown.</p> : null}
        {chat.messages.length === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">{query.q ? "No messages match." : "No messages yet. Say hello."}</p> : null}
        <ol className="space-y-1.5" aria-label="Messages">
          {chat.messages.map((message, index) => {
            const label = dayLabels[index];
            const showDay = index === 0 || label !== dayLabels[index - 1];
            const dayDivider = showDay ? <li key={`${message.id}-day`} className="py-2 text-center"><span className="rounded-full bg-background px-3 py-1 text-xs text-muted-foreground shadow-sm">{label}</span></li> : null;
            if (message.kind === "SYSTEM") {
              return [dayDivider, <li key={message.id} className="py-1 text-center"><span className="rounded-md bg-amber-500/10 px-2 py-1 text-xs text-amber-800 dark:text-amber-300">{message.body}</span></li>];
            }
            return [dayDivider, (
              <li key={message.id} id={`m-${message.id}`} className={cn("group flex", message.mine ? "justify-end" : "justify-start")}>
                <article className={cn("relative max-w-[85%] rounded-2xl px-3 py-2 shadow-sm sm:max-w-[70%]", message.mine ? "rounded-br-sm bg-primary/15" : "rounded-bl-sm bg-background")} aria-label={`Message from ${message.mine ? "you" : message.senderName}`}>
                  {!message.mine && chat.type === "GROUP" ? <p className={cn("text-xs font-semibold", message.senderSide === "GUARDIAN" ? "text-emerald-700 dark:text-emerald-400" : "text-primary")}>{message.senderName}</p> : null}
                  {message.broadcast ? <p className="flex items-center gap-1 text-[11px] text-muted-foreground"><Megaphone className="size-3" />Broadcast</p> : null}
                  {message.replyTo ? (
                    <a href={`#m-${message.replyTo.id}`} className="mb-1 block rounded-md border-l-4 border-primary/60 bg-muted/60 px-2 py-1 text-xs">
                      <span className="block font-medium">{message.replyTo.senderName}</span>
                      <span className="line-clamp-2 text-muted-foreground">{message.replyTo.preview}</span>
                    </a>
                  ) : null}
                  {message.deleted ? <p className="text-sm italic text-muted-foreground">This message was deleted</p> : null}
                  {message.attachment ? (
                    message.attachment.mimeType.startsWith("image/") ? (
                      <a href={`/api/school/chats/attachments/${message.id}`} target="_blank" rel="noreferrer" className="mb-1 block">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={`/api/school/chats/attachments/${message.id}`} alt={message.attachment.name} loading="lazy" className="max-h-72 rounded-lg object-contain" />
                      </a>
                    ) : (
                      <a href={`/api/school/chats/attachments/${message.id}`} className="mb-1 flex items-center gap-2 rounded-lg border bg-background/70 px-3 py-2 text-sm hover:bg-muted">
                        <FileText className="size-6 shrink-0 text-red-600" aria-hidden />
                        <span className="min-w-0"><span className="block truncate font-medium">{message.attachment.name}</span><span className="text-xs text-muted-foreground">PDF, {sizeLabel(message.attachment.size)}</span></span>
                      </a>
                    )
                  ) : null}
                  {!message.deleted && message.body ? <p className="whitespace-pre-wrap break-words text-sm">{message.body}</p> : null}
                  <p className="mt-0.5 flex items-center justify-end gap-1 text-[11px] text-muted-foreground">
                    {message.edited && !message.deleted ? <span>Edited</span> : null}
                    <time dateTime={message.createdAt.toISOString()}>{time(message.createdAt, timeZone)}</time>
                    {message.mine && !message.deleted ? (
                      message.seenByAll ? <CheckCheck className="size-3.5 text-sky-600" aria-label="Seen" /> : message.seenBy.length ? <CheckCheck className="size-3.5" aria-label={`Seen by ${message.seenBy.length}`} /> : <Check className="size-3.5" aria-label="Sent" />
                    ) : null}
                  </p>
                  {message.mine && chat.type === "GROUP" && message.seenBy.length > 0 && !message.deleted ? <p className="text-right text-[11px] text-muted-foreground" title={message.seenBy.join(", ")}>Seen by {message.seenBy.length}</p> : null}
                  {message.reactions.length ? (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {message.reactions.map((reaction) => (
                        <form key={reaction.emoji} action={reactToChatMessageAction}>
                          <input type="hidden" name="chatId" value={chat.id} /><input type="hidden" name="messageId" value={message.id} /><input type="hidden" name="emoji" value={reaction.emoji} />
                          <button className={cn("rounded-full border px-1.5 text-xs", reaction.mine ? "border-primary bg-primary/10" : "bg-background")} aria-label={`${reaction.emoji} ${reaction.count}${reaction.mine ? ", your reaction" : ""}`}>{reaction.emoji} {reaction.count}</button>
                        </form>
                      ))}
                    </div>
                  ) : null}
                  {!message.deleted ? (
                    <details className="absolute -top-2 right-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100 [&[open]]:opacity-100">
                      <summary className="flex cursor-pointer list-none rounded-full bg-background p-0.5 shadow" aria-label="Message options"><ChevronDown className="size-4" /></summary>
                      <div className={cn("absolute z-20 mt-1 w-48 rounded-md border bg-popover p-1 text-sm shadow-lg", message.mine ? "right-0" : "left-0")}>
                        <div className="flex justify-between px-1 pb-1">
                          {CHAT_REACTIONS.map((emoji) => (
                            <form key={emoji} action={reactToChatMessageAction}>
                              <input type="hidden" name="chatId" value={chat.id} /><input type="hidden" name="messageId" value={message.id} /><input type="hidden" name="emoji" value={emoji} />
                              <button className="rounded p-0.5 text-lg hover:bg-muted" aria-label={`React ${emoji}`}>{emoji}</button>
                            </form>
                          ))}
                        </div>
                        {chat.canPost ? <Link href={`${base}?reply=${message.id}#composer`} className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-muted"><Reply className="size-4" />Reply</Link> : null}
                        {message.canEdit ? <Link href={`${base}?edit=${message.id}#composer`} className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-muted">Edit</Link> : null}
                        {message.canDelete ? (
                          <form action={deleteChatMessageAction}>
                            <input type="hidden" name="chatId" value={chat.id} /><input type="hidden" name="messageId" value={message.id} />
                            <button className="w-full rounded px-2 py-1.5 text-left text-destructive hover:bg-muted">Delete for everyone</button>
                          </form>
                        ) : null}
                      </div>
                    </details>
                  ) : null}
                </article>
              </li>
            )];
          })}
        </ol>
        <div id="chat-end" />
        <ScrollToLatest anchorId="chat-end" dependency={`${lastId}-${chat.messages.length}`} />
      </div>

      <div id="composer">
        {chat.canPost ? (
          <ChatComposer
            key={`${lastMineId}-${editTarget?.id ?? ""}-${replyTarget?.id ?? ""}`}
            chatId={chat.id}
            action={sendChatMessageAction}
            editAction={editChatMessageAction}
            reply={replyTarget ? { id: replyTarget.id, senderName: replyTarget.mine ? "yourself" : replyTarget.senderName, preview: replyTarget.body || replyTarget.attachment?.name || "" } : null}
            edit={editTarget ? { messageId: editTarget.id, body: editTarget.body } : null}
            cancelReplyHref={base}
          />
        ) : (
          <p className="border-t bg-muted/40 p-3 text-center text-sm text-muted-foreground" role="status">Only group admins can send messages in this group.</p>
        )}
      </div>
    </div>
  );
}
