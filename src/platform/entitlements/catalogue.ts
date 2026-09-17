import { PLAN_TIERS, type PlanTier } from "./tiers";

/**
 * What each plan tier includes, per module.
 *
 * Client-safe (no `server-only`, no `@/lib/db`): the public pricing page and
 * the operator's tier selector both render straight from this.
 *
 * Two kinds of entry, because "what does Basic get you" has two different
 * answers in practice:
 *
 * - A **feature** is a capability that is either present or absent. It names
 *   the minimum tier that includes it, and optionally the routes it gates so
 *   navigation filtering and the page guards read from the same declaration
 *   instead of drifting apart.
 * - A **limit** is a quantity that exists at every tier but with a different
 *   ceiling. `null` means no ceiling.
 *
 * ## Only School has a real ladder today
 *
 * Every other module is declared with `tieringPending: true` and no gated
 * features or limits, which resolves to full access at every tier. That is
 * deliberate, not an oversight: defining depth ladders for sixteen modules in
 * one change is how you quietly take a feature away from a paying customer.
 * Each module gets its ladder in its own change, with its own check of who is
 * currently using what. Until then those modules behave exactly as they do
 * now, and `tieringPending` is what the pricing page reads to avoid promising
 * a ladder that isn't enforced.
 *
 * ## The ordering invariant
 *
 * Features are cumulative up the ladder: `minTier: "PRO"` means Pro,
 * Platinum, and Enterprise. Limits must never decrease as the tier rises.
 * `assertCatalogueIsMonotonic()` checks the second property, and
 * test/plan-tier-catalogue.test.ts runs it over every module, because a
 * customer who pays more must never get less.
 */
export interface ModuleFeatureDefinition {
  /** Stable key, namespaced by module, e.g. "school.fees". Stored nowhere; compared in code. */
  key: string;
  name: string;
  /** What the customer actually gets, in one plain sentence. Shown on the pricing page. */
  summary: string;
  /** The lowest tier that includes this feature. */
  minTier: PlanTier;
  /** Routes this feature gates. Navigation filters on these; each page still re-checks server-side. */
  routes?: readonly string[];
}

export interface ModuleLimitDefinition {
  /** Stable key, namespaced by module, e.g. "school.students". */
  key: string;
  name: string;
  /** Singular noun for error copy, e.g. "student". */
  unit: string;
  /**
   * Plural noun, when adding "s" is wrong. "campus" becomes "campuss"
   * otherwise, which is how this field came to exist.
   */
  unitPlural?: string;
  /** Ceiling per tier. `null` is unlimited. Must never decrease as the tier rises. */
  byTier: Readonly<Record<PlanTier, number | null>>;
}

export interface ModuleTierCatalogue {
  moduleKey: string;
  /**
   * True while this module's ladder has not been defined yet: every tier
   * behaves identically and nothing is gated. See the file comment.
   */
  tieringPending: boolean;
  features: readonly ModuleFeatureDefinition[];
  limits: readonly ModuleLimitDefinition[];
}

const UNLIMITED: Readonly<Record<PlanTier, number | null>> = {
  BASIC: null,
  PRO: null,
  PLATINUM: null,
  ENTERPRISE: null,
};

/**
 * School's ladder. Basic is a genuinely reduced module (roll-keeping only),
 * which is what makes the tiers worth paying to leave: the money-handling and
 * assessment workflows a school actually runs on start at Pro, and the
 * things that scale a group of schools start at Platinum.
 */
const SCHOOL: ModuleTierCatalogue = {
  moduleKey: "school",
  tieringPending: false,
  features: [
    {
      key: "school.roll",
      name: "Students, classes, and attendance",
      summary: "Admit students, link guardians, build classes, and mark daily attendance.",
      minTier: "BASIC",
      routes: ["/app/school", "/app/school/students", "/app/school/classes", "/app/school/academic-periods", "/app/school/attendance", "/app/school/staff", "/app/school/settings"],
    },
    {
      key: "school.fees",
      name: "Fees and payments",
      summary: "Fee structures, student invoices, receipts, and outstanding balances.",
      minTier: "PRO",
      routes: ["/app/school/fees"],
    },
    {
      key: "school.exams",
      name: "Exams, grading, and broadsheets",
      summary: "Record and moderate results, publish them, and rank a class on a Ghana-style broadsheet.",
      minTier: "PRO",
      routes: ["/app/school/exams", "/app/school/exams/broadsheet"],
    },
    {
      key: "school.timetables",
      name: "Timetables",
      summary: "Weekly class periods with teacher and room, with clash checking.",
      minTier: "PRO",
      routes: ["/app/school/timetables"],
    },
    {
      key: "school.services",
      name: "Transport and library",
      summary: "Bus routes and stops, and a book catalogue with loans and overdue tracking.",
      minTier: "PRO",
      routes: ["/app/school/transport", "/app/school/library"],
    },
    {
      key: "school.sms",
      name: "SMS notifications",
      summary: "Text guardians when a student is absent, a payment is received, or results are published.",
      minTier: "PRO",
    },
    {
      key: "school.reports",
      name: "Reports and exports",
      summary: "Live enrollment, attendance, and fee-collection indicators, exportable.",
      minTier: "PRO",
      routes: ["/app/school/reports"],
    },
    {
      key: "school.portal",
      name: "Parent and Student portal",
      summary: "Guardians and students sign in to see results, fees, attendance, and digital ID.",
      minTier: "PLATINUM",
      routes: ["/app/school/portal", "/app/school/portal-access"],
    },
    {
      key: "school.payroll",
      name: "School payroll inputs",
      summary: "Teaching allowances and overtime by pay period, handed to the Payroll module.",
      minTier: "PLATINUM",
      routes: ["/app/school/payroll"],
    },
  ],
  limits: [
    {
      key: "school.students",
      name: "Enrolled students",
      unit: "enrolled student",
      unitPlural: "enrolled students",
      byTier: { BASIC: 200, PRO: 1500, PLATINUM: null, ENTERPRISE: null },
    },
    {
      key: "school.campuses",
      name: "Campuses",
      unit: "campus",
      unitPlural: "campuses",
      byTier: { BASIC: 1, PRO: 3, PLATINUM: null, ENTERPRISE: null },
    },
  ],
};

/** Every module the platform sells, keyed by module key. */
const MODULE_KEYS_WITH_PENDING_TIERS = [
  "fleet",
  "installment",
  "crm",
  "inventory",
  "procurement",
  "accounting",
  "hr",
  "payroll",
  "analytics",
  "pos",
  "projects",
  "hotel",
  "hostel",
  "pharmacy",
  "hospital",
] as const;

export const MODULE_TIER_CATALOGUE: readonly ModuleTierCatalogue[] = [
  SCHOOL,
  ...MODULE_KEYS_WITH_PENDING_TIERS.map((moduleKey) => ({
    moduleKey,
    tieringPending: true,
    features: [] as readonly ModuleFeatureDefinition[],
    limits: [] as readonly ModuleLimitDefinition[],
  })),
];

const BY_MODULE_KEY = new Map(MODULE_TIER_CATALOGUE.map((entry) => [entry.moduleKey, entry]));

/**
 * A module with no catalogue entry at all (a key added to the registry but
 * not here) is treated as fully open rather than fully closed. Failing open
 * is the right default for a *billing* catalogue: the real security boundary
 * is the permission check and the module-enablement gate, both of which still
 * apply, and failing closed here would silently break a module the moment
 * someone adds it to the registry.
 */
export function moduleTierCatalogue(moduleKey: string): ModuleTierCatalogue {
  return BY_MODULE_KEY.get(moduleKey) ?? { moduleKey, tieringPending: true, features: [], limits: [] };
}

/** Feature keys included at `tier` for `moduleKey`. */
export function featuresIncludedAt(moduleKey: string, tier: PlanTier): string[] {
  const catalogue = moduleTierCatalogue(moduleKey);
  if (catalogue.tieringPending) return catalogue.features.map((feature) => feature.key);
  return catalogue.features
    .filter((feature) => PLAN_TIERS.indexOf(tier) >= PLAN_TIERS.indexOf(feature.minTier))
    .map((feature) => feature.key);
}

/** Limits that apply at `tier` for `moduleKey`, as { key: ceiling | null }. */
export function limitsAt(moduleKey: string, tier: PlanTier): Record<string, number | null> {
  const catalogue = moduleTierCatalogue(moduleKey);
  const entries = catalogue.limits.map((limit) => [limit.key, catalogue.tieringPending ? null : limit.byTier[tier]] as const);
  return Object.fromEntries(entries);
}

export function limitDefinition(limitKey: string): ModuleLimitDefinition | undefined {
  for (const catalogue of MODULE_TIER_CATALOGUE) {
    const found = catalogue.limits.find((limit) => limit.key === limitKey);
    if (found) return found;
  }
  return undefined;
}

export function featureDefinition(featureKey: string): ModuleFeatureDefinition | undefined {
  for (const catalogue of MODULE_TIER_CATALOGUE) {
    const found = catalogue.features.find((feature) => feature.key === featureKey);
    if (found) return found;
  }
  return undefined;
}

/**
 * Throws if any limit shrinks as the tier rises, or if two entries share a
 * key. Exported so a test can run it over the whole catalogue rather than
 * relying on review to catch a paste error in a hand-written table.
 */
export function assertCatalogueIsMonotonic(): void {
  const seenKeys = new Set<string>();
  for (const catalogue of MODULE_TIER_CATALOGUE) {
    for (const feature of catalogue.features) {
      if (seenKeys.has(feature.key)) throw new Error(`Duplicate entitlement key: ${feature.key}`);
      seenKeys.add(feature.key);
    }
    for (const limit of catalogue.limits) {
      if (seenKeys.has(limit.key)) throw new Error(`Duplicate entitlement key: ${limit.key}`);
      seenKeys.add(limit.key);
      let previous: number | null = 0;
      for (const tier of PLAN_TIERS) {
        const ceiling = limit.byTier[tier];
        if (previous === null && ceiling !== null) {
          throw new Error(`${limit.key} drops from unlimited to ${ceiling} at ${tier}.`);
        }
        if (previous !== null && ceiling !== null && ceiling < previous) {
          throw new Error(`${limit.key} drops from ${previous} to ${ceiling} at ${tier}.`);
        }
        previous = ceiling;
      }
    }
  }
}

export { UNLIMITED };
