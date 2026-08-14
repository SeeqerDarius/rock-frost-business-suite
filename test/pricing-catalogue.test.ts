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
    expect(recommendedSubscriptionQuote("crm", 3)).toEqual({ amountGhs: 747, seatLimit: 5 });
    expect(recommendedSubscriptionQuote("unknown", 12)).toBeNull();
  });

  it("defines unique customer-facing bundles", () => {
    expect(new Set(PRICING_BUNDLES.map((bundle) => bundle.name)).size).toBe(PRICING_BUNDLES.length);
  });
});
