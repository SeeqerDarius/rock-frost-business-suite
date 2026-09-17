import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/school/section-card";
import {
  MODULE_REQUEST_STATUS_LABELS,
  MODULE_REQUEST_TYPE_LABELS,
  TERMINAL_MODULE_REQUEST_STATUSES,
} from "@/platform/module-requests/constants";
import type { OrganizationHealthSnapshot } from "@/platform/organizations/health";
import { ORGANIZATION_ADDONS, addonModulesInUse } from "@/platform/organizations/feature-addons";
import { getModule } from "@/platform/modules/registry";
import type { OrganizationDetail } from "./data";
import { StatTile, formatBytes } from "./shared";

/**
 * The landing section: everything an operator needs to answer "is this
 * customer healthy and what are they paying for" without touching a control.
 * Deliberately read-only. Anything that changes the tenant lives in one of
 * the other sections, so nobody edits a live customer by accident while
 * skimming.
 */
export function OverviewSection({
  organization,
  health,
  enabledModuleKeys,
  sectionHref,
}: {
  organization: OrganizationDetail;
  health: OrganizationHealthSnapshot;
  enabledModuleKeys: string[];
  sectionHref: (section: string) => string;
}) {
  const now = new Date();
  const activeSubscriptions = organization.subscriptions.filter(
    (subscription) => subscription.status === "ACTIVE" && (!subscription.endsAt || subscription.endsAt > now),
  );
  const nextExpiry = activeSubscriptions
    .map((subscription) => subscription.endsAt)
    .filter((endsAt): endsAt is Date => endsAt !== null)
    .sort((left, right) => left.getTime() - right.getTime())[0];
  const attentionSubscriptions = organization.subscriptions.filter((subscription) =>
    ["PENDING_PAYMENT", "PAST_DUE"].includes(subscription.status),
  );
  const grantedAddons = ORGANIZATION_ADDONS.filter((addon) => organization[addon.grantField]);
  const openRequests = organization.moduleRequests.filter(
    (request) => !TERMINAL_MODULE_REQUEST_STATUSES.has(request.status),
  );

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Members" value={String(organization.members.length)} />
        <StatTile label="Branches" value={String(organization._count.branches)} />
        <StatTile label="Active modules" value={String(enabledModuleKeys.length)} />
        <StatTile
          label="Open requests"
          value={String(openRequests.length)}
          tone={openRequests.length > 0 ? "warning" : undefined}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard
          title="Plan at a glance"
          description="What this customer is paying for right now."
          actions={
            <Button size="sm" variant="outline" nativeButton={false} render={<Link href={sectionHref("plan")} />}>
              Open plan and billing
            </Button>
          }
        >
          <dl className="space-y-3 text-sm">
            <SummaryLine
              label="Active subscriptions"
              value={activeSubscriptions.length === 0 ? "None" : `${activeSubscriptions.length} module ${activeSubscriptions.length === 1 ? "subscription" : "subscriptions"}`}
            />
            <SummaryLine label="Next renewal date" value={nextExpiry ? nextExpiry.toLocaleDateString() : "No dated subscription"} />
            <SummaryLine
              label="Needs attention"
              value={attentionSubscriptions.length === 0 ? "Nothing outstanding" : `${attentionSubscriptions.length} awaiting payment or past due`}
              tone={attentionSubscriptions.length > 0 ? "warning" : undefined}
            />
            <SummaryLine
              label="Paid add-ons"
              value={
                grantedAddons.length === 0
                  ? "None granted"
                  : grantedAddons
                      .map((addon) => {
                        const inUse = addonModulesInUse(addon, enabledModuleKeys);
                        return inUse.length > 0 && addon.scope === "organization"
                          ? `${addon.name} (${inUse.length} ${inUse.length === 1 ? "module" : "modules"})`
                          : addon.name;
                      })
                      .join(", ")
              }
            />
          </dl>
        </SectionCard>

        <SectionCard
          title="Usage and health"
          description="Signals already recorded elsewhere in the app, gathered for a one-glance operational check."
          actions={
            <Button
              size="sm"
              variant="outline"
              nativeButton={false}
              render={<Link href={`/app/platform/billing?organizationId=${organization.id}`} />}
            >
              Payment history
            </Button>
          }
        >
          <dl className="space-y-3 text-sm">
            <SummaryLine label="Storage used" value={formatBytes(health.storageBytes)} />
            <SummaryLine
              label="Last recorded activity"
              value={health.lastActivityAt ? health.lastActivityAt.toLocaleString() : "No activity recorded"}
            />
            <SummaryLine
              label="Failed Fleet postings"
              value={String(health.failedFleetPostings)}
              tone={health.failedFleetPostings > 0 ? "warning" : undefined}
            />
            <SummaryLine label="Active offline devices" value={String(health.activeOfflineDevices)} />
            <SummaryLine label="Audit events recorded" value={String(organization._count.auditLogs)} />
          </dl>
        </SectionCard>
      </div>

      <SectionCard
        title="Active modules"
        description="What this organization can open today."
        actions={
          <Button size="sm" variant="outline" nativeButton={false} render={<Link href={sectionHref("features")} />}>
            Change modules and features
          </Button>
        }
      >
        {enabledModuleKeys.length === 0 ? (
          <p className="text-sm text-muted-foreground">No modules are switched on yet, so this organization has nothing to open.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {enabledModuleKeys.map((moduleKey) => (
              <Badge key={moduleKey} variant="secondary">
                {getModule(moduleKey)?.name ?? moduleKey}
              </Badge>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Recent requests"
        description="Latest module and customization requests from this organization."
        actions={
          <Button size="sm" variant="outline" nativeButton={false} render={<Link href="/app/platform/requests" />}>
            Open request queue
          </Button>
        }
      >
        {organization.moduleRequests.length === 0 ? (
          <p className="text-sm text-muted-foreground">No requests submitted yet.</p>
        ) : (
          <div className="space-y-2">
            {organization.moduleRequests.map((request) => (
              <div key={request.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{request.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {MODULE_REQUEST_TYPE_LABELS[request.type]} · {request.module?.name ?? "Custom work"} · {request.createdAt.toLocaleDateString()}
                  </p>
                </div>
                <Badge variant="outline">{MODULE_REQUEST_STATUS_LABELS[request.status]}</Badge>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

function SummaryLine({ label, value, tone }: { label: string; value: string; tone?: "warning" }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b pb-2 last:border-0 last:pb-0">
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className={tone === "warning" ? "text-sm font-medium text-destructive" : "text-sm font-medium"}>{value}</dd>
    </div>
  );
}
