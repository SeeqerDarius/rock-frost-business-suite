/**
 * Pure filtering/grouping helpers shared by the platform inbox
 * (`/app/platform/support`) and the organization admin inbox
 * (`/app/support/inbox`). Kept free of any DB/React dependency so both the
 * client-side search box and its unit tests can exercise the exact same
 * logic the UI runs.
 */

export interface FilterableConversation {
  id: string;
  organizationId: string;
  organization?: { id: string; name: string; tenantCode: string } | null;
  user: { id: string; name: string | null; email: string } | null;
  kind: "INDIVIDUAL" | "LEGACY";
}

/** Case-insensitive substring match against organization name/code and participant name/email. An empty query matches everything. */
export function matchesConversationSearch(conversation: FilterableConversation, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystacks = [
    conversation.organization?.name,
    conversation.organization?.tenantCode,
    conversation.user?.name,
    conversation.user?.email,
  ];
  return haystacks.some((value) => !!value && value.toLowerCase().includes(q));
}

export function filterConversations<T extends FilterableConversation>(conversations: T[], query: string): T[] {
  return conversations.filter((conversation) => matchesConversationSearch(conversation, query));
}

export interface ConversationGroup<T> {
  organizationId: string;
  organizationName: string;
  conversations: T[];
}

/**
 * Groups an already most-recent-first sorted conversation list by
 * organization, without re-sorting — a group's position in the result
 * follows wherever its first (i.e. most recently active) conversation
 * appeared in the input. Used only by the platform inbox, which spans many
 * organizations; the admin inbox is always a single organization and has no
 * use for grouping.
 */
export function groupConversationsByOrganization<T extends FilterableConversation>(conversations: T[]): ConversationGroup<T>[] {
  const order: string[] = [];
  const groups = new Map<string, ConversationGroup<T>>();
  for (const conversation of conversations) {
    let group = groups.get(conversation.organizationId);
    if (!group) {
      group = {
        organizationId: conversation.organizationId,
        organizationName: conversation.organization?.name ?? "Unknown organization",
        conversations: [],
      };
      groups.set(conversation.organizationId, group);
      order.push(conversation.organizationId);
    }
    group.conversations.push(conversation);
  }
  return order.map((organizationId) => groups.get(organizationId)!);
}
