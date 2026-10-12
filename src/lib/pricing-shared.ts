/**
 * Client-safe pricing types and pure helpers — deliberately has no
 * "server-only" marker and no next/cache or @/lib/db import, unlike
 * pricing.ts, because organization/billing/module-cart.tsx (a "use client"
 * component) imports formatGhs and ModulePrice directly. pricing.ts
 * re-exports everything here for server-side consumers.
 */
import type { BusinessModuleKey } from "@/platform/modules/registry";
import type { PlanTier } from "@/platform/entitlements/tiers";

export type ModulePrice = {
  moduleKey: BusinessModuleKey;
  monthlyGhs: number;
  annualGhs: number;
  includedSeats: number;
  additionalSeatGhs: number;
};

/**
 * One rung of one module's price ladder, read from `ModuleTierPrice`.
 *
 * Separate from `ModulePrice` on purpose. `ModulePrice` is the module's
 * single pre-tier headline, still the only price for the modules whose
 * ladders are pending, and still what the suite and cart prices are built
 * from. This is the per-tier price, and only modules with a published
 * ladder have rows.
 */
export type ModuleTierPrice = {
  moduleKey: string;
  tier: PlanTier;
  monthlyGhs: number;
  annualGhs: number;
  includedSeats: number;
  additionalSeatGhs: number;
};

/** A module's ladder, lowest rung first. Empty when the module has none. */
export type ModuleLadder = {
  moduleKey: string;
  rungs: ModuleTierPrice[];
};

export type PricingBundleKey = string;

export type PricingBundle = {
  key: PricingBundleKey;
  name: string;
  monthlyGhs: number;
  moduleKeys: BusinessModuleKey[];
  modules: string[];
};

export type ModulePriceLike = { monthlyGhs: number; annualGhs: number; includedSeats: number };

export function computeRecommendedQuote(priceMap: Map<string, ModulePriceLike>, moduleKey: string, durationMonths: number) {
  const price = priceMap.get(moduleKey);
  if (!price) return null;
  if (durationMonths === 12) return { amountGhs: price.annualGhs, seatLimit: price.includedSeats };
  return { amountGhs: price.monthlyGhs * durationMonths, seatLimit: price.includedSeats };
}

export function formatGhs(amount: number) {
  return new Intl.NumberFormat("en-GH", { style: "currency", currency: "GHS", maximumFractionDigits: 0 }).format(amount);
}

/**
 * Optional, separately priced add-ons that extend one module. The public
 * description lives here; the price lives only in the operator-editable
 * AddonPricingPlan table and is absent until Rock Frost confirms it, in
 * which case public pages say "priced on request" instead of a number.
 */
export type PublicAddonKey = "schoolAssignments";

export type PublicAddon = {
  key: PublicAddonKey;
  name: string;
  /** The module the add-on extends; it is never sold on its own. */
  moduleKey: BusinessModuleKey;
  summary: string;
  features: readonly string[];
};

export const PUBLIC_ADDONS: readonly PublicAddon[] = [
  {
    key: "schoolAssignments",
    name: "Assignments & Assessments",
    moduleKey: "school",
    summary: "An optional School Management add-on for setting class work online, collecting student answers, and marking objective questions automatically.",
    features: [
      "Teachers set assignments for the classes they teach, with due dates and attempt limits",
      "Students submit from the Parent and Student portal",
      "Single choice, true or false, multiple select, and numeric answers are marked automatically",
      "Short answers and essays are marked by the teacher, never by AI",
      "Teachers choose whether a result counts towards an existing exam in the cumulative record",
    ],
  },
];

export type AddonPrice = {
  addonKey: PublicAddonKey;
  monthlyGhs: number;
  annualGhs: number;
};
