import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { SectionCard } from "@/components/school/section-card";
import { getModule } from "@/platform/modules/registry";
import {
  addonModulesInUse,
  organizationScopedAddons,
  type OrganizationAddonDefinition,
} from "@/platform/organizations/feature-addons";
import { MODULE_STATUS_LABELS, type ModuleRow, type ModuleStatus } from "@/platform/organizations/module-configuration-view";
import { OFFLINE_SUPPORTED_MODULES, type OfflinePolicy } from "@/lib/pwa/policy";
import { OfflineAccessToggle } from "../../offline-access-toggle";
import { SmsNotificationsToggle } from "../../sms-notifications-toggle";
import { SchoolPortalToggle } from "../../school-portal-toggle";
import { SchoolGuardianMessagingToggle } from "../../school-guardian-messaging-toggle";
import { SchoolAssignmentsToggle } from "../../school-assignments-toggle";
import type { OrganizationDetail } from "./data";
import { SettingRow } from "./shared";

const STATUS_VARIANT: Record<ModuleStatus, "default" | "secondary" | "destructive" | "outline"> = {
  enabled: "default",
  "enabled-unpaid": "destructive",
  disabled: "outline",
  addon: "secondary",
  unavailable: "outline",
};

/**
 * Every catalogue module for this organization, with one plain status
 * (enabled, on but waiting for payment, disabled, available as an add-on, or
 * unavailable) derived from the same entitlement rule tenant access uses.
 * Each row opens that module's configuration page, which is where it is
 * switched on or off (with confirmation and dependency checks) and where its
 * add-ons and optional capabilities are configured. Organization-wide
 * add-ons stay below, since one grant reaches several modules.
 */
export function FeaturesSection({
  organization,
  moduleRows,
  enabledModuleKeys,
  offlinePolicy,
}: {
  organization: OrganizationDetail;
  moduleRows: ModuleRow[];
  enabledModuleKeys: string[];
  offlinePolicy: OfflinePolicy;
}) {
  // What the customer already has comes first.
  const inUse = moduleRows.filter((row) => row.status === "enabled" || row.status === "enabled-unpaid");
  const other = moduleRows.filter((row) => !inUse.includes(row));

  const moduleLink = (row: ModuleRow) => (
    <li key={row.moduleId}>
      <Link
        href={`/app/platform/organizations/${organization.id}/modules/${row.moduleId}`}
        className="flex items-start justify-between gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <span className="min-w-0 space-y-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{row.name}</span>
            <Badge variant={STATUS_VARIANT[row.status]}>{MODULE_STATUS_LABELS[row.status].label}</Badge>
            {row.addonFeatureCount > 0 ? <Badge variant="outline">Add-ons {row.addonFeaturesOn} of {row.addonFeatureCount} on</Badge> : null}
          </span>
          <span className="block text-sm text-muted-foreground">{row.status === "enabled" ? row.description : MODULE_STATUS_LABELS[row.status].help}</span>
        </span>
        <span className="flex shrink-0 items-center gap-1 pt-0.5 text-sm text-muted-foreground">
          <span className="hidden sm:inline">Configure</span>
          <ChevronRight className="size-4" aria-hidden="true" />
        </span>
      </Link>
    </li>
  );

  return (
    <div className="space-y-6">
      <SectionCard
        title={`Modules in use (${inUse.length})`}
        description="Open a module to see its access, subscription facts, features, and dependencies, and to switch it or its features on or off for this organization."
      >
        {inUse.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing is switched on yet, so this organization has an empty launcher. Open a module below to switch it on.</p>
        ) : (
          <ul className="space-y-2">{inUse.map(moduleLink)}</ul>
        )}
      </SectionCard>

      <SectionCard
        title={`Other modules (${other.length})`}
        description="Not in use by this organization. Switching one on grants access immediately, whether or not a subscription covers it."
      >
        <ul className="space-y-2">{other.map(moduleLink)}</ul>
      </SectionCard>

      <SectionCard
        title="Shared capabilities"
        description="Paid add-ons granted once for the whole organization. Each one lists the modules it reaches for this customer today."
      >
        <div className="space-y-3">
          {organizationScopedAddons().map((addon) => (
            <AddonRow
              key={addon.key}
              addon={addon}
              organization={organization}
              enabledModuleKeys={enabledModuleKeys}
              detail={addon.key === "offlineAccess" ? <OfflineTenantPolicy policy={offlinePolicy} /> : null}
            />
          ))}
        </div>
      </SectionCard>
    </div>
  );
}

/**
 * One add-on grant, rendered identically wherever it appears. The toggle
 * components stay separate client components (one per Server Action) rather
 * than one generic switch taking an action prop, because a Server Action
 * cannot be passed from a server component to a client component as a plain
 * prop and still be callable by key here.
 */
function AddonRow({
  addon,
  organization,
  enabledModuleKeys,
  detail,
}: {
  addon: OrganizationAddonDefinition;
  organization: OrganizationDetail;
  enabledModuleKeys: string[];
  detail?: React.ReactNode;
}) {
  const granted = Boolean(organization[addon.grantField]);
  const grantedAt = organization[addon.grantedAtField];
  const inUse = addonModulesInUse(addon, enabledModuleKeys);
  const reach =
    addon.scope === "module"
      ? null
      : inUse.length === 0
        ? "None of the modules this add-on supports are switched on for this organization yet."
        : `Reaches: ${inUse.map((moduleKey) => getModule(moduleKey)?.name ?? moduleKey).join(", ")}.`;

  return (
    <SettingRow
      title={addon.name}
      status={granted ? <Badge variant="secondary">Granted</Badge> : <Badge variant="outline">Not granted</Badge>}
      help={[
        addon.summary,
        granted ? addon.afterGranting : addon.whileUngranted,
        reach,
        granted && grantedAt ? `Granted ${grantedAt.toLocaleString()}.` : null,
      ]
        .filter(Boolean)
        .join(" ")}
      control={<AddonToggle addonKey={addon.key} organizationId={organization.id} granted={granted} />}
    >
      {granted ? detail : null}
    </SettingRow>
  );
}

function AddonToggle({
  addonKey,
  organizationId,
  granted,
}: {
  addonKey: OrganizationAddonDefinition["key"];
  organizationId: string;
  granted: boolean;
}) {
  if (addonKey === "offlineAccess") return <OfflineAccessToggle organizationId={organizationId} granted={granted} />;
  if (addonKey === "smsNotifications") return <SmsNotificationsToggle organizationId={organizationId} granted={granted} />;
  if (addonKey === "schoolGuardianMessaging") return <SchoolGuardianMessagingToggle organizationId={organizationId} granted={granted} />;
  if (addonKey === "schoolAssignments") return <SchoolAssignmentsToggle organizationId={organizationId} granted={granted} />;
  return <SchoolPortalToggle organizationId={organizationId} granted={granted} />;
}

/** What the tenant's own Owner has done with the offline grant, read-only here. */
function OfflineTenantPolicy({ policy }: { policy: OfflinePolicy }) {
  return (
    <div className="rounded-md bg-muted/40 p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        What the organization has configured
      </p>
      <p className="mt-1 text-sm">
        {policy.enabled ? "Enabled by the organization" : "Not enabled by the organization"} · lease {policy.leaseHours}h · mutation kill switch {policy.mutationKillSwitch ? "on" : "off"}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        {policy.moduleKeys.length > 0
          ? `Modules requested: ${policy.moduleKeys.map((moduleKey) => getModule(moduleKey)?.name ?? moduleKey).join(", ")}`
          : `No modules requested yet. Supported: ${OFFLINE_SUPPORTED_MODULES.map((moduleKey) => getModule(moduleKey)?.name ?? moduleKey).join(", ")}`}
      </p>
    </div>
  );
}
