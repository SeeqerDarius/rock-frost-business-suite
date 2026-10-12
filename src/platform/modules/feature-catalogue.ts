import { OFFLINE_SUPPORTED_MODULES } from "@/lib/pwa/policy";
import { ORGANIZATION_ADDONS, SMS_NOTIFICATION_MODULES, type OrganizationAddonKey } from "@/platform/organizations/feature-addons";

/**
 * The configurable features a platform operator can control for one
 * organization, per module. Client-safe (no database access).
 *
 * Four separate things decide whether a person can use a capability, and this
 * catalogue only describes the third:
 *
 * 1. Module availability: `Module.status` (platform-wide, /app/platform/modules).
 * 2. Organization entitlement: `OrganizationModule.enabled`, gated by any
 *    subscription for that product (`entitledModuleKeysForOrganization`).
 * 3. Per-feature configuration for that organization: the entries below.
 * 4. User permissions inside the organization: roles and permission keys.
 *
 * Every entry must be enforced on the server where the capability lives.
 * Nothing here is a display-only switch. Two kinds exist:
 *
 * - "addon": an optional, separately arranged capability that is off until
 *   Rock Frost grants it. Stored in the organization's existing grant column
 *   (`storage.kind === "organizationGrant"`), so the long-standing enforcement
 *   points keep working unchanged. The catalogue never claims an add-on is
 *   billed; prices appear only when `AddonPricingPlan` holds a confirmed row.
 * - "optional": a capability included with the module that an operator can
 *   switch off for one organization, for example a school that does not run
 *   buses. Stored in `OrganizationFeatureSetting`; no row means `defaultEnabled`.
 *
 * See docs/MODULE_FEATURE_CONFIGURATION.md.
 */

export type FeatureKind = "addon" | "optional";

export type OptionalFeatureKey = "school.transport" | "school.library";
export type ConfigurableFeatureKey = OrganizationAddonKey | OptionalFeatureKey;

export interface ConfigurableFeature {
  key: ConfigurableFeatureKey;
  kind: FeatureKind;
  name: string;
  /** Plain-language purpose, one or two sentences. */
  description: string;
  /** Module(s) this feature belongs to. Organization-wide add-ons list every module they reach. */
  moduleKeys: readonly string[];
  /** True when one setting changes several modules at once. */
  organizationWide: boolean;
  defaultEnabled: boolean;
  storage: { kind: "organizationGrant"; grantField: string; grantedAtField: string } | { kind: "featureSetting" };
  /** Features that must be on before this one can be turned on. */
  requires: readonly ConfigurableFeatureKey[];
  /** Features that are recommended alongside this one but not enforced. */
  worksBestWith?: readonly { key: ConfigurableFeatureKey; reason: string }[];
  /** What switching it on does, and what is still needed inside the organization. */
  whenOn: string;
  /** What switching it off does. Existing records are never deleted. */
  whenOff: string;
  /** Workspace routes this feature controls, so the capability list can label them. */
  routes: readonly string[];
  /** Where the server enforces it, for operators and reviewers. */
  enforcedBy: string;
}

const addon = (key: OrganizationAddonKey) => {
  const definition = ORGANIZATION_ADDONS.find((entry) => entry.key === key);
  if (!definition) throw new Error(`Unknown add-on ${key}`);
  return definition;
};

const addonFeature = (key: OrganizationAddonKey, extra: Pick<ConfigurableFeature, "requires" | "routes" | "enforcedBy"> & { worksBestWith?: ConfigurableFeature["worksBestWith"] }): ConfigurableFeature => {
  const definition = addon(key);
  return {
    key,
    kind: "addon",
    name: definition.name,
    description: definition.summary,
    moduleKeys: definition.moduleKeys,
    organizationWide: definition.scope === "organization",
    defaultEnabled: false,
    storage: { kind: "organizationGrant", grantField: definition.grantField, grantedAtField: definition.grantedAtField },
    whenOn: definition.afterGranting,
    whenOff: definition.whileUngranted,
    ...extra,
  };
};

export const CONFIGURABLE_FEATURES: readonly ConfigurableFeature[] = [
  addonFeature("offlineAccess", {
    requires: [],
    routes: [],
    enforcedBy: "Device registration (/api/offline/devices) refuses every browser until granted.",
  }),
  addonFeature("smsNotifications", {
    requires: [],
    routes: [],
    enforcedBy: "sendSms() refuses every non-login text for the organization until granted.",
  }),
  addonFeature("schoolPortal", {
    requires: [],
    routes: ["/app/school/portal", "/app/school/portal/announcements", "/app/school/portal-access"],
    enforcedBy: "My Portal and Portal Access pages and the portal invitation actions check the grant.",
  }),
  addonFeature("schoolGuardianMessaging", {
    requires: ["schoolPortal"],
    routes: ["/app/school/chats"],
    enforcedBy: "School chat refuses guardian conversations unless both this and the portal are granted.",
  }),
  addonFeature("schoolAssignments", {
    requires: [],
    worksBestWith: [{ key: "schoolPortal", reason: "Students sign in through My Portal to submit. Teachers can still set and mark work without it." }],
    routes: ["/app/school/assignments", "/app/school/portal/assignments"],
    enforcedBy: "Every assignment service function re-checks the grant.",
  }),
  {
    key: "school.transport",
    kind: "optional",
    name: "Transport",
    description: "Bus routes, stops, drivers, and which students ride each route.",
    moduleKeys: ["school"],
    organizationWide: false,
    defaultEnabled: true,
    storage: { kind: "featureSetting" },
    requires: [],
    whenOn: "Staff with the School transport permission manage routes and student assignments.",
    whenOff: "Transport disappears from School and its pages and actions refuse requests. Existing routes and assignments are kept and return when switched back on.",
    routes: ["/app/school/transport"],
    enforcedBy: "School transport service functions, page, and actions check the setting.",
  },
  {
    key: "school.library",
    kind: "optional",
    name: "Library",
    description: "Book catalogue, loans to students, returns, and overdue tracking.",
    moduleKeys: ["school"],
    organizationWide: false,
    defaultEnabled: true,
    storage: { kind: "featureSetting" },
    requires: [],
    whenOn: "Staff with the School library permission manage the catalogue and loans.",
    whenOff: "Library disappears from School and its pages and actions refuse requests. Existing books and loans are kept and return when switched back on.",
    routes: ["/app/school/library"],
    enforcedBy: "School library service functions, page, and actions check the setting.",
  },
];

export function configurableFeature(key: string): ConfigurableFeature | undefined {
  return CONFIGURABLE_FEATURES.find((feature) => feature.key === key);
}

export function featuresForModule(moduleKey: string): ConfigurableFeature[] {
  return CONFIGURABLE_FEATURES.filter((feature) => feature.moduleKeys.includes(moduleKey));
}

export function isOptionalFeatureKey(key: string): key is OptionalFeatureKey {
  return configurableFeature(key)?.kind === "optional";
}

/** Features that depend on `key`, so turning `key` off would leave them broken. */
export function dependentFeatures(key: ConfigurableFeatureKey): ConfigurableFeature[] {
  return CONFIGURABLE_FEATURES.filter((feature) => feature.requires.includes(key));
}

/**
 * Module-level dependencies the product actually has. Hostel stores no
 * students of its own: allocations and hostel fees are for existing School
 * students, so Hostel without School has nothing to allocate.
 */
export const MODULE_DEPENDENCIES: Readonly<Record<string, { requires: readonly string[]; reason: string }>> = {
  hostel: { requires: ["school"], reason: "Hostel allocates beds and bills fees to existing School students, so School must be on." },
};

/** Modules sold as a companion to another module rather than on their own. */
export const COMPANION_MODULES: Readonly<Record<string, string>> = { hostel: "school" };

export function modulesRequiring(moduleKey: string): string[] {
  return Object.entries(MODULE_DEPENDENCIES).filter(([, dependency]) => dependency.requires.includes(moduleKey)).map(([key]) => key);
}

/**
 * Pure dependency check for a proposed feature change, shared by the server
 * action and its tests. `current` is the effective value of every feature for
 * the organization.
 */
export function featureChangeBlocker(key: ConfigurableFeatureKey, nextEnabled: boolean, current: Readonly<Record<string, boolean>>): string | null {
  const feature = configurableFeature(key);
  if (!feature) return "That feature does not exist.";
  if (nextEnabled) {
    const missing = feature.requires.filter((required) => !current[required]);
    if (missing.length > 0) {
      return `Turn on ${missing.map((required) => configurableFeature(required)?.name ?? required).join(" and ")} first. ${feature.name} needs it.`;
    }
    return null;
  }
  const blocking = dependentFeatures(key).filter((dependent) => current[dependent.key]);
  if (blocking.length > 0) {
    return `Turn off ${blocking.map((dependent) => dependent.name).join(" and ")} first. ${blocking.length === 1 ? "It needs" : "They need"} ${feature.name}.`;
  }
  return null;
}

/** Module enable/disable dependency check, shared by the server action and its tests. */
export function moduleChangeBlocker(moduleKey: string, nextEnabled: boolean, enabledModuleKeys: readonly string[], moduleName: (key: string) => string): string | null {
  if (nextEnabled) {
    const dependency = MODULE_DEPENDENCIES[moduleKey];
    const missing = dependency?.requires.filter((required) => !enabledModuleKeys.includes(required)) ?? [];
    return missing.length > 0 ? `Switch on ${missing.map(moduleName).join(" and ")} first. ${dependency!.reason}` : null;
  }
  const dependents = modulesRequiring(moduleKey).filter((dependent) => enabledModuleKeys.includes(dependent));
  return dependents.length > 0 ? `Switch off ${dependents.map(moduleName).join(" and ")} first. ${dependents.length === 1 ? "It depends" : "They depend"} on ${moduleName(moduleKey)}.` : null;
}

// Keep the reach of organization-wide add-ons visible next to the catalogue.
export const ORGANIZATION_WIDE_ADDON_MODULES = { offlineAccess: OFFLINE_SUPPORTED_MODULES, smsNotifications: SMS_NOTIFICATION_MODULES } as const;
