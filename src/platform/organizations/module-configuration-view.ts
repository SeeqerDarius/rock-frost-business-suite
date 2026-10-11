import "server-only";

import { db } from "@/lib/db";
import { moduleEntitlementState } from "@/lib/tenant/entitlements";
import { listAddonPrices } from "@/lib/pricing";
import { getOrganizationSeatUsage } from "@/platform/subscriptions/seats";
import { catalogueModuleKeys, getModule } from "@/platform/modules/registry";
import { productGroupKeys } from "@/platform/modules/product-groups";
import {
  COMPANION_MODULES,
  configurableFeature,
  MODULE_DEPENDENCIES,
  featureChangeBlocker,
  featuresForModule,
  modulesRequiring,
  type ConfigurableFeature,
} from "@/platform/modules/feature-catalogue";
import { getOrganizationFeatureValues } from "./feature-config-service";

/**
 * Read model for the platform operator's per-organization module views. One
 * derivation feeds both the organization overview list and the module
 * configuration page so they can never disagree, and it reuses the real
 * entitlement rule (moduleEntitlementState) rather than re-deriving access.
 * Server-only; every caller must already have verified the platform operator.
 */

export type ModuleStatus = "enabled" | "enabled-unpaid" | "disabled" | "addon" | "unavailable";

export const MODULE_STATUS_LABELS: Record<ModuleStatus, { label: string; help: string }> = {
  enabled: { label: "Enabled", help: "On for this organization. People with a matching role can open it." },
  "enabled-unpaid": { label: "On, waiting for payment", help: "Switched on, but a subscription for it is unpaid or lapsed, so nobody can open it until it is paid." },
  disabled: { label: "Disabled", help: "Off for this organization." },
  addon: { label: "Available as an add-on", help: "Off. Offered as a companion to another module this organization uses." },
  unavailable: { label: "Unavailable", help: "Switched off for every organization in Platform modules, so it cannot be used here." },
};

export interface ModuleRow {
  moduleId: string;
  code: string;
  name: string;
  description: string;
  status: ModuleStatus;
  addonFeatureCount: number;
  addonFeaturesOn: number;
}

function statusFor(params: { platformActive: boolean; enabled: boolean; entitled: boolean; companionOf?: string; companionParentEnabled: boolean }): ModuleStatus {
  if (!params.platformActive) return "unavailable";
  if (params.enabled) return params.entitled ? "enabled" : "enabled-unpaid";
  if (params.companionOf && params.companionParentEnabled) return "addon";
  return "disabled";
}

export async function listOrganizationModuleRows(organizationId: string): Promise<ModuleRow[]> {
  const [modules, assignments, entitlement, features] = await Promise.all([
    db.module.findMany({ where: { code: { in: [...catalogueModuleKeys] } }, orderBy: { name: "asc" }, select: { id: true, code: true, name: true, status: true } }),
    db.organizationModule.findMany({ where: { organizationId }, select: { enabled: true, module: { select: { code: true, status: true } } } }),
    moduleEntitlementState(organizationId),
    getOrganizationFeatureValues(organizationId),
  ]);
  const enabledCodes = new Set(assignments.filter((assignment) => assignment.enabled).map((assignment) => assignment.module.code));
  const isEnabled = (code: string) => productGroupKeys(code).some((key) => enabledCodes.has(key));
  return modules.map((module_) => {
    const companionOf = COMPANION_MODULES[module_.code];
    const state = entitlement(module_.code);
    const addons = featuresForModule(module_.code).filter((feature) => feature.kind === "addon" && !feature.organizationWide);
    return {
      moduleId: module_.id,
      code: module_.code,
      name: getModule(module_.code)?.name ?? module_.name,
      description: getModule(module_.code)?.description ?? "",
      status: statusFor({ platformActive: module_.status === "ACTIVE" && getModule(module_.code)?.status === "available", enabled: isEnabled(module_.code), entitled: state.entitled, companionOf, companionParentEnabled: companionOf ? isEnabled(companionOf) : false }),
      addonFeatureCount: addons.length,
      addonFeaturesOn: addons.filter((feature) => features?.values[feature.key]).length,
    };
  });
}

export interface FeatureView {
  feature: ConfigurableFeature;
  value: boolean;
  /** Why the switch cannot move right now, or null. */
  blockedReason: string | null;
  /** True when the current combination is invalid (for example set before dependencies were enforced). */
  conflict: string | null;
  lastChangedAt: Date | null;
  /** Only from AddonPricingPlan; never invented. */
  confirmedPrice: { monthlyGhs: number; annualGhs: number } | null;
}

export async function getOrganizationModuleConfiguration(organizationId: string, moduleId: string) {
  const [organization, module_, featureValues, entitlement, seats, addonPrices, subscriptions, assignments] = await Promise.all([
    db.organization.findUnique({ where: { id: organizationId }, select: { id: true, name: true, legalName: true, tenantCode: true, status: true } }),
    db.module.findUnique({ where: { id: moduleId } }),
    getOrganizationFeatureValues(organizationId),
    moduleEntitlementState(organizationId),
    getOrganizationSeatUsage(organizationId),
    listAddonPrices(),
    db.subscription.findMany({ where: { organizationId }, include: { module: { select: { code: true, name: true } } }, orderBy: { createdAt: "desc" }, take: 50 }),
    db.organizationModule.findMany({ where: { organizationId, enabled: true }, select: { module: { select: { code: true } } } }),
  ]);
  if (!organization || !module_ || !featureValues) return null;
  const definition = getModule(module_.code);
  const enabledCodes = assignments.map((assignment) => assignment.module.code);
  const state = entitlement(module_.code);
  const companionOf = COMPANION_MODULES[module_.code];
  const status = statusFor({ platformActive: module_.status === "ACTIVE" && definition?.status === "available", enabled: state.enabled, entitled: state.entitled, companionOf, companionParentEnabled: companionOf ? enabledCodes.includes(companionOf) : false });
  const groupKeys = productGroupKeys(module_.code);
  const productSubscriptions = subscriptions.filter((subscription) =>
    groupKeys.includes(subscription.module.code) || subscription.entitledModuleKeys.some((key) => groupKeys.includes(key)));
  const settingsByKey = new Map(featureValues.settings.map((setting) => [setting.featureKey, setting]));
  const priceByKey = new Map(addonPrices.map((price) => [price.addonKey as string, price]));

  const features: FeatureView[] = featuresForModule(module_.code).map((feature) => {
    const value = featureValues.values[feature.key];
    const missing = feature.requires.filter((required) => !featureValues.values[required]);
    return {
      feature,
      value,
      blockedReason: featureChangeBlocker(feature.key, !value, featureValues.values),
      conflict: value && missing.length > 0 ? `On, but it also needs ${missing.map((key) => configurableFeature(key)?.name ?? key).join(" and ")}, which is off. It will not work until that is turned on.` : null,
      lastChangedAt: settingsByKey.get(feature.key)?.updatedAt ?? null,
      confirmedPrice: feature.kind === "addon" ? (priceByKey.get(feature.key) ?? null) : null,
    };
  });

  const dependency = MODULE_DEPENDENCIES[module_.code];
  return {
    organization,
    module: { id: module_.id, code: module_.code, name: definition?.name ?? module_.name, description: definition?.description ?? "", platformStatus: module_.status, navigation: definition?.navigation ?? [], permissionPrefix: definition?.permissionPrefix ?? null, publicListing: definition?.publicListing !== false },
    status,
    entitlement: state,
    features,
    featureValues: featureValues.values,
    dependencies: {
      requires: (dependency?.requires ?? []).map((code) => ({ code, name: getModule(code)?.name ?? code, enabled: enabledCodes.includes(code), reason: dependency!.reason })),
      requiredBy: modulesRequiring(module_.code).map((code) => ({ code, name: getModule(code)?.name ?? code, enabled: enabledCodes.includes(code) })),
      companionOf: companionOf ? { code: companionOf, name: getModule(companionOf)?.name ?? companionOf } : null,
    },
    seats: seats.find((usage) => groupKeys.includes(usage.moduleCode)) ?? null,
    subscriptions: productSubscriptions,
  };
}
