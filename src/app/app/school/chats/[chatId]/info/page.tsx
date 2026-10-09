import Link from "next/link";
import { cookies } from "next/headers";
import { ArrowLeft, Lock, MessageSquareOff, ShieldCheck } from "lucide-react";
import { EmptyState } from "@/components/feedback/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CommsFeedback } from "@/components/school/communications";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission } from "@/lib/auth/permissions";
import { getChat, listChatContacts, resolveChatViewer, SchoolChatError } from "@/modules/school/chat-service";
import { SCHOOL_COMMS_FLASH_COOKIE } from "@/modules/school/communications-flash";
import { addGroupMembersAction, leaveChatAction, removeGroupMemberAction, setGroupAdminAction, updateGroupSettingsAction } from "../../actions";

export default async function SchoolChatInfoPage({ params, searchParams }: { params: Promise<{ chatId: string }>; searchParams: Promise<{ error?: string; saved?: string }> }) {
  const [tenant, { chatId }, query] = await Promise.all([requireModuleAccess("school"), params, searchParams]);
  const viewer = await resolveChatViewer(tenant, (permission) => hasPermission(tenant, permission));
  const back = <Link href={`/app/school/chats/${chatId}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />Back to chat</Link>;
  if (!viewer) return <div className="p-6"><EmptyState icon={Lock} title="Chats are not available to you" description="Your role does not include School chat." /></div>;
  let chat: Awaited<ReturnType<typeof getChat>>;
  try {
    chat = await getChat(viewer, chatId);
  } catch (error) {
    if (error instanceof SchoolChatError) return <div className="p-6">{back}<EmptyState icon={MessageSquareOff} title="Chat not found" description={error.message} /></div>;
    throw error;
  }
  if (chat.type !== "GROUP") return <div className="p-6">{back}<EmptyState icon={MessageSquareOff} title="Not a group" description="Group info is only for group chats." /></div>;
  const contacts = chat.canManage ? await listChatContacts(viewer) : { staff: [], guardians: [] };
  const memberIds = new Set(chat.members.map((member) => member.userId));
  const candidates = [
    ...contacts.staff.filter((member) => !memberIds.has(member.userId)).map((member) => ({ userId: member.userId, label: `${member.name} (staff)` })),
    ...contacts.guardians.filter((guardian) => !memberIds.has(guardian.userId)).map((guardian) => ({ userId: guardian.userId, label: `${guardian.name} (guardian of ${guardian.children.join(", ")})` })),
  ];
  const flash = query.error ? (await cookies()).get(SCHOOL_COMMS_FLASH_COOKIE)?.value : null;

  return (
    <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-4 sm:p-6">
      {back}
      <div>
        <h2 className="text-xl font-semibold">{chat.title}</h2>
        {chat.description ? <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{chat.description}</p> : null}
        <p className="mt-1 text-xs text-muted-foreground">{chat.members.length} members{chat.onlyAdminsCanPost ? ". Only admins can send messages." : ""}</p>
      </div>
      <CommsFeedback success={query.saved ? "Saved." : null} error={query.error} flash={flash} />

      {chat.canManage ? (
        <section className="space-y-3 rounded-lg border p-4" aria-labelledby="settings-heading">
          <h3 id="settings-heading" className="font-medium">Group settings</h3>
          <form action={updateGroupSettingsAction} className="space-y-3">
            <input type="hidden" name="chatId" value={chat.id} />
            <div className="space-y-1.5"><Label htmlFor="group-name" required>Name</Label><Input id="group-name" name="name" defaultValue={chat.title} required minLength={2} maxLength={80} /></div>
            <div className="space-y-1.5"><Label htmlFor="group-description">Description</Label><textarea id="group-description" name="description" defaultValue={chat.description ?? ""} maxLength={500} rows={3} className="w-full rounded-md border bg-background px-3 py-2 text-sm" /></div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="onlyAdminsCanPost" defaultChecked={chat.onlyAdminsCanPost} className="size-4" />Only admins can send messages (announcement group)</label>
            <Button type="submit" size="sm">Save settings</Button>
          </form>
        </section>
      ) : null}

      <section className="space-y-3" aria-labelledby="members-heading">
        <h3 id="members-heading" className="font-medium">Members</h3>
        <ul className="divide-y rounded-lg border">
          {chat.members.map((member) => (
            <li key={member.userId} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
              <span className="flex items-center gap-2">
                <span className="font-medium">{member.isYou ? "You" : member.name}</span>
                <Badge variant="outline">{member.side === "GUARDIAN" ? "Guardian" : "Staff"}</Badge>
                {member.role === "ADMIN" ? <Badge variant="secondary"><ShieldCheck className="size-3" />Admin</Badge> : null}
              </span>
              {chat.canManage && !member.isYou ? (
                <span className="flex gap-1">
                  {member.side === "STAFF" ? (
                    <form action={setGroupAdminAction}><input type="hidden" name="chatId" value={chat.id} /><input type="hidden" name="userId" value={member.userId} /><input type="hidden" name="admin" value={member.role === "ADMIN" ? "false" : "true"} /><Button type="submit" size="sm" variant="ghost">{member.role === "ADMIN" ? "Remove admin" : "Make admin"}</Button></form>
                  ) : null}
                  <form action={removeGroupMemberAction}><input type="hidden" name="chatId" value={chat.id} /><input type="hidden" name="userId" value={member.userId} /><Button type="submit" size="sm" variant="ghost" className="text-destructive">Remove</Button></form>
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      {chat.canManage ? (
        <section className="space-y-3 rounded-lg border p-4" aria-labelledby="add-heading">
          <h3 id="add-heading" className="font-medium">Add members</h3>
          {candidates.length === 0 ? <p className="text-sm text-muted-foreground">Everyone you can reach is already in this group.</p> : (
            <form action={addGroupMembersAction} className="space-y-3">
              <input type="hidden" name="chatId" value={chat.id} />
              <fieldset className="max-h-64 space-y-1 overflow-y-auto rounded-md border p-2">
                <legend className="sr-only">People to add</legend>
                {candidates.map((candidate) => <label key={candidate.userId} className="flex items-center gap-2 rounded px-1 py-1 text-sm hover:bg-muted"><input type="checkbox" name="memberUserIds" value={candidate.userId} className="size-4" />{candidate.label}</label>)}
              </fieldset>
              <Button type="submit" size="sm">Add selected</Button>
            </form>
          )}
        </section>
      ) : null}

      <form action={leaveChatAction}>
        <input type="hidden" name="chatId" value={chat.id} />
        <Button type="submit" variant="outline" className="text-destructive">Leave group</Button>
      </form>
    </div>
  );
}
