import Link from "next/link";
import { cookies } from "next/headers";
import { ArrowLeft, Lock, MessageCircle, Users } from "lucide-react";
import { EmptyState } from "@/components/feedback/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CommsFeedback } from "@/components/school/communications";
import { initials } from "@/components/school/chat/chat-sidebar";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission } from "@/lib/auth/permissions";
import { cn } from "@/lib/utils";
import { listChatContacts, resolveChatViewer } from "@/modules/school/chat-service";
import { SCHOOL_COMMS_FLASH_COOKIE } from "@/modules/school/communications-flash";
import { createGroupChatAction, startDirectChatAction } from "../actions";

export default async function NewSchoolChatPage({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string; error?: string }> }) {
  const [tenant, params] = await Promise.all([requireModuleAccess("school"), searchParams]);
  const viewer = await resolveChatViewer(tenant, (permission) => hasPermission(tenant, permission));
  const back = <Link href="/app/school/chats" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />Chats</Link>;
  if (!viewer) return <div className="p-6"><EmptyState icon={Lock} title="Chats are not available to you" description="Your role does not include School chat." /></div>;
  const groupTab = params.tab === "group" && viewer.kind === "staff";
  const contacts = await listChatContacts(viewer);
  const q = params.q?.trim().toLowerCase() ?? "";
  const staff = contacts.staff.filter((member) => !q || member.name.toLowerCase().includes(q));
  const guardians = contacts.guardians.filter((guardian) => !q || guardian.name.toLowerCase().includes(q) || guardian.children.some((child) => child.toLowerCase().includes(q)));
  const flash = params.error ? (await cookies()).get(SCHOOL_COMMS_FLASH_COOKIE)?.value : null;

  const person = (userId: string, name: string, detail: string) => (
    <li key={userId}>
      <form action={startDirectChatAction}>
        <input type="hidden" name="userId" value={userId} />
        <button className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-muted">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary" aria-hidden>{initials(name)}</span>
          <span className="min-w-0"><span className="block truncate text-sm font-medium">{name}</span><span className="block truncate text-xs text-muted-foreground">{detail}</span></span>
        </button>
      </form>
    </li>
  );

  return (
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
      {back}
      <div className="flex gap-2" role="tablist" aria-label="New chat type">
        <Link href="/app/school/chats/new" role="tab" aria-selected={!groupTab} className={cn("flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm", !groupTab ? "border-primary bg-primary/10 font-medium" : "hover:bg-muted")}><MessageCircle className="size-4" />New chat</Link>
        {viewer.kind === "staff" ? <Link href="/app/school/chats/new?tab=group" role="tab" aria-selected={groupTab} className={cn("flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm", groupTab ? "border-primary bg-primary/10 font-medium" : "hover:bg-muted")}><Users className="size-4" />New group</Link> : null}
      </div>
      <CommsFeedback error={params.error} flash={flash} />

      <form role="search" className="max-w-md">
        {groupTab ? <input type="hidden" name="tab" value="group" /> : null}
        <Label htmlFor="contact-search" className="sr-only">Search people</Label>
        <Input id="contact-search" name="q" defaultValue={params.q ?? ""} placeholder={viewer.kind === "staff" ? "Search staff, guardians, or a child's name" : "Search staff"} />
      </form>

      {groupTab ? (
        <form action={createGroupChatAction} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5"><Label htmlFor="group-name" required>Group name</Label><Input id="group-name" name="name" required minLength={2} maxLength={80} placeholder="e.g. Class 4A parents" /></div>
            <div className="space-y-1.5"><Label htmlFor="group-description">Description</Label><Input id="group-description" name="description" maxLength={500} /></div>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="onlyAdminsCanPost" className="size-4" />Only admins can send messages (announcement group)</label>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Members</legend>
            <div className="max-h-[50vh] space-y-3 overflow-y-auto rounded-md border p-2">
              {staff.length ? <div><p className="px-1 text-xs font-semibold uppercase text-muted-foreground">Staff</p>{staff.map((member) => <label key={member.userId} className="flex items-center gap-2 rounded px-1 py-1 text-sm hover:bg-muted"><input type="checkbox" name="memberUserIds" value={member.userId} className="size-4" />{member.name}{member.roleName ? <span className="text-xs text-muted-foreground">({member.roleName})</span> : null}</label>)}</div> : null}
              {guardians.length ? <div><p className="px-1 text-xs font-semibold uppercase text-muted-foreground">Guardians</p>{guardians.map((guardian) => <label key={guardian.userId} className="flex items-center gap-2 rounded px-1 py-1 text-sm hover:bg-muted"><input type="checkbox" name="memberUserIds" value={guardian.userId} className="size-4" />{guardian.name}<span className="text-xs text-muted-foreground">(guardian of {guardian.children.join(", ")})</span></label>)}</div> : null}
              {!staff.length && !guardians.length ? <p className="p-2 text-sm text-muted-foreground">Nobody matches.</p> : null}
            </div>
          </fieldset>
          <Button type="submit">Create group</Button>
        </form>
      ) : (
        <div className="space-y-4">
          {staff.length ? <section aria-labelledby="staff-heading"><h3 id="staff-heading" className="mb-1 text-xs font-semibold uppercase text-muted-foreground">{viewer.kind === "guardian" ? "Your children's school staff" : "Staff"}</h3><ul className="divide-y rounded-lg border">{staff.map((member) => person(member.userId, member.name, member.roleName ?? "School staff"))}</ul></section> : null}
          {guardians.length ? <section aria-labelledby="guardian-heading"><h3 id="guardian-heading" className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Guardians</h3><ul className="divide-y rounded-lg border">{guardians.map((guardian) => person(guardian.userId, guardian.name, `Guardian of ${guardian.children.join(", ")}`))}</ul></section> : null}
          {!staff.length && !guardians.length ? <EmptyState icon={MessageCircle} title="Nobody to message yet" description={viewer.kind === "guardian" ? "Ask the school office to link your child to your account." : "Staff need the School messaging permission, and guardians need a portal account and the Guardian messaging add-on."} /> : null}
        </div>
      )}
    </div>
  );
}
