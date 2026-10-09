import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission } from "@/lib/auth/permissions";
import { webPushPublicKey } from "@/lib/web-push";
import { ChatSidebar } from "@/components/school/chat/chat-sidebar";
import { LiveRefresh } from "@/components/school/chat/live-refresh";
import { PushToggle } from "@/components/school/chat/push-toggle";
import { listChats, resolveChatViewer } from "@/modules/school/chat-service";

/** Two panes on desktop (chat list and the open chat); one pane at a time on phones. */
export default async function SchoolChatsLayout({ children }: { children: React.ReactNode }) {
  const tenant = await requireModuleAccess("school");
  const viewer = await resolveChatViewer(tenant, (permission) => hasPermission(tenant, permission));
  if (!viewer) return <>{children}</>;
  const [chats, archived] = await Promise.all([listChats(viewer), listChats(viewer, { archived: true })]);

  return (
    <div className="-mx-4 -my-4 flex h-[calc(100dvh-4rem)] min-h-[28rem] overflow-hidden border-y bg-background sm:mx-0 sm:my-0 sm:h-[calc(100dvh-8rem)] sm:rounded-lg sm:border">
      <LiveRefresh intervalMs={8000} />
      <ChatSidebar
        chats={chats.map((chat) => ({ id: chat.id, type: chat.type, title: chat.title, preview: chat.preview, lastMessageAt: chat.lastMessageAt.toISOString(), unread: chat.unread, pinned: chat.pinned, muted: chat.muted }))}
        canCreateGroups={viewer.kind === "staff"}
        canBroadcast={viewer.kind === "staff" && viewer.canBroadcast}
        timeZone={tenant.organization.timezone}
        archivedCount={archived.length}
        pushControl={<PushToggle publicKey={webPushPublicKey()} />}
      />
      <section className="flex min-w-0 flex-1 flex-col">{children}</section>
    </div>
  );
}
