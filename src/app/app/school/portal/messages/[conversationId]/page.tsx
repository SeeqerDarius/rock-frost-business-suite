import Link from "next/link";
import { cookies } from "next/headers";
import { ArrowLeft, Lock, MessageSquareOff } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Badge } from "@/components/ui/badge";
import { CommsFeedback, MessageComposer, MessageThread } from "@/components/school/communications";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getGuardianConversation, SchoolCommunicationError } from "@/modules/school/communications-service";
import { SCHOOL_COMMS_FLASH_COOKIE } from "@/modules/school/communications-flash";
import { sendGuardianMessageAction } from "../actions";

export default async function PortalConversationPage({ params, searchParams }: { params: Promise<{ conversationId: string }>; searchParams: Promise<{ sent?: string; error?: string }> }) {
  const [tenant, { conversationId }, query] = await Promise.all([requireModuleAccess("school"), params, searchParams]);
  const back = <Link href="/app/school/portal/messages" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />All messages</Link>;
  if (!hasPermission(tenant, PERMISSIONS.SCHOOL_PORTAL_VIEW)) {
    return <div className="mx-auto max-w-3xl space-y-6">{back}<EmptyState icon={Lock} title="Portal access is restricted" description="Your role does not include School portal access." /></div>;
  }

  let conversation: Awaited<ReturnType<typeof getGuardianConversation>>;
  try {
    conversation = await getGuardianConversation(tenant.organizationId, tenant.userId, conversationId);
  } catch (error) {
    if (error instanceof SchoolCommunicationError) return <div className="mx-auto max-w-3xl space-y-6">{back}<EmptyState icon={MessageSquareOff} title={error.code === "unavailable" ? "Messaging is not available" : "Conversation not found"} description={error.message} /></div>;
    throw error;
  }
  const flash = query.error ? (await cookies()).get(SCHOOL_COMMS_FLASH_COOKIE)?.value : null;
  const closed = conversation.status === "CLOSED";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {back}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader title={conversation.subject} description={`About ${conversation.student.firstName} ${conversation.student.lastName}${conversation.student.className ? ` (${conversation.student.className})` : ""}`} />
        <Badge variant={closed ? "outline" : "secondary"}>{closed ? "Closed" : "Open"}</Badge>
      </div>
      <CommsFeedback success={query.sent ? "Message sent." : null} error={query.error} flash={flash} />
      <MessageThread messages={conversation.messages} viewerUserId={tenant.userId} olderMessageCount={conversation.olderMessageCount} timeZone={tenant.organization.timezone} />
      <MessageComposer action={sendGuardianMessageAction} conversationId={conversation.id} disabledReason={closed ? "The school closed this conversation. Start a new one from Messages if you need to." : null} />
    </div>
  );
}
