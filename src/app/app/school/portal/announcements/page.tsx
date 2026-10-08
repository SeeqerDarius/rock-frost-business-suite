import Link from "next/link";
import { ArrowLeft, Lock, Megaphone, ShieldOff, Users } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Badge } from "@/components/ui/badge";
import { formatMessageTime } from "@/components/school/communications";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { isSchoolPortalGranted } from "@/lib/platform-communications";
import { cn } from "@/lib/utils";
import { listGuardianAnnouncements, resolveGuardianActor } from "@/modules/school/communications-service";

export default async function PortalAnnouncementsPage() {
  const tenant = await requireModuleAccess("school");
  const back = <Link href="/app/school/portal" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />My Portal</Link>;
  const header = <PageHeader title="Announcements" description="Notices from your children's school." />;
  const blocked = (icon: typeof Lock, title: string, description: string) => <div className="mx-auto max-w-3xl space-y-6">{back}{header}<EmptyState icon={icon} title={title} description={description} /></div>;

  if (!hasPermission(tenant, PERMISSIONS.SCHOOL_PORTAL_VIEW)) return blocked(Lock, "Portal access is restricted", "Your role does not include School portal access.");
  if (!(await isSchoolPortalGranted(tenant.organizationId))) return blocked(ShieldOff, "Not available right now", "This feature is not currently enabled for your school.");
  if (!(await resolveGuardianActor(tenant.organizationId, tenant.userId))) return blocked(Users, "Announcements are for guardians", "Only a guardian account linked by the school office sees announcements here.");

  const announcements = await listGuardianAnnouncements(tenant.organizationId, tenant.userId);
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {back}
      {header}
      {announcements.length === 0 ? <EmptyState icon={Megaphone} title="No announcements" description="Notices from the school will appear here." /> : (
        <ul className="space-y-3" aria-label="Announcements">
          {announcements.map((announcement) => (
            <li key={announcement.id}>
              <article className={cn("rounded-lg border p-4", announcement.unread && "border-primary/40 bg-primary/5")}>
                <header className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h2 className="font-medium">{announcement.title}{announcement.unread ? <span className="sr-only"> (new)</span> : null}</h2>
                    <p className="text-xs text-muted-foreground">{announcement.publishedByName}, <time dateTime={announcement.publishedAt.toISOString()}>{formatMessageTime(announcement.publishedAt, tenant.organization.timezone)}</time>{announcement.class ? `. For ${announcement.class.name}` : ""}</p>
                  </div>
                  {announcement.unread ? <Badge>New</Badge> : null}
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
