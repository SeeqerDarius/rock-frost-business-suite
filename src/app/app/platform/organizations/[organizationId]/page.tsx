import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/db";
import { requirePlatformOperator } from "@/lib/auth/module-access";
import { isPlatformAnchorOrganization } from "@/lib/platform-organizations";
import { catalogueModuleKeys } from "@/platform/modules/registry";
import { resolveOfflinePolicy } from "@/lib/pwa/policy";
import { getOrganizationHealthSnapshot } from "@/platform/organizations/health";
import { getOrganizationSeatUsage } from "@/platform/subscriptions/seats";
import { organizationDetailInclude } from "./sections/data";
import { OverviewSection } from "./sections/overview-section";
import { PlanSection } from "./sections/plan-section";
import { FeaturesSection } from "./sections/features-section";
import { MembersSection } from "./sections/members-section";
import { ProfileSection } from "./sections/profile-section";
import { LifecycleSection } from "./sections/lifecycle-section";

/**
 * The Organization Configuration pane. This page used to be twelve sibling
 * cards in one vertical scroll, where a module toggle, a marketing quote, a
 * paid add-on grant, and permanent deletion all looked alike and sat the same
 * distance apart. It is now one section at a time, addressed by `?section=`
 * the same way the School student profile is, so a link to a section is
 * shareable and the browser Back button behaves.
 *
 * Section order follows how often an operator needs each one, not how the
 * data model is shaped: look first, then plan, then what the customer can
 * open, then who they are, with the two destructive surfaces last and behind
 * their own click.
 */
const SECTIONS = [
  ["overview", "Overview"],
  ["plan", "Plan and billing"],
  ["features", "Modules and features"],
  ["members", "Members and access"],
  ["profile", "Profile and showcase"],
  ["lifecycle", "Lifecycle and deletion"],
] as const;

type SectionKey = (typeof SECTIONS)[number][0];

const ERRORS: Record<string, string> = {
  invalid: "Check the submitted values.",
  "tenant-code": "That tenant code is already assigned to another organization.",
  "platform-anchor": "This organization contains an active system Super Admin and is protected from destructive lifecycle changes.",
  confirmation: "The tenant-code confirmation did not match.",
  "wrong-password": "Your current password was incorrect.",
  "not-ready": "Permanent deletion is unavailable until the scheduled recovery period expires.",
  invitation: "The invitation could not be resent yet. It may no longer be pending or may be in its resend cooldown.",
  delivery: "The invitation was refreshed, but email delivery failed.",
  "showcase-invalid": "Add an approved customer quote and attribution before publishing this organization.",
  "showcase-logo": "Upload the organization's approved logo before publishing it on the home page.",
};

/**
 * Which section a redirect-back notice belongs to, so the operator lands
 * where the change happened. The Server Actions redirect with only their own
 * notice parameter (`?saved=1`, `?error=wrong-password`), which predates this
 * pane and stays that way: mapping the parameter here keeps every existing
 * redirect target valid and every bookmarked notice URL working.
 */
const NOTICE_SECTIONS: Record<string, SectionKey> = {
  saved: "profile",
  showcase: "profile",
  invitation: "members",
  status: "lifecycle",
  deletion: "lifecycle",
};

const ERROR_SECTIONS: Record<string, SectionKey> = {
  "tenant-code": "profile",
  "showcase-invalid": "profile",
  "showcase-logo": "profile",
  invitation: "members",
  delivery: "members",
  "platform-anchor": "lifecycle",
  confirmation: "lifecycle",
  "wrong-password": "lifecycle",
  "not-ready": "lifecycle",
};

export default async function OrganizationDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ organizationId: string }>;
  searchParams: Promise<{
    section?: string;
    created?: string;
    delivery?: string;
    saved?: string;
    status?: string;
    deletion?: string;
    invitation?: string;
    showcase?: string;
    error?: string;
  }>;
}) {
  await requirePlatformOperator();
  const { organizationId } = await params;
  if (await isPlatformAnchorOrganization(organizationId)) notFound();
  const notices = await searchParams;
  const [organization, modules, health, seatUsage] = await Promise.all([
    db.organization.findUnique({ where: { id: organizationId }, include: organizationDetailInclude }),
    db.module.findMany({
      where: { status: "ACTIVE", code: { in: [...catalogueModuleKeys] } },
      orderBy: { name: "asc" },
      select: { id: true, code: true, name: true },
    }),
    getOrganizationHealthSnapshot(organizationId),
    getOrganizationSeatUsage(organizationId),
  ]);
  if (!organization) notFound();

  // An explicit ?section= wins; otherwise a notice takes the operator back to
  // the section that produced it.
  const noticeSection =
    (notices.error ? ERROR_SECTIONS[notices.error] : undefined) ??
    Object.entries(NOTICE_SECTIONS).find(([parameter]) => notices[parameter as keyof typeof notices])?.[1];
  const section: SectionKey = SECTIONS.some(([key]) => key === notices.section)
    ? (notices.section as SectionKey)
    : (noticeSection ?? "overview");

  const sectionHref = (target: string) => `/app/platform/organizations/${organization.id}?section=${target}`;
  const enabledModuleKeys = organization.organizationModules
    .filter((assignment) => assignment.enabled)
    .map((assignment) => assignment.module.code);
  const deletionReady = Boolean(organization.deletionScheduledFor && organization.deletionScheduledFor <= new Date());
  const offlinePolicy = resolveOfflinePolicy(organization.metadata);

  return (
    <div className="space-y-6">
      <PageHeader
        title={organization.name}
        description={`Tenant code ${organization.tenantCode} · ${organization.currency} · ${organization.timezone}`}
        actions={
          <>
            <Badge variant={organization.status === "ACTIVE" ? "default" : "outline"}>{organization.status}</Badge>
            <Button variant="outline" nativeButton={false} render={<Link href="/app/platform/organizations" />}>
              All organizations
            </Button>
          </>
        }
      />

      {organization.deletionScheduledFor ? (
        <Alert variant="destructive">
          <AlertTitle>Deletion scheduled for {organization.deletionScheduledFor.toLocaleString()}</AlertTitle>
          <AlertDescription>
            Tenant access is cancelled. Restore the organization from Lifecycle and deletion before this date to retain it.
          </AlertDescription>
        </Alert>
      ) : null}

      {notices.created ? (
        <Alert>
          <AlertTitle>Organization created</AlertTitle>
          <AlertDescription>The trial tenant and owner invitation were created.</AlertDescription>
        </Alert>
      ) : null}
      {notices.delivery === "failed" ? (
        <Alert variant="destructive">
          <AlertTitle>Invitation delivery failed</AlertTitle>
          <AlertDescription>
            The invitation is stored, but email delivery is not configured or failed. Resend it from Members and access.
          </AlertDescription>
        </Alert>
      ) : null}
      {notices.saved || notices.status ? (
        <Alert>
          <AlertTitle>Organization updated</AlertTitle>
          <AlertDescription>The latest organization settings are active.</AlertDescription>
        </Alert>
      ) : null}
      {notices.invitation === "resent" ? (
        <Alert>
          <AlertTitle>Invitation resent</AlertTitle>
          <AlertDescription>A new seven-day invitation link was sent.</AlertDescription>
        </Alert>
      ) : null}
      {notices.showcase === "updated" ? (
        <Alert>
          <AlertTitle>Customer showcase updated</AlertTitle>
          <AlertDescription>The public home page now reflects this organization&apos;s approved showcase settings.</AlertDescription>
        </Alert>
      ) : null}
      {notices.deletion === "scheduled" ? (
        <Alert variant="destructive">
          <AlertTitle>Deletion scheduled</AlertTitle>
          <AlertDescription>
            The organization is cancelled and remains recoverable until the scheduled deletion date.
          </AlertDescription>
        </Alert>
      ) : null}
      {notices.deletion === "cancelled" ? (
        <Alert>
          <AlertTitle>Deletion cancelled</AlertTitle>
          <AlertDescription>The organization was restored to its previous status.</AlertDescription>
        </Alert>
      ) : null}
      {notices.error && ERRORS[notices.error] ? (
        <Alert variant="destructive">
          <AlertTitle>Action failed</AlertTitle>
          <AlertDescription>{ERRORS[notices.error]}</AlertDescription>
        </Alert>
      ) : null}

      <nav aria-label="Organization configuration sections" className="flex gap-2 overflow-x-auto border-b pb-2">
        {SECTIONS.map(([key, label]) => (
          <Button
            key={key}
            size="sm"
            variant={section === key ? "default" : "ghost"}
            nativeButton={false}
            aria-current={section === key ? "page" : undefined}
            render={<Link href={sectionHref(key)} />}
          >
            {label}
          </Button>
        ))}
      </nav>

      {section === "overview" ? (
        <OverviewSection
          organization={organization}
          health={health}
          enabledModuleKeys={enabledModuleKeys}
          sectionHref={sectionHref}
        />
      ) : null}
      {section === "plan" ? <PlanSection organization={organization} seatUsage={seatUsage} /> : null}
      {section === "features" ? (
        <FeaturesSection
          organization={organization}
          modules={modules}
          enabledModuleKeys={enabledModuleKeys}
          offlinePolicy={offlinePolicy}
        />
      ) : null}
      {section === "members" ? <MembersSection organization={organization} /> : null}
      {section === "profile" ? <ProfileSection organization={organization} /> : null}
      {section === "lifecycle" ? <LifecycleSection organization={organization} deletionReady={deletionReady} /> : null}
    </div>
  );
}
