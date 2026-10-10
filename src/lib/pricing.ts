import "server-only";

import { db } from "@/lib/db";
import { computeRecommendedQuote, type AddonPrice, type ModuleLadder, type ModulePrice, type ModuleTierPrice, type PricingBundle } from "@/lib/pricing-shared";
import { moduleHasPublishedLadder } from "@/platform/entitlements/catalogue";
import { PLAN_TIERS, isPlanTier, type PlanTier } from "@/platform/entitlements/tiers";
import { getModule, type BusinessModuleKey } from "@/platform/modules/registry";

export type { AddonPrice, ModuleLadder, ModulePrice, ModuleTierPrice, PricingBundle, PricingBundleKey, PublicAddon } from "@/lib/pricing-shared";
export { computeRecommendedQuote, formatGhs, PUBLIC_ADDONS } from "@/lib/pricing-shared";

/**
 * Deliberately NOT wrapped in unstable_cache: this catalogue is also read
 * from platform/subscriptions/service.ts's self-service checkout functions,
 * which the real-Postgres integration suite (and any future one-off script)
 * calls directly rather than through a live Next.js request — unstable_cache
 * throws ("incrementalCache missing") outside that request context. The
 * catalogue is 14 module rows + a handful of bundles, cheap enough on every
 * read that caching isn't worth trading away that call compatibility.
 */
export async function getPricingCatalogue(): Promise<{ modulePrices: ModulePrice[]; bundles: PricingBundle[] }> {
  const [plans, bundleRows] = await Promise.all([
    db.modulePricingPlan.findMany({ orderBy: { moduleKey: "asc" } }),
    db.pricingBundle.findMany({ orderBy: { key: "asc" } }),
  ]);
  const modulePrices = plans.map((plan) => ({
    moduleKey: plan.moduleKey as BusinessModuleKey,
    monthlyGhs: Number(plan.monthlyGhs),
    annualGhs: Number(plan.annualGhs),
    includedSeats: plan.includedSeats,
    additionalSeatGhs: Number(plan.additionalSeatGhs),
  }));
  const bundles = bundleRows.map((bundle) => ({
    key: bundle.key,
    name: bundle.name,
    monthlyGhs: Number(bundle.monthlyGhs),
    moduleKeys: bundle.moduleKeys as BusinessModuleKey[],
    modules: bundle.moduleKeys.flatMap((key) => {
      const definition = getModule(key);
      return definition ? [definition.name] : [];
    }),
  }));
  return { modulePrices, bundles };
}

export async function listModulePrices(): Promise<ModulePrice[]> {
  return (await getPricingCatalogue()).modulePrices;
}

export async function listPricingBundles(): Promise<PricingBundle[]> {
  return (await getPricingCatalogue()).bundles;
}

export async function getModulePriceMap(): Promise<Map<BusinessModuleKey, ModulePrice>> {
  return new Map((await listModulePrices()).map((price) => [price.moduleKey, price]));
}

export async function getPricingBundleMap(): Promise<Map<string, PricingBundle>> {
  return new Map((await listPricingBundles()).map((bundle) => [bundle.key, bundle]));
}

/**
 * Every module's price ladder, lowest rung first, for the modules that have
 * one. Uncached for the same reason as getPricingCatalogue() above.
 *
 * A module only appears here when its ladder is both priced (rows exist) and
 * enforced (`moduleHasPublishedLadder`). Those two can disagree: a seeded
 * price row for a module whose ladder was never written would otherwise let
 * the pricing page advertise a Basic plan that behaves like Platinum, and an
 * enforced ladder with no rows would let checkout invent a price. Requiring
 * both means a half-finished ladder shows the module's single headline
 * price, which is what it did before tiers.
 */
export async function listModuleLadders(): Promise<ModuleLadder[]> {
  const rows = await db.moduleTierPrice.findMany({ orderBy: [{ moduleKey: "asc" }, { tier: "asc" }] });
  const byModule = new Map<string, ModuleTierPrice[]>();
  for (const row of rows) {
    if (!isPlanTier(row.tier) || !moduleHasPublishedLadder(row.moduleKey)) continue;
    const rungs = byModule.get(row.moduleKey) ?? [];
    rungs.push({
      moduleKey: row.moduleKey,
      tier: row.tier,
      monthlyGhs: Number(row.monthlyGhs),
      annualGhs: Number(row.annualGhs),
      includedSeats: row.includedSeats,
      additionalSeatGhs: Number(row.additionalSeatGhs),
    });
    byModule.set(row.moduleKey, rungs);
  }
  // Postgres sorts an enum by declaration order, which happens to match the
  // ladder today. Sorting explicitly means reordering the enum, or adding a
  // tier in the middle of it, cannot silently reorder a price list.
  return [...byModule.entries()].map(([moduleKey, rungs]) => ({
    moduleKey,
    rungs: rungs.sort((a, b) => PLAN_TIERS.indexOf(a.tier) - PLAN_TIERS.indexOf(b.tier)),
  }));
}

export async function getModuleLadderMap(): Promise<Map<string, ModuleLadder>> {
  return new Map((await listModuleLadders()).map((ladder) => [ladder.moduleKey, ladder]));
}

/**
 * The price of one rung, or null when this module/tier pair is not sold.
 * Checkout treats null as "refuse", never as "fall back to the headline
 * price": charging a Basic customer the Pro price because a row is missing
 * is the one outcome worth failing a checkout over.
 */
export async function getModuleTierPrice(moduleKey: string, tier: PlanTier): Promise<ModuleTierPrice | null> {
  if (!moduleHasPublishedLadder(moduleKey)) return null;
  const row = await db.moduleTierPrice.findUnique({ where: { moduleKey_tier: { moduleKey, tier } } });
  if (!row) return null;
  return {
    moduleKey: row.moduleKey,
    tier,
    monthlyGhs: Number(row.monthlyGhs),
    annualGhs: Number(row.annualGhs),
    includedSeats: row.includedSeats,
    additionalSeatGhs: Number(row.additionalSeatGhs),
  };
}

export async function recommendedSubscriptionQuote(moduleKey: string, durationMonths: number) {
  return computeRecommendedQuote(await getModulePriceMap(), moduleKey, durationMonths);
}

/** Confirmed add-on prices. An add-on with no row has no published price yet. */
export async function listAddonPrices(): Promise<AddonPrice[]> {
  const rows = await db.addonPricingPlan.findMany({ orderBy: { addonKey: "asc" } });
  return rows.map((row) => ({ addonKey: row.addonKey as AddonPrice["addonKey"], monthlyGhs: Number(row.monthlyGhs), annualGhs: Number(row.annualGhs) }));
}
