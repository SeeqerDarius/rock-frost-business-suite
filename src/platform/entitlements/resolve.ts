import "server-only";

import { db } from "@/lib/db";
import { primaryProductKey, productGroupKeys } from "@/platform/modules/product-groups";
import { featuresIncludedAt, limitDefinition, limitsAt, moduleTierCatalogue } from "./catalogue";
import { PLAN_TIER_LABELS, UNTIERED_LEGACY_TIER, isPlanTier, type PlanTier } from "./tiers";

/**
 * The single place that answers "what is this organization entitled to in
 * this module".
 *
 * Replaces the pair of one-off boolean readers in
 * src/lib/platform-communications.ts, which asked a different question per
 * add-on and could not answer anything about depth or quantity.
 *
 * Deliberately uncached and direct, for the same reason
 * platform-communications.ts was: this is reachable from every module's
 * service layer, and pulling `next/cache` into that import chain would force
 * every mocked-db test around an entitled module to also mock `next/cache`.
 * An entitlement check should also read as fresh as possible rather than wait
 * out a cache window, since an operator changing a tier expects it to take
 * effect on the next request.
 */
export interface ModuleEntitlement {
  moduleKey: string;
  tier: PlanTier;
  /**
   * Where the tier came from. "subscription" is a real active agreement.
   * "grandfathered" means the organization has access with nothing that
   * records a tier, so it gets UNTIERED_LEGACY_TIER (see tiers.ts).
   */
  source: "subscription" | "grandfathered";
  /** Declared feature keys included at this tier, plus any legacy override. */
  features: Set<string>;
  /** Declared limit keys to their ceiling at this tier. `null` is unlimited. */
  limits: Record<string, number | null>;
}

/**
 * The operator-granted booleans that predate tiers, and the feature each one
 * force-grants regardless of tier.
 *
 * These are **overrides, never gates**: a set boolean adds the feature, an
 * unset one takes nothing away. That is what keeps the tier rollout from
 * withdrawing an add-on an operator already granted and a customer already
 * paid for. They stop being the primary mechanism but keep working, and the
 * Configuration pane keeps showing them.
 *
 * SMS deserves a note. Today `Organization.smsNotificationsGranted` gates
 * SMS for every module at once, which is exactly the coarseness this work
 * exists to fix. The transition is: School's SMS now comes from its own tier
 * (`school.sms`, Pro and up), while the four modules whose ladders are still
 * pending (Hotel, Pharmacy, Payroll, Hospital) declare no `sms` feature at
 * all, so for them this boolean remains the only gate and their behavior is
 * bit-for-bit unchanged. Each of those modules starts using its own tier
 * when its ladder lands.
 */
const LEGACY_OVERRIDES = [
  { field: "smsNotificationsGranted", features: ["school.sms"] },
  { field: "schoolPortalGranted", features: ["school.portal"] },
  { field: "offlineAccessGranted", features: [] as string[] },
] as const;

export type OrganizationEntitlements = Map<string, ModuleEntitlement>;

export async function resolveOrganizationEntitlements(organizationId: string): Promise<OrganizationEntitlements> {
  const now = new Date();
  const [organization, enabledModules, activeSubscriptions] = await Promise.all([
    db.organization.findUnique({
      where: { id: organizationId },
      select: { smsNotificationsGranted: true, schoolPortalGranted: true, offlineAccessGranted: true },
    }),
    db.organizationModule.findMany({
      where: { organizationId, enabled: true, module: { status: "ACTIVE" } },
      select: { module: { select: { code: true } } },
    }),
    db.subscription.findMany({
      where: { organizationId, status: "ACTIVE", startsAt: { lte: now }, endsAt: { gt: now } },
      select: { tier: true, entitledModuleKeys: true, module: { select: { code: true } } },
    }),
  ]);
  if (!organization) return new Map();

  // A suite subscription entitles several modules; each of them inherits that
  // agreement's tier. When two agreements cover the same module (a suite plus
  // a standalone upgrade, say) the higher tier wins, because the customer is
  // paying for both and must never get the lesser of the two.
  const tierByModuleKey = new Map<string, PlanTier>();
  for (const subscription of activeSubscriptions) {
    const tier = isPlanTier(subscription.tier) ? subscription.tier : UNTIERED_LEGACY_TIER;
    const covered = subscription.entitledModuleKeys.length > 0
      ? subscription.entitledModuleKeys
      : [subscription.module.code];
    for (const key of covered.flatMap((moduleKey) => productGroupKeys(primaryProductKey(moduleKey)))) {
      const existing = tierByModuleKey.get(key);
      if (!existing || tierRankOf(tier) > tierRankOf(existing)) tierByModuleKey.set(key, tier);
    }
  }

  const overrideFeatures = new Set(
    LEGACY_OVERRIDES.filter((override) => organization[override.field]).flatMap((override) => override.features),
  );

  const entitlements: OrganizationEntitlements = new Map();
  for (const assignment of enabledModules) {
    const moduleKey = assignment.module.code;
    const subscribedTier = tierByModuleKey.get(moduleKey);
    const tier = subscribedTier ?? UNTIERED_LEGACY_TIER;
    const features = new Set(featuresIncludedAt(moduleKey, tier));
    for (const feature of overrideFeatures) {
      if (feature.startsWith(`${moduleKey}.`)) features.add(feature);
    }
    entitlements.set(moduleKey, {
      moduleKey,
      tier,
      source: subscribedTier ? "subscription" : "grandfathered",
      features,
      limits: limitsAt(moduleKey, tier),
    });
  }
  return entitlements;
}

function tierRankOf(tier: PlanTier): number {
  return ["BASIC", "PRO", "PLATINUM", "ENTERPRISE"].indexOf(tier);
}

/**
 * Whether one organization holds one feature. The module is derived from the
 * key's own namespace, so a caller cannot accidentally ask about the wrong
 * module. An undeclared key is always false: see catalogue.ts on why a module
 * whose ladder is still pending declares no features rather than all of them.
 */
export async function hasModuleFeature(organizationId: string, featureKey: string): Promise<boolean> {
  const moduleKey = featureKey.split(".")[0];
  if (!moduleKey) return false;
  const entitlements = await resolveOrganizationEntitlements(organizationId);
  return entitlements.get(moduleKey)?.features.has(featureKey) ?? false;
}

/**
 * The ceiling for one limit, or null for unlimited. A module the
 * organization does not have enabled returns 0, not null: no access is not
 * the same as unlimited access.
 */
export async function resolveModuleLimit(organizationId: string, limitKey: string): Promise<number | null> {
  const moduleKey = limitKey.split(".")[0];
  if (!moduleKey) return 0;
  const entitlements = await resolveOrganizationEntitlements(organizationId);
  const entitlement = entitlements.get(moduleKey);
  if (!entitlement) return 0;
  if (!(limitKey in entitlement.limits)) return null;
  return entitlement.limits[limitKey];
}

/** The tier one organization holds in one module, for display. */
export async function resolveModuleTier(organizationId: string, moduleKey: string): Promise<ModuleEntitlement | null> {
  return (await resolveOrganizationEntitlements(organizationId)).get(moduleKey) ?? null;
}

/**
 * Thrown when creating one more record would exceed the plan's ceiling. The
 * message names the plan and the number, because "you have reached your
 * limit" without either is not actionable for the person who hit it.
 */
export class PlanLimitReachedError extends Error {
  constructor(
    public readonly limitKey: string,
    public readonly ceiling: number,
    message: string,
  ) {
    super(message);
    this.name = "PlanLimitReachedError";
  }
}

/**
 * Callers pass the current count, so this never has to know how to count
 * every kind of record, and each caller stays free to decide what counts
 * (School counts enrolled students, not withdrawn ones). The noun comes from
 * the catalogue rather than the call site so the wording cannot drift between
 * the two, and so a plural that is not just "+s" is written once.
 */
export async function assertWithinModuleLimit(
  organizationId: string,
  limitKey: string,
  currentCount: number,
): Promise<void> {
  const ceiling = await resolveModuleLimit(organizationId, limitKey);
  if (ceiling === null) return;
  if (currentCount < ceiling) return;

  const definition = limitDefinition(limitKey);
  const unit = definition?.unit ?? "record";
  const noun = ceiling === 1 ? unit : (definition?.unitPlural ?? `${unit}s`);
  const tier = (await resolveModuleTier(organizationId, limitKey.split(".")[0] ?? ""))?.tier;
  throw new PlanLimitReachedError(
    limitKey,
    ceiling,
    `Your ${tier ? PLAN_TIER_LABELS[tier] : "current"} plan includes ${ceiling} ${noun}. Upgrade the plan to add more.`,
  );
}

export { moduleTierCatalogue };
