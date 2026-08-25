import "server-only";

import { db } from "@/lib/db";
import { computeRecommendedQuote, type ModulePrice, type PricingBundle } from "@/lib/pricing-shared";
import { getModule, type BusinessModuleKey } from "@/platform/modules/registry";

export type { ModulePrice, PricingBundle, PricingBundleKey } from "@/lib/pricing-shared";
export { computeRecommendedQuote, formatGhs } from "@/lib/pricing-shared";

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

export async function recommendedSubscriptionQuote(moduleKey: string, durationMonths: number) {
  return computeRecommendedQuote(await getModulePriceMap(), moduleKey, durationMonths);
}
