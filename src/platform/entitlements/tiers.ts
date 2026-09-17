/**
 * The plan ladder every module subscription sits on.
 *
 * Client-safe on purpose: no `server-only` marker, no `@/lib/db`, no
 * `next/cache`. The public pricing page, the operator's tier selector, and
 * the tenant-facing "your plan includes" copy all need these labels and the
 * comparison helpers, and two of those three are client components.
 *
 * The ladder is ordered and cumulative: a feature included at `PRO` is also
 * included at `PLATINUM` and `ENTERPRISE`. Nothing in the catalogue should
 * ever say "available at Pro but not Platinum", because a customer who pays
 * more must never get less. `tierAtLeast()` is the only correct way to ask
 * whether a held tier covers a required one; comparing the strings, or
 * their array indices by hand, is what lets that invariant rot.
 */
export const PLAN_TIERS = ["BASIC", "PRO", "PLATINUM", "ENTERPRISE"] as const;

export type PlanTier = (typeof PLAN_TIERS)[number];

export const PLAN_TIER_LABELS: Record<PlanTier, string> = {
  BASIC: "Basic",
  PRO: "Pro",
  PLATINUM: "Platinum",
  ENTERPRISE: "Enterprise",
};

export const PLAN_TIER_TAGLINES: Record<PlanTier, string> = {
  BASIC: "The essentials to start running the module.",
  PRO: "The full day-to-day workflow most organizations need.",
  PLATINUM: "Everything, with no ceilings.",
  ENTERPRISE: "Platinum plus the terms and integrations you negotiate with us.",
};

/**
 * Enterprise is never self-service. It is priced per agreement, so checkout
 * and the pricing page send people to sales instead of showing an amount.
 */
export const QUOTE_ONLY_TIERS: readonly PlanTier[] = ["ENTERPRISE"];

export function isQuoteOnlyTier(tier: PlanTier): boolean {
  return QUOTE_ONLY_TIERS.includes(tier);
}

export function isPlanTier(value: unknown): value is PlanTier {
  return typeof value === "string" && (PLAN_TIERS as readonly string[]).includes(value);
}

/** 0 for BASIC through 3 for ENTERPRISE. Position in the ladder, not a price. */
export function tierRank(tier: PlanTier): number {
  return PLAN_TIERS.indexOf(tier);
}

/** Whether `held` covers everything `required` includes. */
export function tierAtLeast(held: PlanTier, required: PlanTier): boolean {
  return tierRank(held) >= tierRank(required);
}

/** The next tier up, or null at the top of the ladder. Drives "upgrade to unlock" copy. */
export function nextTierAbove(tier: PlanTier): PlanTier | null {
  return PLAN_TIERS[tierRank(tier) + 1] ?? null;
}

/**
 * The tier an organization is treated as holding when nothing says
 * otherwise: either a subscription predating the tier column, or a module
 * switched on through the legacy `OrganizationModule.enabled` path with no
 * subscription row at all.
 *
 * This is PLATINUM, and deliberately the top non-negotiated tier, because
 * both of those organizations have unrestricted access today. A tier column
 * cannot retroactively describe what someone bought before tiers existed,
 * and guessing low would silently take away features a paying customer is
 * using. Tiers only ever restrict a subscription created after they shipped.
 * See docs/PLAN_TIERS.md's grandfathering section.
 */
export const UNTIERED_LEGACY_TIER: PlanTier = "PLATINUM";
