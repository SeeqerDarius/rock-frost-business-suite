import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/school/section-card";
import { getModule } from "@/platform/modules/registry";
import { productGroupKeys } from "@/platform/modules/product-groups";
import {
  addonModulesInUse,
  moduleScopedAddons,
  organizationScopedAddons,
  type OrganizationAddonDefinition,
} from "@/platform/organizations/feature-addons";
import { OFFLINE_SUPPORTED_MODULES, type OfflinePolicy } from "@/lib/pwa/policy";
import { ModuleToggle } from "../../module-toggle";
import { OfflineAccessToggle } from "../../offline-access-toggle";
import { SmsNotificationsToggle } from "../../sms-notifications-toggle";
import { SchoolPortalToggle } from "../../school-portal-toggle";
import type { CatalogueModuleRow, OrganizationDetail } from "./data";
import { SettingRow } from "./shared";

/**
 * Module activation and the paid feature add-ons that sit on top of it, in
 * one section instead of scattered across four sibling cards at four
 * different scroll depths.
 *
 * The grouping is the point. An add-on that can only affect one module
 * (the School portal) is nested inside that module's own row, so its
 * module-specificity is visible rather than inferred from a card title. An
 * add-on whose single grant spans several modules is in its own group that
 * names the modules it currently reaches for this organization, so the
 * operator sees the blast radius instead of discovering it later.
 */
export function FeaturesSection({
  organization,
  modules,
  enabledModuleKeys,
  offlinePolicy,
}: {
  organization: OrganizationDetail;
  modules: CatalogueModuleRow[];
  enabledModuleKeys: string[];
  offlinePolicy: OfflinePolicy;
}) {
  const enabledByModuleCode = new Map(
    organization.organizationModules.map((assignment) => [assignment.module.code, assignment.enabled]),
  );
  const isEnabled = (moduleCode: string) =>
    productGroupKeys(moduleCode).some((key) => enabledByModuleCode.get(key) === true);
  // What the customer already has comes first. Alphabetical order across all
  // sixteen modules buried this organization's three live ones among thirteen
  // it has never bought.
  const active = modules.filter((module_) => isEnabled(module_.code));
  const available = modules.filter((module_) => !isEnabled(module_.code));

  const moduleRow = (module_: CatalogueModuleRow, enabled: boolean) => {
    const ownAddons = moduleScopedAddons(module_.code);
    return (
      <SettingRow
        key={module_.id}
        title={module_.name}
        status={enabled ? <Badge variant="secondary">On</Badge> : <Badge variant="outline">Off</Badge>}
        help={getModule(module_.code)?.description}
        control={
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              nativeButton={false}
              render={<Link href={`/app/platform/organizations/${organization.id}/modules/${module_.id}`} />}
            >
              Configure
            </Button>
            <ModuleToggle organizationId={organization.id} moduleId={module_.id} enabled={enabled} />
          </div>
        }
      >
        {enabled && ownAddons.length > 0 ? (
          <div className="space-y-2 border-l-2 border-muted pl-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {module_.name} add-ons
            </p>
            {ownAddons.map((addon) => (
              <AddonRow
                key={addon.key}
                addon={addon}
                organization={organization}
                enabledModuleKeys={enabledModuleKeys}
              />
            ))}
          </div>
        ) : null}
      </SettingRow>
    );
  };

  return (
    <div className="space-y-6">
      <SectionCard
        title={`Modules on for this organization (${active.length})`}
        description="Switching a module on is what puts it in this organization's launcher. Each module's own configuration and any add-on that only affects that module are here with it."
      >
        {active.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing is switched on yet, so this organization has an empty launcher. Switch a module on below.
          </p>
        ) : (
          <div className="space-y-3">{active.map((module_) => moduleRow(module_, true))}</div>
        )}
      </SectionCard>

      <SectionCard
        title={`Available to switch on (${available.length})`}
        description="Modules this organization is not using. Switching one on grants access immediately, whether or not a subscription covers it."
      >
        <div className="space-y-3">{available.map((module_) => moduleRow(module_, false))}</div>
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
