"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useSelectedLayoutSegments } from "next/navigation";
import { Archive, BellOff, Megaphone, Pin, Plus, Search, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type SidebarChat = {
  id: string;
  type: "DIRECT" | "GROUP";
  title: string;
  preview: string;
  lastMessageAt: string;
  unread: number;
  pinned: boolean;
  muted: boolean;
};

export function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("") || "?";
}

function shortTime(iso: string, timeZone?: string) {
  const date = new Date(iso);
  const sameDay = new Date().toDateString() === date.toDateString();
  return new Intl.DateTimeFormat("en-GB", sameDay ? { hour: "2-digit", minute: "2-digit", timeZone } : { day: "numeric", month: "short", timeZone }).format(date);
}

/**
 * Chat list (left pane on desktop, full screen on phones). Search filters
 * locally; the list itself comes from the server and refreshes on its own.
 */
export function ChatSidebar({ chats, canCreateGroups, canBroadcast, timeZone, archivedCount, pushControl }: { chats: SidebarChat[]; canCreateGroups: boolean; canBroadcast: boolean; timeZone?: string; archivedCount: number; pushControl: React.ReactNode }) {
  const segments = useSelectedLayoutSegments();
  const activeId = segments[0] && !["new", "broadcast", "archived"].includes(segments[0]) ? segments[0] : null;
  const inSubPage = segments.length > 0;
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? chats.filter((chat) => chat.title.toLowerCase().includes(q) || chat.preview.toLowerCase().includes(q)) : chats;
  }, [chats, query]);

  return (
    <aside className={cn("flex min-h-0 flex-col border-r md:w-80 md:shrink-0 lg:w-96", inSubPage ? "hidden md:flex" : "flex w-full")} aria-label="Chats">
      <div className="space-y-3 border-b p-3">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-lg font-semibold">Chats</h1>
          <div className="flex items-center gap-1">
            {canBroadcast ? <Link href="/app/school/chats/broadcast" className="rounded-md p-2 hover:bg-muted" aria-label="New broadcast" title="New broadcast"><Megaphone className="size-4" /></Link> : null}
            {canCreateGroups ? <Link href="/app/school/chats/new?tab=group" className="rounded-md p-2 hover:bg-muted" aria-label="New group" title="New group"><Users className="size-4" /></Link> : null}
            <Link href="/app/school/chats/new" className="rounded-md p-2 hover:bg-muted" aria-label="New chat" title="New chat"><Plus className="size-4" /></Link>
          </div>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search chats" aria-label="Search chats" className="pl-8" />
        </div>
        {pushControl}
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto" aria-label="Chat list">
        {filtered.length === 0 ? <li className="p-6 text-center text-sm text-muted-foreground">{query ? "No chats match your search." : "No chats yet. Start one with the + button."}</li> : null}
        {filtered.map((chat) => (
          <li key={chat.id}>
            <Link href={`/app/school/chats/${chat.id}`} aria-current={chat.id === activeId ? "page" : undefined} className={cn("flex items-center gap-3 px-3 py-2.5 hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none", chat.id === activeId && "bg-muted")}>
              <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold", chat.type === "GROUP" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-primary/15 text-primary")} aria-hidden>
                {chat.type === "GROUP" ? <Users className="size-5" /> : initials(chat.title)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2">
                  <span className={cn("truncate text-sm", chat.unread > 0 ? "font-semibold" : "font-medium")}>{chat.title}</span>
                  <time className={cn("shrink-0 text-xs", chat.unread > 0 ? "font-medium text-primary" : "text-muted-foreground")} dateTime={chat.lastMessageAt}>{shortTime(chat.lastMessageAt, timeZone)}</time>
                </span>
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs text-muted-foreground">{chat.preview}</span>
                  <span className="flex shrink-0 items-center gap-1">
                    {chat.muted ? <BellOff className="size-3.5 text-muted-foreground" aria-label="Muted" /> : null}
                    {chat.pinned ? <Pin className="size-3.5 text-muted-foreground" aria-label="Pinned" /> : null}
                    {chat.unread > 0 ? <Badge className={cn("h-5 min-w-5 justify-center rounded-full px-1.5 text-[10px] tabular-nums", chat.muted && "bg-muted-foreground")} aria-label={`${chat.unread} unread`}>{chat.unread > 99 ? "99+" : chat.unread}</Badge> : null}
                  </span>
                </span>
              </span>
            </Link>
          </li>
        ))}
        {archivedCount > 0 ? (
          <li><Link href="/app/school/chats/archived" className="flex items-center gap-2 px-3 py-3 text-sm text-muted-foreground hover:bg-muted/60"><Archive className="size-4" />Archived ({archivedCount})</Link></li>
        ) : null}
      </ul>
    </aside>
  );
}
