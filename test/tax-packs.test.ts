import { describe, expect, it } from "vitest";
import { getJurisdictionPack, homeCountryForJurisdiction, listJurisdictionPacks, packKeyForJurisdiction } from "@/modules/tax/packs";
import { EU_MEMBER_STATES } from "@/modules/tax/packs/europe";
import { US_FEDERAL_ACCOUNTS, US_STATE_BASE_RATE_REFERENCE, US_STATES } from "@/modules/tax/packs/united-states";
import { formatOnlyVatProvider, normalizeVatNumber, validateVatNumber } from "@/modules/tax/providers";
import { zonedDateRange, zonedDayStart } from "@/lib/timezone";

describe("United States pack", () => {
  const pack = getJurisdictionPack("US")!;

  it("seeds every state and DC under the US and never charges tax on its own", () => {
    expect(US_STATES).toHaveLength(51);
    expect(pack.jurisdictions).toHaveLength(52);
    expect(pack.jurisdictions.filter((j) => j.level === "STATE").every((j) => j.parentCode === "US" && j.code.startsWith("US-"))).toBe(true);
    expect(pack.rates).toHaveLength(0);
    expect(pack.rules).toHaveLength(0);
    expect(pack.foundationOnly).toBe(true);
  });

  it("keeps federal income, employment, and excise taxes in their own accounts", () => {
    const codes = US_FEDERAL_ACCOUNTS.map((account) => account.code);
    expect(codes).toEqual(expect.arrayContaining(["2200", "1450", "2211", "2212", "2213", "2214", "2215", "2160", "2140", "2145"]));
    expect(new Set(codes).size).toBe(codes.length);
    expect(pack.accounts).toBe(US_FEDERAL_ACCOUNTS);
  });

  it("offers a reference base rate for every state as a suggestion only", () => {
    for (const state of US_STATES) expect(US_STATE_BASE_RATE_REFERENCE[state.code], state.code).toBeDefined();
    expect(US_STATE_BASE_RATE_REFERENCE.OR.rate).toBe("0");
  });
});

describe("European packs", () => {
  it("builds an EU pack for the home member state with per-country VAT and OSS destination rules", () => {
    const pack = getJurisdictionPack("EU", { homeCountry: "DE" })!;
    expect(EU_MEMBER_STATES).toHaveLength(27);
    expect(pack.name).toContain("Germany");
    expect(pack.jurisdictions.map((j) => j.code)).toEqual(expect.arrayContaining(["EU", "EU-OSS", "EU-IOSS", "EU-DE", "EU-FR"]));
    expect(pack.rates).toHaveLength(27);
    expect(pack.rates.find((rate) => rate.code === "EU-DE-STD")?.rate).toBe("19");
    expect(pack.rates.find((rate) => rate.code === "EU-FR-STD")?.rate).toBe("20");
    expect(pack.rules.filter((rule) => rule.categoryCode === "OSS_B2C")).toHaveLength(26);
    expect(pack.rules.find((rule) => rule.code === "EU-DE-INTRA-B2B-RC")?.treatment).toBe("REVERSE_CHARGE");
    expect(pack.rules.find((rule) => rule.code === "EU-DE-EXPORT")?.treatment).toBe("ZERO_RATED");
    expect(pack.rules.some((rule) => rule.code === "EU-DE-OSS-B2C")).toBe(false);
  });

  it("refuses an EU pack without an EU home member state", () => {
    expect(getJurisdictionPack("EU")).toBeNull();
    expect(getJurisdictionPack("EU", { homeCountry: "GB" })).toBeNull();
  });

  it("keeps the UK, Switzerland, and Norway out of the EU", () => {
    for (const key of ["GB", "CH", "NO"]) {
      const pack = getJurisdictionPack(key)!;
      expect(pack.key).toBe(key);
      expect(pack.jurisdictions.every((j) => !j.code.startsWith("EU") && j.parentCode !== "EU")).toBe(true);
      expect(pack.rates.every((rate) => rate.jurisdictionCode === key)).toBe(true);
    }
    expect(getJurisdictionPack("GB")!.rates.find((rate) => rate.code === "GB-VAT-STD")?.rate).toBe("20");
    expect(getJurisdictionPack("CH")!.rates.find((rate) => rate.code === "CH-VAT-STD")?.rate).toBe("8.1");
    expect(getJurisdictionPack("NO")!.rates.find((rate) => rate.code === "NO-MVA-STD")?.rate).toBe("25");
  });

  it("lists every pack and maps jurisdiction codes to pack keys and home states", () => {
    expect(listJurisdictionPacks().map((pack) => pack.key)).toEqual(expect.arrayContaining(["GH", "US", "EU", "GB", "CH", "NO"]));
    expect(packKeyForJurisdiction("EU-DE")).toBe("EU");
    expect(packKeyForJurisdiction("US-GA")).toBe("US");
    expect(homeCountryForJurisdiction("EU-FR")).toBe("FR");
    expect(homeCountryForJurisdiction("GB")).toBeNull();
  });
});

describe("VAT number validation", () => {
  it("checks the format only and says so", async () => {
    const ok = await validateVatNumber("DE", "DE 123 456 789");
    expect(ok).toMatchObject({ valid: true, level: "FORMAT", normalized: "123456789", provider: "format-check" });
    expect(ok.message).toMatch(/not been verified/);
    expect((await validateVatNumber("DE", "DE12345")).valid).toBe(false);
  });

  it("handles country-specific prefixes and shapes", async () => {
    expect(normalizeVatNumber("GR", "EL123456789")).toBe("123456789");
    expect((await formatOnlyVatProvider.validate("NL", "NL123456789B01")).valid).toBe(true);
    expect((await formatOnlyVatProvider.validate("GB", "GB123456789")).valid).toBe(true);
    expect((await formatOnlyVatProvider.validate("FR", "FRXX123456789")).valid).toBe(true);
    expect((await formatOnlyVatProvider.validate("AT", "ATU12345678")).valid).toBe(true);
    expect((await formatOnlyVatProvider.validate("AT", "AT12345678")).valid).toBe(false);
  });
});

describe("timezone reporting boundaries", () => {
  it("starts a local day at the right UTC instant", () => {
    expect(zonedDayStart("2026-11-01", "Africa/Accra").toISOString()).toBe("2026-11-01T00:00:00.000Z");
    expect(zonedDayStart("2026-11-01", "Asia/Tokyo").toISOString()).toBe("2026-10-31T15:00:00.000Z");
    expect(zonedDayStart("2026-07-01", "America/New_York").toISOString()).toBe("2026-07-01T04:00:00.000Z");
    expect(zonedDayStart("2026-12-01", "America/New_York").toISOString()).toBe("2026-12-01T05:00:00.000Z");
  });

  it("handles daylight saving changeover days", () => {
    // US clocks move forward on 8 March 2026 and back on 1 November 2026.
    expect(zonedDayStart("2026-03-08", "America/New_York").toISOString()).toBe("2026-03-08T05:00:00.000Z");
    expect(zonedDayStart("2026-11-01", "America/New_York").toISOString()).toBe("2026-11-01T04:00:00.000Z");
    expect(zonedDayStart("2026-03-29", "Europe/Berlin").toISOString()).toBe("2026-03-28T23:00:00.000Z");
  });

  it("covers whole local days with an exclusive end", () => {
    const { start, end } = zonedDateRange("2026-11-01", "2026-11-30", "America/New_York");
    expect(start.toISOString()).toBe("2026-11-01T04:00:00.000Z");
    expect(end.toISOString()).toBe("2026-12-01T05:00:00.000Z");
    expect(() => zonedDateRange("2026-11-30", "2026-11-01", "UTC")).toThrow();
  });
});
