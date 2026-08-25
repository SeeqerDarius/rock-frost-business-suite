/**
 * Client-safe pricing types and pure helpers — deliberately has no
 * "server-only" marker and no next/cache or @/lib/db import, unlike
 * pricing.ts, because organization/billing/module-cart.tsx (a "use client"
 * component) imports formatGhs and ModulePrice directly. pricing.ts
 * re-exports everything here for server-side consumers.
 */
import type { BusinessModuleKey } from "@/platform/modules/registry";

export type ModulePrice = {
  moduleKey: BusinessModuleKey;
  monthlyGhs: number;
  annualGhs: number;
  includedSeats: number;
  additionalSeatGhs: number;
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
