import { cookies } from "next/headers";
import { Lock, MessagesSquare } from "lucide-react";
import { EmptyState } from "@/components/feedback/empty-state";
import { CommsFeedback } from "@/components/school/communications";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission } from "@/lib/auth/permissions";
import { resolveChatViewer } from "@/modules/school/chat-service";
import { SCHOOL_COMMS_FLASH_COOKIE } from "@/modules/school/communications-flash";

export default async function SchoolChatsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const [tenant, params] = await Promise.all([requireModuleAccess("school"), searchParams]);
  const viewer = await resolveChatViewer(tenant, (permission) => hasPermission(tenant, permission));
  if (!viewer) {
    return <div className="p-6"><EmptyState icon={Lock} title="Chats are not available to you" description="School chat is for staff with School messaging, and for guardians once the school turns on Guardian messaging." /></div>;
  }
  const flash = params.error ? (await cookies()).get(SCHOOL_COMMS_FLASH_COOKIE)?.value : null;
  return (
    <div className="hidden flex-1 flex-col items-center justify-center gap-3 p-6 text-center md:flex">
      <CommsFeedback error={params.error} flash={flash} />
      <MessagesSquare className="size-12 text-muted-foreground" aria-hidden />
      <h2 className="text-lg font-semibold">School chat</h2>
      <p className="max-w-sm text-sm text-muted-foreground">Pick a chat on the left, or start a new one. Messages stay inside the app; turn on notifications to hear about new ones.</p>
    </div>
  );
}
