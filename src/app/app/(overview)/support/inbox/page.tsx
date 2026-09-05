import Link from "next/link";
import { Lock, LifeBuoy, ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SupportChat } from "@/components/support/support-chat";
import { SupportConversationList } from "@/components/support/support-conversation-list";
import { requireCurrentTenant } from "@/lib/tenant";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import * as support from "@/lib/support/service";
import { sendAdminSupportMessage, pollAdminSupportMessages, adminSupportHeartbeat, markAdminSupportRead } from "./actions";

function relativeTime(date: Date) {
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export default async function OrganizationSupportInboxPage({ searchParams }: { searchParams: Promise<{ conversation?: string }> }) {
  const tenant = await requireCurrentTenant();
  if (!hasPermission(tenant, PERMISSIONS.ORG_SETTINGS_MANAGE)) {
    return <EmptyState icon={Lock} title="Access denied" description="Only organization administrators can view every member's support conversation." />;
  }

  const { conversation: requestedConversationId } = await searchParams;
  const conversations = await support.listOrgSupportConversations(tenant.organizationId);
  const selected = conversations.find((c) => c.id === requestedConversationId) ?? conversations[0];

  let initialMessages: ReturnType<typeof support.toChatMessage>[] = [];
  let online = false;
  let initialOtherPartyReadAt: string | null = null;
  if (selected) {
    const { conversation, messages } = await support.listMessagesByConversationId(selected.id);
    initialMessages = messages.map(support.toChatMessage);
    online = selected.userId ? await support.isTenantOnline(selected.userId) : false;
    initialOtherPartyReadAt = conversation ? support.otherPartyReadAt(conversation, "ADMIN") : null;
  }

  const isLegacy = selected?.kind === "LEGACY";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Organization support inbox"
        description="Every support conversation your organization's members have had with the Rock Frost team. Visible only to organization administrators."
        actions={(
          <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/app/support" />}>
            <ArrowLeft className="size-4" />
            Back to my conversation
          </Button>
        )}
      />

      {conversations.length === 0 ? (
        <EmptyState icon={LifeBuoy} title="No support conversations yet" description="When a member of your organization messages the Rock Frost team, it will appear here." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
          <SupportConversationList
            searchPlaceholder="Search by name"
            rows={conversations.map((conversation) => {
              const lastMessage = conversation.messages[0];
              const isSelected = conversation.id === selected?.id;
              const participantLabel = conversation.kind === "LEGACY" ? "Shared history (legacy)" : conversation.user?.name || conversation.user?.email || "Former member";
              return {
                conversation,
                node: (
                  <Link
                    href={`/app/support/inbox?conversation=${conversation.id}`}
                    className={cn(
                      "block rounded-lg border p-3 transition-colors",
                      isSelected ? "border-primary bg-primary/5" : "hover:bg-muted/50",
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="truncate text-sm font-medium">{participantLabel}</p>
                      {conversation.unreadCount > 0 ? <Badge className="shrink-0 text-[10px]">{conversation.unreadCount}</Badge> : null}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {lastMessage ? `${lastMessage.senderRole !== "TENANT" ? `${lastMessage.senderName}: ` : ""}${lastMessage.content}` : "No messages yet"}
                    </p>
                    <div className="mt-1.5 flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px]">{conversation.status}</Badge>
                      {conversation.kind === "LEGACY" ? <Badge variant="outline" className="text-[10px]">Legacy · read-only</Badge> : null}
                      {lastMessage ? <span className="text-[10px] text-muted-foreground">{relativeTime(lastMessage.createdAt)}</span> : null}
                    </div>
                  </Link>
                ),
              };
            })}
          />

          {selected ? (
            <SupportChat
              key={selected.id}
              viewerRole="ADMIN"
              otherPartyLabel={selected.kind === "LEGACY" ? "Shared history (legacy)" : selected.user?.name || selected.user?.email || "Former member"}
              initialMessages={initialMessages}
              initialOnline={online}
              initialOtherPartyReadAt={initialOtherPartyReadAt}
              readOnly={isLegacy}
              readOnlyReason="This conversation predates per-user support threads. It's kept as read-only history; the participant now has their own private conversation."
              onSend={sendAdminSupportMessage.bind(null, selected.id)}
              onPoll={pollAdminSupportMessages.bind(null, selected.id)}
              onHeartbeat={adminSupportHeartbeat}
              onMarkRead={markAdminSupportRead.bind(null, selected.id)}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}
