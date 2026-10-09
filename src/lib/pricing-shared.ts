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
