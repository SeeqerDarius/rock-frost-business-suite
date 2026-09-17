import { OFFLINE_SUPPORTED_MODULES } from "@/lib/pwa/policy";

/**
 * The modules that carry their own `smsNotificationsEnabled` switch on their
 * settings record (PayrollSettings, HotelSettings, SchoolSettings,
 * PharmacySettings, HospitalSettings). Granting the SMS add-on is what makes
 * those switches usable; it never turns any of them on.
 */
export const SMS_NOTIFICATION_MODULES = ["payroll", "hotel", "school", "pharmacy", "hospital"] as const;

export type OrganizationAddonKey = "offlineAccess" | "smsNotifications" | "schoolPortal";

/**
 * Every operator-granted, per-organization feature add-on the platform sells
 * on top of a module subscription, declared once so the Organization
 * Configuration pane can render each one beside the modules it actually
 * affects instead of as an unexplained sibling card at the bottom of a long
 * scroll.
 *
 * `scope` is the honest description of the grant's blast radius as the schema
 * stores it today, not as we would like to sell it:
 *
 * - "module" means the single `Organization` column behind this add-on can
 *   only ever affect the one module in `moduleKeys` (schoolPortal gates
 *   /app/school/portal and nothing else).
 * - "organization" means one column covers every module in `moduleKeys` at
 *   once. The operator sees that spelled out rather than guessing, because a
 *   toggle that silently reaches five modules is exactly the confusion this
 *   pane exists to remove.
 *
 * The tiered-plan work replaces the "organization" scope with a per-module
 * entitlement resolved from a module subscription's plan tier. This catalogue
 * is the seam that change extends: add the tier a feature belongs to here and
 * the pane keeps rendering it in the right place.
 */
export interface OrganizationAddonDefinition {
  key: OrganizationAddonKey;
  /** The column on `Organization` holding the grant. */
  grantField: "offlineAccessGranted" | "smsNotificationsGranted" | "schoolPortalGranted";
  grantedAtField: "offlineAccessGrantedAt" | "smsNotificationsGrantedAt" | "schoolPortalGrantedAt";
  name: string;
  scope: "organization" | "module";
  moduleKeys: readonly string[];
  /** What the operator is granting, in one sentence. */
  summary: string;
  /** What still has to happen inside the tenant before anything changes for its users. */
  afterGranting: string;
  /** What stays unavailable while the grant is off. */
  whileUngranted: string;
}

export const ORGANIZATION_ADDONS: readonly OrganizationAddonDefinition[] = [
  {
    key: "offlineAccess",
    grantField: "offlineAccessGranted",
    grantedAtField: "offlineAccessGrantedAt",
    name: "Offline access",
    scope: "organization",
    moduleKeys: OFFLINE_SUPPORTED_MODULES,
    summary: "Lets this organization register browsers as offline devices and keep working without a connection.",
    afterGranting: "Its own Owner still chooses which modules go offline, the lease length, and whether the mutation kill switch is on.",
    whileUngranted: "No browser in this organization can register as an offline device.",
  },
  {
    key: "smsNotifications",
    grantField: "smsNotificationsGranted",
    grantedAtField: "smsNotificationsGrantedAt",
    name: "SMS notifications",
    scope: "organization",
    moduleKeys: SMS_NOTIFICATION_MODULES,
    summary: "Lets this organization send SMS to its own customers, guardians, and staff.",
    afterGranting: "Each module's own Settings page still has to turn SMS on, and every one of them starts off. Two-factor login codes are sent either way.",
    whileUngranted: "No module in this organization can send an SMS notification.",
  },
  {
    key: "schoolPortal",
    grantField: "schoolPortalGranted",
    grantedAtField: "schoolPortalGrantedAt",
    name: "Parent and Student portal",
    scope: "module",
    moduleKeys: ["school"],
    summary: "Opens the self-service portal where guardians and students sign in to see results, fees, and attendance.",
    afterGranting: "School staff invite each guardian or student from Portal Access. Nobody gets in without an invitation.",
    whileUngranted: "Portal Access and My Portal stay hidden, even for an account that was invited earlier.",
  },
];

export function organizationAddon(key: OrganizationAddonKey): OrganizationAddonDefinition {
  const addon = ORGANIZATION_ADDONS.find((candidate) => candidate.key === key);
  if (!addon) throw new Error(`Unknown organization add-on: ${key}`);
  return addon;
}

/** Add-ons whose grant can only ever affect this one module. */
export function moduleScopedAddons(moduleKey: string): OrganizationAddonDefinition[] {
  return ORGANIZATION_ADDONS.filter((addon) => addon.scope === "module" && addon.moduleKeys.includes(moduleKey));
}

/** Add-ons whose single grant spans several modules at once. */
export function organizationScopedAddons(): OrganizationAddonDefinition[] {
  return ORGANIZATION_ADDONS.filter((addon) => addon.scope === "organization");
}

/**
 * The modules an add-on actually reaches for one organization: the overlap
 * between what the add-on supports and what this tenant has switched on. An
 * operator looking at an SMS toggle needs to know it covers this customer's
 * School and Hotel, not the abstract list of five modules that could
 * theoretically use it.
 */
export function addonModulesInUse(addon: OrganizationAddonDefinition, enabledModuleKeys: readonly string[]): string[] {
  return addon.moduleKeys.filter((moduleKey) => enabledModuleKeys.includes(moduleKey));
}
