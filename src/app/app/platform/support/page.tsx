import Link from "next/link";
import { LifeBuoy } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SupportChat } from "@/components/support/support-chat";
import { SupportConversationList } from "@/components/support/support-conversation-list";
import { requirePlatformOperator } from "@/lib/auth/module-access";
import * as support from "@/lib/support/service";
import { PLATFORM_SUPPORT_TEMPLATES } from "@/lib/support/templates";
import { sendPlatformSupportMessage, pollPlatformSupportMessages, platformSupportHeartbeat, markPlatformSupportRead, setPlatformSupportStatus } from "./actions";

function relativeTime(date: Date) {
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export default async function PlatformSupportPage({ searchParams }: { searchParams: Promise<{ conversation?: string }> }) {
  await requirePlatformOperator();
  const { conversation: requestedConversationId } = await searchParams;

  const conversations = await support.listPlatformConversations();
  const selected = conversations.find((c) => c.id === requestedConversationId) ?? conversations[0];

  let initialMessages: ReturnType<typeof support.toChatMessage>[] = [];
  let online = false;
  let initialOtherPartyReadAt: string | null = null;
  if (selected) {
    const { conversation, messages } = await support.listMessagesByConversationId(selected.id);
    initialMessages = messages.map(support.toChatMessage);
    online = selected.userId ? await support.isTenantOnline(selected.userId) : false;
    initialOtherPartyReadAt = conversation ? support.otherPartyReadAt(conversation, "PLATFORM") : null;
  }

  const isLegacy = selected?.kind === "LEGACY";

  return (
    <div className="space-y-6">
      <PageHeader title="Support" description="Conversations with your tenant organizations. Nothing here is emailed. Replies show up in-app for the tenant." />

      {conversations.length === 0 ? (
        <EmptyState icon={LifeBuoy} title="No support conversations yet" description="When a tenant sends a message, it will appear here." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
          <SupportConversationList
            conversations={conversations}
            groupByOrganization
            searchPlaceholder="Search by organization or name"
            renderRow={(conversation) => {
              const lastMessage = conversation.messages[0];
              const isSelected = conversation.id === selected?.id;
              const participantLabel = conversation.kind === "LEGACY" ? "Shared history (legacy)" : conversation.user?.name || conversation.user?.email || "Former member";
              return (
                <Link
                  href={`/app/platform/support?conversation=${conversation.id}`}
                  className={cn(
                    "block rounded-lg border p-3 transition-colors",
                    isSelected ? "border-primary bg-primary/5" : "hover:bg-muted/50",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="truncate text-sm font-medium">{conversation.organization.name}</p>
                    {conversation.unreadCount > 0 ? <Badge className="shrink-0 text-[10px]">{conversation.unreadCount}</Badge> : null}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">{participantLabel}</p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {lastMessage ? `${lastMessage.senderRole === "PLATFORM" ? "You: " : ""}${lastMessage.content}` : "No messages yet"}
                  </p>
                  <div className="mt-1.5 flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px]">{conversation.status}</Badge>
                    {conversation.kind === "LEGACY" ? <Badge variant="outline" className="text-[10px]">Legacy · read-only</Badge> : null}
                    {lastMessage ? <span className="text-[10px] text-muted-foreground">{relativeTime(lastMessage.createdAt)}</span> : null}
                  </div>
                </Link>
              );
            }}
          />

          {selected ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  {selected.organization.tenantCode}
                  {selected.kind === "INDIVIDUAL" ? ` · ${selected.user?.name || selected.user?.email || "Former member"}` : ""}
                </p>
                {isLegacy ? null : (
                  <form action={setPlatformSupportStatus.bind(null, selected.id, selected.status === "OPEN" ? "RESOLVED" : "OPEN")}>
                    <Button type="submit" size="sm" variant="outline">
                      {selected.status === "OPEN" ? "Mark resolved" : "Reopen"}
                    </Button>
                  </form>
                )}
              </div>
              <SupportChat
                key={selected.id}
                viewerRole="PLATFORM"
                otherPartyLabel={selected.kind === "LEGACY" ? `${selected.organization.name} (shared history)` : selected.user?.name || selected.organization.name}
                initialMessages={initialMessages}
                initialOnline={online}
                initialOtherPartyReadAt={initialOtherPartyReadAt}
                readOnly={isLegacy}
                readOnlyReason="This conversation predates per-user support threads. It's kept as read-only history and can no longer be replied to; the participant now has their own private conversation."
                templates={PLATFORM_SUPPORT_TEMPLATES}
                onSend={sendPlatformSupportMessage.bind(null, selected.id)}
                onPoll={pollPlatformSupportMessages.bind(null, selected.id)}
                onHeartbeat={platformSupportHeartbeat.bind(null, selected.id)}
                onMarkRead={markPlatformSupportRead.bind(null, selected.id)}
              />
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
