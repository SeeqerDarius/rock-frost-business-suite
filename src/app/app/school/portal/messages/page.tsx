import Link from "next/link";
import { cookies } from "next/headers";
import { ArrowLeft, Lock, MessagesSquare, Plus, ShieldOff, Users } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { EntityDialog } from "@/components/forms/entity-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CommsFeedback, ConversationList, newRequestId } from "@/components/school/communications";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { isGuardianMessagingAvailable, listGuardianConversations, listGuardianStudents, resolveGuardianActor } from "@/modules/school/communications-service";
import { SCHOOL_COMMS_FLASH_COOKIE } from "@/modules/school/communications-flash";
import { startGuardianConversationAction } from "./actions";

export default async function PortalMessagesPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const [tenant, params] = await Promise.all([requireModuleAccess("school"), searchParams]);
  const back = <Link href="/app/school/portal" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />My Portal</Link>;
  const header = <PageHeader title="Messages" description="Conversations with your children's school, kept in this app." />;
  const blocked = (icon: typeof Lock, title: string, description: string) => <div className="mx-auto max-w-3xl space-y-6">{back}{header}<EmptyState icon={icon} title={title} description={description} /></div>;

  if (!hasPermission(tenant, PERMISSIONS.SCHOOL_PORTAL_VIEW)) return blocked(Lock, "Portal access is restricted", "Your role does not include School portal access.");
  if (!(await isGuardianMessagingAvailable(tenant.organizationId))) return blocked(ShieldOff, "Messaging is not available", "Your school has not turned on in-app messaging. Contact the school office directly.");
  const guardian = await resolveGuardianActor(tenant.organizationId, tenant.userId);
  if (!guardian) return blocked(Users, "Messaging is for guardians", "Only a guardian account linked by the school office can send messages here.");

  const [conversations, students] = await Promise.all([listGuardianConversations(tenant.organizationId, tenant.userId), listGuardianStudents(tenant.organizationId, tenant.userId)]);
  const flash = params.error ? (await cookies()).get(SCHOOL_COMMS_FLASH_COOKIE)?.value : null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {back}
      <div className="flex flex-wrap items-start justify-between gap-4">
        {header}
        {students.length ? (
          <EntityDialog trigger={<Button size="sm"><Plus />Message the school</Button>} title="Message the school" description="School staff responsible for your child will see and reply to your message." action={startGuardianConversationAction} submitLabel="Send">
            <input type="hidden" name="clientRequestId" value={newRequestId()} />
            <div className="space-y-1.5">
              <Label htmlFor="studentId" required>About</Label>
              <select id="studentId" name="studentId" required defaultValue={students.length === 1 ? students[0].id : ""} className="h-10 w-full rounded-md border bg-background px-3 text-sm">
                {students.length > 1 ? <option value="" disabled>Choose a child</option> : null}
                {students.map((student) => <option key={student.id} value={student.id}>{student.label}</option>)}
              </select>
            </div>
            <div className="space-y-1.5"><Label htmlFor="subject" required>Subject</Label><Input id="subject" name="subject" required minLength={2} maxLength={120} /></div>
            <div className="space-y-1.5">
              <Label htmlFor="body" required>Message</Label>
              <textarea id="body" name="body" required maxLength={4000} rows={5} className="w-full rounded-md border bg-background px-3 py-2 text-sm" />
            </div>
          </EntityDialog>
        ) : null}
      </div>
      <CommsFeedback error={params.error} flash={flash} />
      {conversations.length === 0 ? (
        <EmptyState icon={MessagesSquare} title="No messages yet" description={students.length ? "Start a conversation with the school about your child." : "Ask the school office to link your child to your guardian record."} />
      ) : (
        <ConversationList conversations={conversations} hrefBase="/app/school/portal/messages" viewer="guardian" timeZone={tenant.organization.timezone} />
      )}
    </div>
  );
}
