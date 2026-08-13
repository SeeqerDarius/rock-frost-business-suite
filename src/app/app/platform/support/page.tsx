import Link from "next/link";
import { LifeBuoy } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SupportChat } from "@/components/support/support-chat";
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

export default async function PlatformSupportPage({ searchParams }: { searchParams: Promise<{ org?: string }> }) {
  await requirePlatformOperator();
  const { org: requestedOrgId } = await searchParams;

  const conversations = await support.listPlatformConversations();
  const selected = conversations.find((c) => c.organizationId === requestedOrgId) ?? conversations[0];

  let initialMessages: ReturnType<typeof support.toChatMessage>[] = [];
  let online = false;
  let initialOtherPartyReadAt: string | null = null;
  if (selected) {
    const { conversation, messages } = await support.listSupportMessages(selected.organizationId);
    initialMessages = messages.map(support.toChatMessage);
    online = await support.isTenantOnline(selected.organizationId);
    initialOtherPartyReadAt = conversation ? support.otherPartyReadAt(conversation, "PLATFORM") : null;
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Support" description="Conversations with your tenant organizations. Nothing here is emailed — replies show up in-app for the tenant." />

      {conversations.length === 0 ? (
        <EmptyState icon={LifeBuoy} title="No support conversations yet" description="When a tenant sends a message, it will appear here." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
          <div className="space-y-2">
            {conversations.map((conversation) => {
              const lastMessage = conversation.messages[0];
              const isSelected = conversation.organizationId === selected?.organizationId;
              return (
                <Link
                  key={conversation.id}
                  href={`/app/platform/support?org=${conversation.organizationId}`}
                  className={cn(
                    "block rounded-lg border p-3 transition-colors",
                    isSelected ? "border-primary bg-primary/5" : "hover:bg-muted/50",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="truncate text-sm font-medium">{conversation.organization.name}</p>
                    {conversation.unreadCount > 0 ? <Badge className="shrink-0 text-[10px]">{conversation.unreadCount}</Badge> : null}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {lastMessage ? `${lastMessage.senderRole === "PLATFORM" ? "You: " : ""}${lastMessage.content}` : "No messages yet"}
                  </p>
                  <div className="mt-1.5 flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px]">{conversation.status}</Badge>
                    {lastMessage ? <span className="text-[10px] text-muted-foreground">{relativeTime(lastMessage.createdAt)}</span> : null}
                  </div>
                </Link>
              );
            })}
          </div>

          {selected ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">{selected.organization.tenantCode}</p>
                <form action={setPlatformSupportStatus.bind(null, selected.organizationId, selected.status === "OPEN" ? "RESOLVED" : "OPEN")}>
                  <Button type="submit" size="sm" variant="outline">
                    {selected.status === "OPEN" ? "Mark resolved" : "Reopen"}
                  </Button>
                </form>
              </div>
              <SupportChat
                key={selected.organizationId}
                viewerRole="PLATFORM"
                otherPartyLabel={selected.organization.name}
                initialMessages={initialMessages}
                initialOnline={online}
                initialOtherPartyReadAt={initialOtherPartyReadAt}
                templates={PLATFORM_SUPPORT_TEMPLATES}
                onSend={sendPlatformSupportMessage.bind(null, selected.organizationId)}
                onPoll={pollPlatformSupportMessages.bind(null, selected.organizationId)}
                onHeartbeat={platformSupportHeartbeat}
                onMarkRead={markPlatformSupportRead.bind(null, selected.organizationId)}
              />
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
