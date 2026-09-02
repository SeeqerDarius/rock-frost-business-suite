import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { db } from "@/lib/db";
import { requirePlatformOperator } from "@/lib/auth/module-access";
import { isPlatformAnchorOrganization } from "@/lib/platform-organizations";
import { readPublicShowcase } from "@/lib/public-showcase";
import { MODULE_REQUEST_STATUS_LABELS, MODULE_REQUEST_TYPE_LABELS } from "@/platform/module-requests/constants";
import { catalogueModuleKeys } from "@/platform/modules/registry";
import { productGroupKeys } from "@/platform/modules/product-groups";
import { resolveOfflinePolicy, OFFLINE_SUPPORTED_MODULES } from "@/lib/pwa/policy";
import { getOrganizationHealthSnapshot } from "@/platform/organizations/health";
import { ModuleToggle } from "../module-toggle";
import { OfflineAccessToggle } from "../offline-access-toggle";
import {
  permanentlyDeleteOrganization,
  resendOrganizationInvitation,
  restoreOrganization,
  scheduleOrganizationDeletion,
  updateOrganizationProfile,
  updateOrganizationPublicShowcase,
  updateOrganizationStatus,
} from "../actions";

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

export default async function OrganizationDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ organizationId: string }>;
  searchParams: Promise<{
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
  const [organization, modules, health] = await Promise.all([
    db.organization.findUnique({
      where: { id: organizationId },
      include: {
        members: {
          include: { user: true, role: true, branch: true },
          orderBy: { createdAt: "asc" },
        },
        organizationModules: { include: { module: true } },
        moduleRequests: {
          include: { module: true, requestedBy: { select: { name: true, email: true } } },
          orderBy: { createdAt: "desc" },
          take: 10,
        },
        _count: {
          select: {
            branches: true,
            auditLogs: true,
            notifications: true,
            moduleRequests: true,
          },
        },
      },
    }),
    db.module.findMany({ where: { status: "ACTIVE", code: { in: [...catalogueModuleKeys] } }, orderBy: { name: "asc" } }),
    getOrganizationHealthSnapshot(organizationId),
  ]);
  if (!organization) notFound();

  const enabledByModuleCode = new Map(organization.organizationModules.map((assignment) => [assignment.module.code, assignment.enabled]));
  const deletionReady = Boolean(
    organization.deletionScheduledFor && organization.deletionScheduledFor <= new Date(),
  );
  const publicShowcase = readPublicShowcase(organization.metadata);
  const offlinePolicy = resolveOfflinePolicy(organization.metadata);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader title={organization.name} description={`Tenant code: ${organization.tenantCode}`} />
        <div className="flex gap-2">
          <Badge variant={organization.status === "ACTIVE" ? "default" : "outline"}>{organization.status}</Badge>
          <Button variant="outline" nativeButton={false} render={<Link href="/app/platform/organizations" />}>All organizations</Button>
        </div>
      </div>

      {notices.created ? (
        <Alert><AlertTitle>Organization created</AlertTitle><AlertDescription>The trial tenant and owner invitation were created.</AlertDescription></Alert>
      ) : null}
      {notices.delivery === "failed" ? (
        <Alert variant="destructive"><AlertTitle>Invitation delivery failed</AlertTitle><AlertDescription>The invitation is stored, but email delivery is not configured or failed. Resend it from tenant administration after switching to this organization.</AlertDescription></Alert>
      ) : null}
      {notices.saved || notices.status ? (
        <Alert><AlertTitle>Organization updated</AlertTitle><AlertDescription>The latest organization settings are active.</AlertDescription></Alert>
      ) : null}
      {notices.invitation === "resent" ? (
        <Alert><AlertTitle>Invitation resent</AlertTitle><AlertDescription>A new seven-day invitation link was sent.</AlertDescription></Alert>
      ) : null}
      {notices.showcase === "updated" ? (
        <Alert><AlertTitle>Customer showcase updated</AlertTitle><AlertDescription>The public home page now reflects this organization&apos;s approved showcase settings.</AlertDescription></Alert>
      ) : null}
      {notices.deletion === "scheduled" ? (
        <Alert variant="destructive"><AlertTitle>Deletion scheduled</AlertTitle><AlertDescription>The organization is cancelled and remains recoverable until the scheduled deletion date.</AlertDescription></Alert>
      ) : null}
      {notices.deletion === "cancelled" ? (
        <Alert><AlertTitle>Deletion cancelled</AlertTitle><AlertDescription>The organization was restored to its previous status.</AlertDescription></Alert>
      ) : null}
      {notices.error && ERRORS[notices.error] ? (
        <Alert variant="destructive"><AlertTitle>Action failed</AlertTitle><AlertDescription>{ERRORS[notices.error]}</AlertDescription></Alert>
      ) : null}

      {organization.deletionScheduledFor ? (
        <Alert variant="destructive">
          <AlertTitle>Deletion scheduled for {organization.deletionScheduledFor.toLocaleString()}</AlertTitle>
          <AlertDescription>
            Tenant access is cancelled. Restore the organization before this date to retain it.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-4">
        <Metric label="Members" value={organization.members.length} />
        <Metric label="Branches" value={organization._count.branches} />
        <Metric label="Requests" value={organization._count.moduleRequests} />
        <Metric label="Audit events" value={organization._count.auditLogs} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Usage &amp; health</CardTitle>
          <CardDescription>Real signals already recorded elsewhere in the app, gathered here for a one-glance operational check.</CardDescription>
          <CardAction>
            <Button size="sm" variant="outline" nativeButton={false} render={<Link href={`/app/platform/billing?organizationId=${organization.id}`} />}>Payment history</Button>
          </CardAction>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <HealthStat label="Storage used" value={formatBytes(health.storageBytes)} />
          <HealthStat
            label="Last activity"
            value={health.lastActivityAt ? health.lastActivityAt.toLocaleDateString() : "No activity recorded"}
          />
          <HealthStat
            label="Failed Fleet postings"
            value={String(health.failedFleetPostings)}
            tone={health.failedFleetPostings > 0 ? "warning" : undefined}
          />
          <HealthStat label="Active offline devices" value={String(health.activeOfflineDevices)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Profile</CardTitle><CardDescription>Tenant identity, contact, location, and localization settings.</CardDescription></CardHeader>
        <CardContent>
          <form action={updateOrganizationProfile} className="grid gap-4 md:grid-cols-2">
            <input type="hidden" name="organizationId" value={organization.id} />
            <Field label="Organization name" name="name" defaultValue={organization.name} required />
            <Field label="Tenant code" name="tenantCode" defaultValue={organization.tenantCode} required />
            <Field label="Industry" name="industry" defaultValue={organization.industry ?? ""} />
            <Field label="Billing email" name="billingEmail" type="email" defaultValue={organization.billingEmail ?? ""} />
            <Field label="Organization email" name="email" type="email" defaultValue={organization.email ?? ""} />
            <Field label="Phone" name="phone" defaultValue={organization.phone ?? ""} />
            <Field label="Website" name="website" defaultValue={organization.website ?? ""} />
            <Field label="Country" name="country" defaultValue={organization.country ?? ""} />
            <Field label="Region" name="region" defaultValue={organization.region ?? ""} />
            <Field label="City" name="city" defaultValue={organization.city ?? ""} />
            <Field label="Currency" name="currency" defaultValue={organization.currency} required />
            <Field label="Timezone" name="timezone" defaultValue={organization.timezone} required />
            <Field label="Language" name="defaultLanguage" defaultValue={organization.defaultLanguage} required />
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="address">Address</Label>
              <Textarea id="address" name="address" defaultValue={organization.address ?? ""} rows={3} />
            </div>
            <Button type="submit" className="md:col-span-2 md:w-fit">Save profile</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Public customer showcase</CardTitle>
          <CardDescription>Publish this customer only after receiving permission to use its name, logo, and quote in Rock Frost marketing.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={updateOrganizationPublicShowcase} className="grid gap-4 md:grid-cols-2">
            <input type="hidden" name="organizationId" value={organization.id} />
            <div className="flex items-center gap-4 rounded-lg border p-4 md:col-span-2">
              {organization.logoUrl ? (
                <Image src={organization.logoUrl} alt={`${organization.name} logo`} width={96} height={48} unoptimized className="max-h-12 w-24 object-contain" />
              ) : <div className="flex h-12 w-24 items-center justify-center rounded bg-muted text-xs text-muted-foreground">No logo</div>}
              <div>
                <p className="text-sm font-medium">{organization.name}</p>
                <p className="text-xs text-muted-foreground">Only ACTIVE organizations with a logo and complete approved copy appear publicly.</p>
              </div>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="quote">Approved customer quote</Label>
              <Textarea id="quote" name="quote" defaultValue={publicShowcase.quote} maxLength={320} rows={4} placeholder="How Rock Frost improved the organization’s work" />
            </div>
            <Field label="Attribution" name="attribution" defaultValue={publicShowcase.attribution} />
            <label className="flex items-center gap-3 self-end rounded-md border px-4 py-2.5 text-sm font-medium">
              <input name="enabled" type="checkbox" defaultChecked={publicShowcase.enabled} className="size-4 accent-primary" />
              Approved for public showcase
            </label>
            <Button type="submit" className="md:col-span-2 md:w-fit">Save showcase settings</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Lifecycle status</CardTitle><CardDescription>Suspended and cancelled organizations cannot resolve an active tenant session.</CardDescription></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {(["TRIAL", "ACTIVE", "SUSPENDED", "CANCELLED"] as const).map((status) => (
            <form key={status} action={updateOrganizationStatus}>
              <input type="hidden" name="organizationId" value={organization.id} />
              <input type="hidden" name="status" value={status} />
              <Button type="submit" variant={organization.status === status ? "default" : "outline"} disabled={Boolean(organization.deletionScheduledFor)}>
                {status}
              </Button>
            </form>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Members</CardTitle><CardDescription>Organization memberships and assigned tenant roles.</CardDescription></CardHeader>
        <CardContent className="space-y-2">
          {organization.members.map((member) => (
            <div key={member.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
              <div>
                <p className="text-sm font-medium">{member.user.name || member.user.email}</p>
                <p className="text-xs text-muted-foreground">{member.user.email} · {member.role?.name ?? "No role"} · {member.branch?.name ?? "All branches"}</p>
              </div>
              <Badge variant="outline">{member.status}</Badge>
              {member.status === "INVITED" ? (
                <form action={resendOrganizationInvitation}>
                  <input type="hidden" name="organizationId" value={organization.id} />
                  <input type="hidden" name="membershipId" value={member.id} />
                  <Button type="submit" size="sm" variant="outline">Resend invitation</Button>
                </form>
              ) : null}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Modules</CardTitle><CardDescription>Enable modules and open organization-specific configuration.</CardDescription></CardHeader>
        <CardContent className="grid gap-2 md:grid-cols-2">
          {modules.map((module_) => (
            <div key={module_.id} className="flex items-center justify-between gap-3 rounded-md border p-3">
              <p className="text-sm font-medium">{module_.name}</p>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="ghost" nativeButton={false} render={<Link href={`/app/platform/organizations/${organization.id}/modules/${module_.id}`} />}>Configure</Button>
                <ModuleToggle
                  organizationId={organization.id}
                  moduleId={module_.id}
                  enabled={productGroupKeys(module_.code).some((key) => enabledByModuleCode.get(key) === true)}
                />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Offline access</CardTitle>
          <CardDescription>The master switch for this organization&apos;s browser offline capability. Granting access lets the organization&apos;s own Owner configure which modules, lease length, and mutation kill switch apply within their own settings - it does not turn offline on by itself.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-3 rounded-md border p-3">
            <div>
              <p className="text-sm font-medium">{organization.offlineAccessGranted ? "Granted" : "Not granted"}</p>
              <p className="text-xs text-muted-foreground">
                {organization.offlineAccessGranted && organization.offlineAccessGrantedAt
                  ? `Granted ${organization.offlineAccessGrantedAt.toLocaleString()}`
                  : "This organization cannot register an offline device until access is granted here."}
              </p>
            </div>
            <OfflineAccessToggle organizationId={organization.id} granted={organization.offlineAccessGranted} />
          </div>
          <div className="rounded-md border p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Organization&apos;s own configuration</p>
            <p className="mt-2 text-sm">
              {offlinePolicy.enabled ? "Enabled by the organization" : "Not enabled by the organization"} · lease {offlinePolicy.leaseHours}h · mutation kill switch {offlinePolicy.mutationKillSwitch ? "on" : "off"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {offlinePolicy.moduleKeys.length > 0
                ? `Modules requested: ${offlinePolicy.moduleKeys.join(", ")}`
                : `No modules requested yet (supported: ${OFFLINE_SUPPORTED_MODULES.join(", ")})`}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Recent requests</CardTitle><CardDescription>Latest module and customization requests from this organization.</CardDescription></CardHeader>
        <CardContent className="space-y-2">
          {organization.moduleRequests.length === 0 ? <p className="text-sm text-muted-foreground">No requests.</p> : organization.moduleRequests.map((request) => (
            <div key={request.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
              <div><p className="text-sm font-medium">{request.title}</p><p className="text-xs text-muted-foreground">{MODULE_REQUEST_TYPE_LABELS[request.type]} · {request.module?.name ?? "Custom work"}</p></div>
              <Badge>{MODULE_REQUEST_STATUS_LABELS[request.status]}</Badge>
            </div>
          ))}
          <Button variant="outline" nativeButton={false} render={<Link href="/app/platform/requests" />}>Open request queue</Button>
        </CardContent>
      </Card>

      <Card className="border-destructive/40">
        <CardHeader><CardTitle className="text-destructive">Danger zone</CardTitle><CardDescription>Deletion is delayed for 30 days and requires step-up authentication.</CardDescription></CardHeader>
        <CardContent className="space-y-5">
          {organization.deletionScheduledFor ? (
            <>
              <form action={restoreOrganization}>
                <input type="hidden" name="organizationId" value={organization.id} />
                <Button type="submit" variant="outline">Cancel deletion and restore</Button>
              </form>
              <DestructiveConfirmation
                organizationId={organization.id}
                tenantCode={organization.tenantCode}
                action={permanentlyDeleteOrganization}
                label="Permanently delete organization"
                disabled={!deletionReady}
                help={deletionReady ? "This permanently cascades through tenant-owned records." : "Available only after the recovery period expires."}
              />
            </>
          ) : (
            <DestructiveConfirmation
              organizationId={organization.id}
              tenantCode={organization.tenantCode}
              action={scheduleOrganizationDeletion}
              label="Schedule deletion"
              help="Cancels access immediately and schedules permanent deletion after 30 days."
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <Card><CardContent className="pt-6 text-center"><p className="text-2xl font-semibold">{value}</p><p className="text-xs text-muted-foreground">{label}</p></CardContent></Card>;
}

function HealthStat({ label, value, tone }: { label: string; value: string; tone?: "warning" }) {
  return (
    <div className="rounded-md border p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={tone === "warning" ? "mt-1 text-lg font-semibold text-destructive" : "mt-1 text-lg font-semibold"}>{value}</p>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  return `${exponent === 0 ? value : value.toFixed(1)} ${units[exponent]}`;
}

function Field({ label, name, defaultValue, type = "text", required }: { label: string; name: string; defaultValue: string; type?: string; required?: boolean }) {
  return <div className="space-y-2"><Label htmlFor={name}>{label}</Label><Input id={name} name={name} defaultValue={defaultValue} type={type} required={required} /></div>;
}

function DestructiveConfirmation({
  organizationId,
  tenantCode,
  action,
  label,
  help,
  disabled = false,
}: {
  organizationId: string;
  tenantCode: string;
  action: (formData: FormData) => Promise<void>;
  label: string;
  help: string;
  disabled?: boolean;
}) {
  const fieldPrefix = `${organizationId}-${label.toLowerCase().replaceAll(" ", "-")}`;
  return (
    <form action={action} className="max-w-xl space-y-3 rounded-md border border-destructive/30 p-4">
      <input type="hidden" name="organizationId" value={organizationId} />
      <p className="text-sm text-muted-foreground">{help}</p>
      <div className="space-y-2">
        <Label htmlFor={`${fieldPrefix}-code`}>Type tenant code: <span className="font-mono">{tenantCode}</span></Label>
        <Input id={`${fieldPrefix}-code`} name="confirmTenantCode" required autoComplete="off" />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${fieldPrefix}-password`}>Your current password</Label>
        <Input id={`${fieldPrefix}-password`} name="confirmPassword" type="password" required autoComplete="current-password" />
      </div>
      <Button type="submit" variant="destructive" disabled={disabled}>{label}</Button>
    </form>
  );
}
