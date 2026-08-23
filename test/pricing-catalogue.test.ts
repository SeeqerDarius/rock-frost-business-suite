import { describe, expect, it } from "vitest";
import { MODULE_PRICES, PRICING_BUNDLES, recommendedSubscriptionQuote } from "@/lib/pricing";
import { catalogueModuleRegistry } from "@/platform/modules/registry";

describe("subscription pricing catalogue", () => {
  it("prices every available module exactly once", () => {
    expect(new Set(MODULE_PRICES.map((price) => price.moduleKey)).size).toBe(MODULE_PRICES.length);
    expect(MODULE_PRICES.map((price) => price.moduleKey).sort()).toEqual(catalogueModuleRegistry.map((module) => module.key).sort());
  });

  it("provides positive prices, included seats, and annual savings", () => {
    for (const price of MODULE_PRICES) {
      expect(price.monthlyGhs).toBeGreaterThan(0);
      expect(price.includedSeats).toBeGreaterThan(0);
      expect(price.additionalSeatGhs).toBeGreaterThan(0);
      expect(price.annualGhs).toBeLessThan(price.monthlyGhs * 12);
    }
  });

  it("quotes annual catalogue amounts and included seats", () => {
    expect(recommendedSubscriptionQuote("school", 12)).toEqual({ amountGhs: 5990, seatLimit: 20 });
    expect(recommendedSubscriptionQuote("accounting", 12)).toEqual({ amountGhs: 8490, seatLimit: 8 });
    expect(recommendedSubscriptionQuote("accounting", 3)).toEqual({ amountGhs: 2547, seatLimit: 8 });
    expect(recommendedSubscriptionQuote("crm", 3)).toEqual({ amountGhs: 747, seatLimit: 5 });
    expect(recommendedSubscriptionQuote("unknown", 12)).toBeNull();
  });

  it("defines unique customer-facing bundles", () => {
    expect(new Set(PRICING_BUNDLES.map((bundle) => bundle.name)).size).toBe(PRICING_BUNDLES.length);
    expect(Object.fromEntries(PRICING_BUNDLES.map((bundle) => [bundle.key, bundle.monthlyGhs]))).toMatchObject({
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
