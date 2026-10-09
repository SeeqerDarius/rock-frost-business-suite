import Link from "next/link";
import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { ArrowLeft, Lock, Megaphone } from "lucide-react";
import { EmptyState } from "@/components/feedback/empty-state";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { CommsFeedback } from "@/components/school/communications";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { listChatContacts, resolveChatViewer } from "@/modules/school/chat-service";
import { isGuardianMessagingAvailable } from "@/modules/school/communications-service";
import { SCHOOL_COMMS_FLASH_COOKIE } from "@/modules/school/communications-flash";
import { broadcastMessageAction } from "../actions";

export default async function SchoolChatBroadcastPage({ searchParams }: { searchParams: Promise<{ sent?: string; error?: string }> }) {
  const [tenant, params] = await Promise.all([requireModuleAccess("school"), searchParams]);
  const viewer = await resolveChatViewer(tenant, (permission) => hasPermission(tenant, permission));
  const back = <Link href="/app/school/chats" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />Chats</Link>;
  if (!viewer || viewer.kind !== "staff" || !viewer.canBroadcast) return <div className="p-6">{back}<EmptyState icon={Lock} title="Broadcasts are restricted" description="Sending broadcast messages needs the School announcements permission." /></div>;
  const [contacts, classes, guardianFeatures] = await Promise.all([
    listChatContacts(viewer),
    db.schoolClass.findMany({ where: { organizationId: tenant.organizationId, active: true }, select: { id: true, name: true, code: true }, orderBy: { name: "asc" } }),
    isGuardianMessagingAvailable(tenant.organizationId),
  ]);
  const flash = params.error ? (await cookies()).get(SCHOOL_COMMS_FLASH_COOKIE)?.value : null;
  const sent = params.sent && /^\d+$/.test(params.sent) ? Number(params.sent) : null;

  return (
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
      {back}
      <div>
        <h2 className="flex items-center gap-2 text-xl font-semibold"><Megaphone className="size-5" />Broadcast message</h2>
        <p className="text-sm text-muted-foreground">Sends the same message to each person in their own chat with you. Replies come back to you privately, like a broadcast list.</p>
      </div>
      <CommsFeedback success={sent !== null ? `Sent to ${sent} ${sent === 1 ? "person" : "people"}.` : null} error={params.error} flash={flash} />
      <form action={broadcastMessageAction} className="max-w-2xl space-y-4">
        <input type="hidden" name="clientRequestId" value={randomUUID()} />
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Send to</legend>
          <label className="flex items-center gap-2 text-sm"><input type="radio" name="audience" value="ALL_STAFF" defaultChecked={!guardianFeatures} className="size-4" />All school staff with messaging</label>
          {guardianFeatures ? (
            <>
              <label className="flex items-center gap-2 text-sm"><input type="radio" name="audience" value="ALL_GUARDIANS" defaultChecked className="size-4" />All guardians you can reach</label>
              <label className="flex flex-wrap items-center gap-2 text-sm"><input type="radio" name="audience" value="CLASS_GUARDIANS" className="size-4" />Guardians of one class:
                <select name="classId" aria-label="Class" defaultValue="" className="h-9 rounded-md border bg-background px-2 text-sm"><option value="">Choose a class</option>{classes.map((schoolClass) => <option key={schoolClass.id} value={schoolClass.id}>{schoolClass.name} ({schoolClass.code})</option>)}</select>
              </label>
            </>
          ) : <p className="text-xs text-muted-foreground">Guardian broadcasts need the Parent and Student portal and Guardian messaging add-ons.</p>}
          <label className="flex items-center gap-2 text-sm"><input type="radio" name="audience" value="SELECTED" className="size-4" />People I choose below</label>
          <div className="max-h-56 space-y-1 overflow-y-auto rounded-md border p-2">
            {contacts.staff.map((member) => <label key={member.userId} className="flex items-center gap-2 rounded px-1 py-0.5 text-sm hover:bg-muted"><input type="checkbox" name="userIds" value={member.userId} className="size-4" />{member.name} <span className="text-xs text-muted-foreground">(staff)</span></label>)}
            {contacts.guardians.map((guardian) => <label key={guardian.userId} className="flex items-center gap-2 rounded px-1 py-0.5 text-sm hover:bg-muted"><input type="checkbox" name="userIds" value={guardian.userId} className="size-4" />{guardian.name} <span className="text-xs text-muted-foreground">(guardian of {guardian.children.join(", ")})</span></label>)}
          </div>
        </fieldset>
        <div className="space-y-1.5">
          <Label htmlFor="broadcast-body" required>Message</Label>
          <textarea id="broadcast-body" name="body" required maxLength={4000} rows={6} className="w-full rounded-md border bg-background px-3 py-2 text-sm" />
        </div>
        <Button type="submit" pendingLabel="Sending...">Send broadcast</Button>
      </form>
    </div>
  );
}
