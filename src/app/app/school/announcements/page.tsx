import { cookies } from "next/headers";
import { Lock, Megaphone, Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { EntityDialog } from "@/components/forms/entity-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CommsFeedback, formatMessageTime, newRequestId } from "@/components/school/communications";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { cn } from "@/lib/utils";
import { AUDIENCE_LABEL, listStaffAnnouncements, staffActorFor } from "@/modules/school/communications-service";
import { SCHOOL_COMMS_FLASH_COOKIE } from "@/modules/school/communications-flash";
import { publishAnnouncementAction, withdrawAnnouncementAction } from "./actions";

export default async function SchoolAnnouncementsPage({ searchParams }: { searchParams: Promise<{ saved?: string; withdrawn?: string; error?: string }> }) {
  const [tenant, params] = await Promise.all([requireModuleAccess("school"), searchParams]);
  const header = <PageHeader title="Announcements" description="School notices shown in the app to staff and, through the portal, to guardians. No SMS or email is sent." />;
  if (!hasPermission(tenant, PERMISSIONS.SCHOOL_VIEW)) {
    return <div className="space-y-6">{header}<EmptyState icon={Lock} title="Announcements are restricted" description="Your role does not include School access." /></div>;
  }

  const actor = staffActorFor(tenant, (permission) => hasPermission(tenant, permission));
  const [announcements, classes] = await Promise.all([
    listStaffAnnouncements(actor),
    actor.canPublishAnnouncements ? db.schoolClass.findMany({ where: { organizationId: tenant.organizationId, active: true }, select: { id: true, name: true, code: true }, orderBy: { name: "asc" } }) : Promise.resolve([]),
  ]);
  const flash = params.error ? (await cookies()).get(SCHOOL_COMMS_FLASH_COOKIE)?.value : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        {header}
        {actor.canPublishAnnouncements ? (
          <EntityDialog trigger={<Button size="sm"><Plus />New announcement</Button>} title="Publish an announcement" description="Guardians see it in My Portal when the Parent and Student portal is enabled." action={publishAnnouncementAction} submitLabel="Publish">
            <input type="hidden" name="clientRequestId" value={newRequestId()} />
            <div className="space-y-1.5"><Label htmlFor="title" required>Title</Label><Input id="title" name="title" required minLength={2} maxLength={120} /></div>
            <div className="space-y-1.5">
              <Label htmlFor="body" required>Announcement</Label>
              <textarea id="body" name="body" required maxLength={4000} rows={6} className="w-full rounded-md border bg-background px-3 py-2 text-sm" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="audience" required>Audience</Label>
                <select id="audience" name="audience" required defaultValue="ALL_GUARDIANS" className="h-10 w-full rounded-md border bg-background px-3 text-sm">
                  {Object.entries(AUDIENCE_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="classId">Class (for a class audience)</Label>
                <select id="classId" name="classId" defaultValue="" className="h-10 w-full rounded-md border bg-background px-3 text-sm">
                  <option value="">None</option>
                  {classes.map((schoolClass) => <option key={schoolClass.id} value={schoolClass.id}>{schoolClass.name} ({schoolClass.code})</option>)}
                </select>
              </div>
            </div>
          </EntityDialog>
        ) : null}
      </div>

      <CommsFeedback success={params.saved ? "Announcement published." : params.withdrawn ? "Announcement withdrawn." : null} error={params.error} flash={flash} />

      {announcements.length === 0 ? (
        <EmptyState icon={Megaphone} title="No announcements yet" description={actor.canPublishAnnouncements ? "Publish the first announcement for staff or guardians." : "Announcements from the school office will appear here."} />
      ) : (
        <ul className="space-y-3" aria-label="Announcements">
          {announcements.map((announcement) => (
            <li key={announcement.id}>
              <article className={cn("rounded-lg border p-4", announcement.withdrawnAt && "opacity-60", announcement.unread && "border-primary/40 bg-primary/5")}>
                <header className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h2 className="font-medium">{announcement.title}{announcement.unread ? <span className="sr-only"> (new)</span> : null}</h2>
                    <p className="text-xs text-muted-foreground">
                      {announcement.publishedByName}, <time dateTime={announcement.publishedAt.toISOString()}>{formatMessageTime(announcement.publishedAt, tenant.organization.timezone)}</time>
                      {announcement.readCount !== null ? `. Read by ${announcement.readCount}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {announcement.unread ? <Badge>New</Badge> : null}
                    <Badge variant="outline">{AUDIENCE_LABEL[announcement.audience]}{announcement.class ? `: ${announcement.class.name}` : ""}</Badge>
                    {announcement.withdrawnAt ? <Badge variant="destructive">Withdrawn</Badge> : actor.canPublishAnnouncements ? (
                      <form action={withdrawAnnouncementAction}>
                        <input type="hidden" name="announcementId" value={announcement.id} />
                        <Button type="submit" size="sm" variant="ghost">Withdraw</Button>
                      </form>
                    ) : null}
                  </div>
                </header>
                <p className="mt-2 whitespace-pre-wrap break-words text-sm">{announcement.body}</p>
              </article>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
