import Link from "next/link";
import { Inbox } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { SupportChat, type SupportChatMessage } from "@/components/support/support-chat";
import { requireCurrentTenant } from "@/lib/tenant";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import * as support from "@/lib/support/service";
import { TENANT_SUPPORT_TEMPLATES } from "@/lib/support/templates";
import { sendTenantSupportMessage, pollTenantSupportMessages, tenantSupportHeartbeat, markTenantSupportRead } from "./actions";

export default async function SupportPage() {
  const tenant = await requireCurrentTenant();
  const [{ conversation, messages }, online] = await Promise.all([
    support.listSupportMessages(tenant.organizationId, tenant.userId),
    support.isPlatformOnline(),
  ]);

  const initialMessages: SupportChatMessage[] = messages.map((message) => ({
    id: message.id,
    content: message.content,
    createdAt: message.createdAt.toISOString(),
    senderRole: message.senderRole,
    senderName: message.senderName,
  }));

  const canViewOrgInbox = hasPermission(tenant, PERMISSIONS.ORG_SETTINGS_MANAGE);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Support"
        description="Reach the Rock Frost team directly: questions, enquiries, or anything that isn't working the way it should. You can also reach us anytime from the chat bubble in the corner of the app. This conversation is private between you and the Rock Frost team."
        actions={canViewOrgInbox ? (
          <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/app/support/inbox" />}>
            <Inbox className="size-4" />
            Organization inbox
          </Button>
        ) : undefined}
      />
      <SupportChat
        viewerRole="TENANT"
        otherPartyLabel="Rock Frost Support"
        initialMessages={initialMessages}
        initialOnline={online}
        initialOtherPartyReadAt={conversation ? support.otherPartyReadAt(conversation, "TENANT") : null}
        templates={TENANT_SUPPORT_TEMPLATES}
        onSend={sendTenantSupportMessage}
        onPoll={pollTenantSupportMessages}
        onHeartbeat={tenantSupportHeartbeat}
        onMarkRead={markTenantSupportRead}
      />
    </div>
  );
}
