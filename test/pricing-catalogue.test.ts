import { describe, expect, it } from "vitest";
import { MODULE_PRICING_SEED, PRICING_BUNDLE_SEED } from "../prisma/seed-data";
import { computeRecommendedQuote } from "@/lib/pricing-shared";
import { catalogueModuleRegistry } from "@/platform/modules/registry";

/**
 * The catalogue is database-backed and operator-editable (see
 * ModulePricingPlan/PricingBundle in prisma/schema.prisma and
 * /app/platform/subscriptions's "Pricing catalogue" section). These tests
 * validate the seed data's own invariants directly, and exercise the pure
 * quote-computation logic (imported from pricing-shared.ts, which has no
 * next/cache or @/lib/db dependency) rather than hitting the database or
 * mocking unstable_cache — see test/public-marketing-caching.test.ts for why
 * this codebase tests unstable_cache-wrapped reads via source assertion
 * instead.
 */
describe("subscription pricing catalogue seed data", () => {
  it("prices every available module exactly once", () => {
    expect(new Set(MODULE_PRICING_SEED.map((price) => price.moduleKey)).size).toBe(MODULE_PRICING_SEED.length);
    expect(MODULE_PRICING_SEED.map((price) => price.moduleKey).sort()).toEqual(catalogueModuleRegistry.map((module) => module.key).sort());
  });

  it("provides positive prices, included seats, and annual savings", () => {
    for (const price of MODULE_PRICING_SEED) {
      expect(price.monthlyGhs).toBeGreaterThan(0);
      expect(price.includedSeats).toBeGreaterThan(0);
      expect(price.additionalSeatGhs).toBeGreaterThan(0);
      expect(price.annualGhs).toBeLessThan(price.monthlyGhs * 12);
    }
  });

  it("defines unique customer-facing bundles", () => {
    expect(new Set(PRICING_BUNDLE_SEED.map((bundle) => bundle.name)).size).toBe(PRICING_BUNDLE_SEED.length);
    expect(Object.fromEntries(PRICING_BUNDLE_SEED.map((bundle) => [bundle.key, bundle.monthlyGhs]))).toMatchObject({
      "business-starter": 1699,
      "retail-suite": 2299,
      "business-complete": 3499,
      "school-complete": 3199,
      "school-hostel-complete": 3499,
      "pharmacy-complete": 2899,
      "hospital-complete": 5199,
    });
  });
});

describe("computeRecommendedQuote", () => {
  const priceMap = new Map(MODULE_PRICING_SEED.map((price) => [price.moduleKey, price]));

  it("quotes annual catalogue amounts and included seats", () => {
    expect(computeRecommendedQuote(priceMap, "school", 12)).toEqual({ amountGhs: 5990, seatLimit: 20 });
    expect(computeRecommendedQuote(priceMap, "accounting", 12)).toEqual({ amountGhs: 8490, seatLimit: 8 });
    expect(computeRecommendedQuote(priceMap, "accounting", 3)).toEqual({ amountGhs: 2547, seatLimit: 8 });
    expect(computeRecommendedQuote(priceMap, "crm", 3)).toEqual({ amountGhs: 747, seatLimit: 5 });
    expect(computeRecommendedQuote(priceMap, "unknown", 12)).toBeNull();
  });
});
