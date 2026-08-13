import { PageHeader } from "@/components/layout/page-header";
import { SupportChat, type SupportChatMessage } from "@/components/support/support-chat";
import { requireCurrentTenant } from "@/lib/tenant";
import * as support from "@/lib/support/service";
import { TENANT_SUPPORT_TEMPLATES } from "@/lib/support/templates";
import { sendTenantSupportMessage, pollTenantSupportMessages, tenantSupportHeartbeat, markTenantSupportRead } from "./actions";

export default async function SupportPage() {
  const tenant = await requireCurrentTenant();
  const [{ conversation, messages }, online] = await Promise.all([
    support.listSupportMessages(tenant.organizationId),
    support.isPlatformOnline(),
  ]);

  const initialMessages: SupportChatMessage[] = messages.map((message) => ({
    id: message.id,
    content: message.content,
    createdAt: message.createdAt.toISOString(),
    senderRole: message.senderRole,
    senderName: message.senderName,
  }));

  return (
    <div className="space-y-6">
      <PageHeader title="Support" description="Reach the Rock Frost team directly — questions, enquiries, or anything that isn't working the way it should. You can also reach us anytime from the chat bubble in the corner of the app." />
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
