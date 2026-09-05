"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { filterConversations, groupConversationsByOrganization, type FilterableConversation } from "@/lib/support/conversation-filtering";

interface SupportConversationListProps<T extends FilterableConversation> {
  /** Each conversation paired with its already-rendered row - the caller (a Server Component) renders the row's JSX up front, since a render function can't cross the server-to-client boundary as a prop. */
  rows: { conversation: T; node: ReactNode }[];
  /** Clusters filtered results by organization, in order of each organization's most recent activity. Only meaningful for the cross-organization platform inbox — the single-organization admin inbox never needs it. */
  groupByOrganization?: boolean;
  searchPlaceholder?: string;
  emptyLabel?: string;
}

/**
 * Shared search/grouping shell for the platform inbox and the organization
 * admin inbox — both list many conversations now that support chat split
 * from one-per-organization to one-per-(organization, user). Filtering runs
 * client-side against the already-fetched list (no extra round trip); only
 * the row's own visuals differ between the two surfaces, pre-rendered by the
 * caller and passed in via `rows`.
 */
export function SupportConversationList<T extends FilterableConversation>({
  rows,
  groupByOrganization = false,
  searchPlaceholder = "Search by name or organization",
  emptyLabel = "No conversations match your search.",
}: SupportConversationListProps<T>) {
  const [query, setQuery] = useState("");
  const conversations = useMemo(() => rows.map((row) => row.conversation), [rows]);
  const nodeById = useMemo(() => new Map(rows.map((row) => [row.conversation.id, row.node])), [rows]);
  const filtered = useMemo(() => filterConversations(conversations, query), [conversations, query]);
  const groups = useMemo(
    () => (groupByOrganization ? groupConversationsByOrganization(filtered) : null),
    [filtered, groupByOrganization],
  );

  return (
    <div className="space-y-3">
      {conversations.length > 1 ? (
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <label htmlFor="support-conversation-search" className="sr-only">
            {searchPlaceholder}
          </label>
          <Input
            id="support-conversation-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={searchPlaceholder}
            className="pl-8 text-xs"
          />
        </div>
      ) : null}

      {filtered.length === 0 ? (
        <p className="px-1 py-4 text-center text-xs text-muted-foreground">{emptyLabel}</p>
      ) : groups ? (
        <div className="space-y-4">
          {groups.map((group) => (
            <div key={group.organizationId} className="space-y-2">
              <p className="px-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{group.organizationName}</p>
              <div className="space-y-2">
                {group.conversations.map((conversation) => (
                  <div key={conversation.id}>{nodeById.get(conversation.id)}</div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((conversation) => (
            <div key={conversation.id}>{nodeById.get(conversation.id)}</div>
          ))}
        </div>
      )}
    </div>
  );
}
