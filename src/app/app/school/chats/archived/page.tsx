import Link from "next/link";
import { Archive, ArrowLeft, Lock } from "lucide-react";
import { EmptyState } from "@/components/feedback/empty-state";
import { Badge } from "@/components/ui/badge";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission } from "@/lib/auth/permissions";
import { listChats, resolveChatViewer } from "@/modules/school/chat-service";
import { setChatPreferencesAction } from "../actions";

export default async function ArchivedSchoolChatsPage() {
  const tenant = await requireModuleAccess("school");
  const viewer = await resolveChatViewer(tenant, (permission) => hasPermission(tenant, permission));
  const back = <Link href="/app/school/chats" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />Chats</Link>;
  if (!viewer) return <div className="p-6"><EmptyState icon={Lock} title="Chats are not available to you" description="Your role does not include School chat." /></div>;
  const chats = await listChats(viewer, { archived: true });
  return (
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
      {back}
      <h2 className="flex items-center gap-2 text-xl font-semibold"><Archive className="size-5" />Archived chats</h2>
      <p className="text-sm text-muted-foreground">An archived chat comes back to your list when someone sends a new message.</p>
      {chats.length === 0 ? <EmptyState icon={Archive} title="No archived chats" description="Archive a chat from its options menu." /> : (
        <ul className="divide-y rounded-lg border">
          {chats.map((chat) => (
            <li key={chat.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <Link href={`/app/school/chats/${chat.id}`} className="min-w-0 flex-1 hover:underline"><span className="block truncate text-sm font-medium">{chat.title}</span><span className="block truncate text-xs text-muted-foreground">{chat.preview}</span></Link>
              {chat.unread ? <Badge>{chat.unread}</Badge> : null}
              <form action={setChatPreferencesAction}><input type="hidden" name="chatId" value={chat.id} /><input type="hidden" name="preference" value="unarchive" /><button className="text-sm text-primary hover:underline">Unarchive</button></form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
