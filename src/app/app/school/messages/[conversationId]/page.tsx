import Link from "next/link";
import { cookies } from "next/headers";
import { ArrowLeft, Lock, MessageSquareOff } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CommsFeedback, MessageComposer, MessageThread } from "@/components/school/communications";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getStaffConversation, SchoolCommunicationError, staffActorFor } from "@/modules/school/communications-service";
import { SCHOOL_COMMS_FLASH_COOKIE } from "@/modules/school/communications-flash";
import { sendMessageAction, setConversationStatusAction } from "../actions";

export default async function SchoolConversationPage({ params, searchParams }: { params: Promise<{ conversationId: string }>; searchParams: Promise<{ sent?: string; saved?: string; error?: string }> }) {
  const [tenant, { conversationId }, query] = await Promise.all([requireModuleAccess("school"), params, searchParams]);
  const back = <Link href="/app/school/messages" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />All conversations</Link>;
  if (!hasPermission(tenant, PERMISSIONS.SCHOOL_MESSAGES_MANAGE)) {
    return <div className="space-y-6">{back}<EmptyState icon={Lock} title="Messaging is restricted" description="Your role does not include School messaging." /></div>;
  }

  let conversation: Awaited<ReturnType<typeof getStaffConversation>>;
  try {
    conversation = await getStaffConversation(staffActorFor(tenant, (permission) => hasPermission(tenant, permission)), conversationId);
  } catch (error) {
    if (error instanceof SchoolCommunicationError) return <div className="space-y-6">{back}<EmptyState icon={MessageSquareOff} title={error.code === "unavailable" ? "Guardian messaging is not enabled" : "Conversation not found"} description={error.message} /></div>;
    throw error;
  }
  const flash = query.error ? (await cookies()).get(SCHOOL_COMMS_FLASH_COOKIE)?.value : null;
  const closed = conversation.status === "CLOSED";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {back}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader
          title={conversation.subject}
          description={`With ${conversation.guardian.firstName} ${conversation.guardian.lastName} about ${conversation.student.firstName} ${conversation.student.lastName} (${conversation.student.admissionNumber}${conversation.student.className ? `, ${conversation.student.className}` : ""})`}
        />
        <div className="flex items-center gap-2">
          <Badge variant={closed ? "outline" : "secondary"}>{closed ? "Closed" : "Open"}</Badge>
          <form action={setConversationStatusAction}>
            <input type="hidden" name="conversationId" value={conversation.id} />
            <input type="hidden" name="status" value={closed ? "OPEN" : "CLOSED"} />
            <Button type="submit" size="sm" variant="outline">{closed ? "Reopen" : "Close"}</Button>
          </form>
        </div>
      </div>
      <CommsFeedback success={query.sent ? "Message sent." : query.saved ? "Conversation updated." : null} error={query.error} flash={flash} />
      <MessageThread messages={conversation.messages} viewerUserId={tenant.userId} olderMessageCount={conversation.olderMessageCount} timeZone={tenant.organization.timezone} />
      <MessageComposer action={sendMessageAction} conversationId={conversation.id} disabledReason={closed ? "This conversation is closed. Reopen it to reply." : null} />
    </div>
  );
}
