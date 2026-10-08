import { describe, expect, it } from "vitest";
import { catalogEntry, catalogRateCode, EU_REDUCED_CATALOG_SOURCES, EU_REDUCED_RATE_CATALOG } from "@/modules/tax/packs/eu-reduced-rates";
import { EU_MEMBER_STATES } from "@/modules/tax/packs/europe";

describe("EU reduced-rate reference catalog", () => {
  it("covers exactly the 27 member states", () => {
    expect(EU_REDUCED_RATE_CATALOG.map((entry) => entry.countryCode).sort()).toEqual(EU_MEMBER_STATES.map((state) => state.code).sort());
  });

  it("lists only rates below each standard rate, without duplicates, and keeps disputed rates out of the applicable list", () => {
    for (const entry of EU_REDUCED_RATE_CATALOG) {
      const standard = Number(EU_MEMBER_STATES.find((state) => state.code === entry.countryCode)!.standardRate);
      const rates = entry.rates.map((item) => item.rate);
      expect(new Set(rates).size).toBe(rates.length);
      for (const rate of rates) {
        expect(Number.isFinite(Number(rate))).toBe(true);
        expect(Number(rate)).toBeGreaterThan(0);
        expect(Number(rate)).toBeLessThan(standard);
      }
      for (const disputed of entry.unconfirmed) expect(rates).not.toContain(disputed.rate);
    }
  });

  it("records where the rates came from, and builds valid rate codes", () => {
    expect(EU_REDUCED_CATALOG_SOURCES).toHaveLength(2);
    expect(catalogRateCode("FR", "5.5")).toBe("EU-FR-RED-5_5");
    for (const entry of EU_REDUCED_RATE_CATALOG) for (const item of entry.rates) expect(catalogRateCode(entry.countryCode, item.rate)).toMatch(/^[A-Z0-9][A-Z0-9_-]{0,63}$/);
    expect(catalogEntry("de")?.rates.map((item) => item.rate)).toEqual(["7"]);
    expect(catalogEntry("GB")).toBeNull();
  });
});
