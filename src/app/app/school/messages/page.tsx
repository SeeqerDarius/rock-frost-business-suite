import Link from "next/link";
import { cookies } from "next/headers";
import { Lock, MessagesSquare, Plus, ShieldOff } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { EntityDialog } from "@/components/forms/entity-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { CommsFeedback, ConversationList, newRequestId } from "@/components/school/communications";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { cn } from "@/lib/utils";
import { isGuardianMessagingAvailable, listMessageableStudents, listStaffConversations, staffActorFor } from "@/modules/school/communications-service";
import { SCHOOL_COMMS_FLASH_COOKIE } from "@/modules/school/communications-flash";
import { startConversationAction } from "./actions";

const FILTERS = [
  { key: "open", label: "Open", status: "OPEN" as const },
  { key: "closed", label: "Closed", status: "CLOSED" as const },
  { key: "all", label: "All", status: undefined },
];

export default async function SchoolMessagesPage({ searchParams }: { searchParams: Promise<{ status?: string; error?: string }> }) {
  const [tenant, params] = await Promise.all([requireModuleAccess("school"), searchParams]);
  const header = <PageHeader title="Messages" description="Direct in-app conversations with guardians about their children. No SMS or email is sent." />;

  if (!hasPermission(tenant, PERMISSIONS.SCHOOL_MESSAGES_MANAGE)) {
    return <div className="space-y-6">{header}<EmptyState icon={Lock} title="Messaging is restricted" description="Your role does not include School messaging. An administrator can grant it." /></div>;
  }
  if (!(await isGuardianMessagingAvailable(tenant.organizationId))) {
    return <div className="space-y-6">{header}<EmptyState icon={ShieldOff} title="Guardian messaging is not enabled" description="Guardian messaging is an add-on that also needs the Parent and Student portal. Contact Rock Frost to enable it for your school. Announcements are available without it." /></div>;
  }

  const actor = staffActorFor(tenant, (permission) => hasPermission(tenant, permission));
  const filter = FILTERS.find((item) => item.key === params.status) ?? FILTERS[0];
  const [conversations, students] = await Promise.all([listStaffConversations(actor, { status: filter.status }), listMessageableStudents(actor)]);
  const recipients = students.flatMap((student) => student.guardians.map((guardian) => ({ value: `${student.id}:${guardian.id}`, label: `${student.label}: ${guardian.label}` })));
  const flash = params.error ? (await cookies()).get(SCHOOL_COMMS_FLASH_COOKIE)?.value : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        {header}
        <EntityDialog trigger={<Button size="sm"><Plus />New conversation</Button>} title="New conversation" description="Choose a student in your classes and one of their guardians with a portal account." action={startConversationAction} submitLabel="Send">
          <input type="hidden" name="clientRequestId" value={newRequestId()} />
          <div className="space-y-1.5">
            <Label htmlFor="recipient" required>Student and guardian</Label>
            <select id="recipient" name="recipient" required defaultValue="" className="h-10 w-full rounded-md border bg-background px-3 text-sm">
              <option value="" disabled>{recipients.length ? "Choose" : "No guardians with portal accounts in your classes"}</option>
              {recipients.map((recipient) => <option key={recipient.value} value={recipient.value}>{recipient.label}</option>)}
            </select>
          </div>
          <div className="space-y-1.5"><Label htmlFor="subject" required>Subject</Label><Input id="subject" name="subject" required minLength={2} maxLength={120} /></div>
          <div className="space-y-1.5">
            <Label htmlFor="body" required>Message</Label>
            <textarea id="body" name="body" required maxLength={4000} rows={5} className="w-full rounded-md border bg-background px-3 py-2 text-sm" />
          </div>
        </EntityDialog>
      </div>

      <CommsFeedback error={params.error} flash={flash} />

      <nav aria-label="Filter conversations" className="flex gap-2 text-sm">
        {FILTERS.map((item) => <Link key={item.key} href={`/app/school/messages?status=${item.key}`} aria-current={item === filter ? "page" : undefined} className={cn("rounded-md border px-3 py-1", item === filter ? "border-primary bg-primary/10 font-medium" : "hover:bg-muted")}>{item.label}</Link>)}
      </nav>

      {conversations.length === 0 ? (
        <EmptyState icon={MessagesSquare} title="No conversations" description={filter.key === "open" ? "Start a conversation with a guardian, or wait for one to message the school." : "Nothing here yet."} />
      ) : (
        <ConversationList conversations={conversations} hrefBase="/app/school/messages" viewer="staff" timeZone={tenant.organization.timezone} />
      )}
    </div>
  );
}
