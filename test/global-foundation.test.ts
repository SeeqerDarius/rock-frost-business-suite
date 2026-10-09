import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import {
  getCountryProfile,
  isEuMemberState,
  isValidCurrencyCode,
  isValidLocale,
  isValidTimeZone,
  listCountries,
  normalizeCountryCode,
  suggestCountryFromAcceptLanguage,
} from "@/lib/localization";
import { createOrganizationFormatter, resolveOrganizationPresentation, zonedDateParts } from "@/lib/org-format";
import { buildFxSnapshot, convertToBase, ExchangeRateError, invertRate, parseRate, realizedFxDifference, unrealizedFxDifference } from "@/modules/globalization/fx";

/** Intl inserts narrow/no-break spaces in some locales; normalize for assertions. */
const plain = (value: string) => value.replace(/[  ]/g, " ");

describe("country profiles and onboarding defaults", () => {
  it("defaults Ghana to GHS, Africa/Accra, and the GH pack with Ghana labels", () => {
    const gh = getCountryProfile("Ghana");
    expect(gh).toMatchObject({ countryCode: "GH", currency: "GHS", timezone: "Africa/Accra", locale: "en-GH", jurisdictionCode: "GH", euMember: false });
    expect(gh.labels.taxId).toContain("TIN");
  });

  it("defaults the United States to USD, US formatting, and a State/ZIP/EIN vocabulary", () => {
    const us = getCountryProfile("US");
    expect(us).toMatchObject({ currency: "USD", locale: "en-US", dateStyle: "MDY", jurisdictionCode: "US", taxPack: "US" });
    expect(us.labels).toMatchObject({ region: "State", postalCode: "ZIP code" });
    expect(us.labels.taxId).toContain("EIN");
  });

  it("gives every EU member state its own VAT jurisdiction and keeps UK/CH/NO out of the EU pack", () => {
    expect(getCountryProfile("DE")).toMatchObject({ currency: "EUR", locale: "de-DE", timezone: "Europe/Berlin", jurisdictionCode: "EU-DE", euMember: true });
    expect(getCountryProfile("FR").jurisdictionCode).toBe("EU-FR");
    expect(getCountryProfile("NL").jurisdictionCode).toBe("EU-NL");
    expect(getCountryProfile("SE").currency).toBe("SEK");
    for (const code of ["GB", "CH", "NO"]) {
      expect(getCountryProfile(code).euMember).toBe(false);
      expect(getCountryProfile(code).jurisdictionCode).toBe(code);
      expect(isEuMemberState(code)).toBe(false);
    }
    expect(getCountryProfile("GB")).toMatchObject({ currency: "GBP", fiscalYearStartMonth: 4 });
    expect(getCountryProfile("JP").currency).toBe("JPY");
  });

  it("does not leak Ghana terminology into other jurisdictions", () => {
    for (const code of ["US", "DE", "GB", "CA"]) {
      const labels = Object.values(getCountryProfile(code).labels).join(" ");
      expect(labels).not.toMatch(/GRA|Ghana|GhanaPost|Registrar-General/);
    }
  });

  it("leaves unknown countries without a currency or timezone so the admin must choose", () => {
    expect(getCountryProfile("BR")).toMatchObject({ countryCode: "BR", currency: "", timezone: "", jurisdictionCode: "BR" });
    expect(getCountryProfile("BR").labels.region).toBe("State/Province/Region");
  });

  it("normalizes names, aliases, and codes, and lists countries alphabetically", () => {
    expect(normalizeCountryCode("United Kingdom")).toBe("GB");
    expect(normalizeCountryCode("uk")).toBe("GB");
    expect(normalizeCountryCode("de")).toBe("DE");
    expect(normalizeCountryCode("Atlantis")).toBeNull();
    const names = listCountries().map((country) => country.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  it("uses Accept-Language only as a suggestion and ignores unknown regions", () => {
    expect(suggestCountryFromAcceptLanguage("de-DE,de;q=0.9,en;q=0.8")).toBe("DE");
    expect(suggestCountryFromAcceptLanguage("en-US")).toBe("US");
    expect(suggestCountryFromAcceptLanguage("en")).toBeNull();
    expect(suggestCountryFromAcceptLanguage("zz-QQ")).toBeNull();
    expect(suggestCountryFromAcceptLanguage(null)).toBeNull();
  });

  it("validates currency, timezone, and locale identifiers", () => {
    expect(isValidCurrencyCode("USD")).toBe(true);
    expect(isValidCurrencyCode("usd")).toBe(false);
    expect(isValidCurrencyCode("XXQ")).toBe(false);
    expect(isValidTimeZone("America/Chicago")).toBe(true);
    expect(isValidTimeZone("Mars/Base")).toBe(false);
    expect(isValidLocale("de-DE")).toBe(true);
    expect(isValidLocale("not a locale")).toBe(false);
  });
});

describe("organization formatting", () => {
  it("keeps existing Ghana organizations on en-GH when no locale is saved", () => {
    expect(resolveOrganizationPresentation({ currency: "GHS", locale: null }).locale).toBe("en-GH");
    expect(plain(createOrganizationFormatter({ currency: "GHS" }).money("1250.5"))).toMatch(/GH₵\s?1,250\.50/);
  });

  it("formats USD and EUR in each organization's own locale", () => {
    expect(createOrganizationFormatter({ currency: "USD", locale: "en-US" }).money("1250.5")).toBe("$1,250.50");
    expect(plain(createOrganizationFormatter({ currency: "EUR", locale: "de-DE" }).money("1250.5"))).toBe("1.250,50 €");
    expect(plain(createOrganizationFormatter({ currency: "EUR", locale: "fr-FR" }).money("1250.5"))).toBe("1 250,50 €");
  });

  it("formats a foreign-currency amount without changing the organization currency", () => {
    const format = createOrganizationFormatter({ currency: "GHS", locale: "en-GH" });
    expect(format.money("100", "USD")).toContain("100.00");
    expect(format.money("100", "USD")).toContain("$");
  });

  it("applies an explicit number format independent of locale", () => {
    expect(createOrganizationFormatter({ currency: "USD", locale: "en-US", numberFormat: "DOT_COMMA" }).number(1234.5, { minimumFractionDigits: 2 })).toBe("1.234,50");
  });

  it("renders dates in the organization timezone, not the server's", () => {
    // 2026-01-01T03:30Z is still 31 December in Los Angeles and already 1 January in Accra.
    const instant = new Date("2026-01-01T03:30:00.000Z");
    expect(createOrganizationFormatter({ currency: "USD", timezone: "America/Los_Angeles", dateFormat: "MDY" }).date(instant)).toBe("12/31/2025");
    expect(createOrganizationFormatter({ currency: "GHS", timezone: "Africa/Accra", dateFormat: "DMY" }).date(instant)).toBe("01/01/2026");
    expect(createOrganizationFormatter({ currency: "EUR", timezone: "Europe/Berlin", dateFormat: "YMD" }).date(instant)).toBe("2026-01-01");
    expect(zonedDateParts(instant, "Asia/Tokyo")).toEqual({ year: "2026", month: "01", day: "01" });
  });

  it("falls back safely on invalid stored values", () => {
    const presentation = resolveOrganizationPresentation({ currency: "usd", locale: "bad locale!", timezone: "Nowhere/City", dateFormat: "XYZ", numberFormat: "XYZ" });
    expect(presentation).toEqual({ currency: "USD", locale: "en-US", timezone: "UTC", dateFormat: "LOCALE", numberFormat: "LOCALE" });
  });
});

describe("foreign-exchange arithmetic", () => {
  it("converts with exact decimals and rounds half-up to the cent", () => {
    expect(convertToBase("100.00", "15.2345").toString()).toBe("1523.45");
    expect(convertToBase("0.1", "0.2").toString()).toBe("0.02");
    expect(convertToBase("10.005", "1").toString()).toBe("10.01");
    // A float-based implementation would drift on this classic case.
    expect(convertToBase("0.3", "3").toString()).toBe("0.9");
  });

  it("rejects zero, negative, non-numeric, and over-precise rates", () => {
    expect(() => parseRate("0")).toThrow(ExchangeRateError);
    expect(() => parseRate("-1")).toThrow(ExchangeRateError);
    expect(() => parseRate("abc")).toThrow(ExchangeRateError);
    expect(() => parseRate("1.12345678901")).toThrow(ExchangeRateError);
    expect(parseRate("1.1234567890").toString()).toBe("1.123456789");
  });

  it("inverts a rate at 10 decimal places", () => {
    expect(invertRate("15").toString()).toBe("0.0666666667");
  });

  it("computes realized gains and losses for receivables and payables", () => {
    // Invoice USD 1,000 booked at 15.00, collected at 15.50: receivable gain of 500.
    expect(realizedFxDifference({ side: "RECEIVABLE", settledForeignAmount: "1000", bookedRate: "15", settlementRate: "15.5" }).toString()).toBe("500");
    // Bill USD 1,000 booked at 15.00, paid at 15.50: payable loss of 500.
    expect(realizedFxDifference({ side: "PAYABLE", settledForeignAmount: "1000", bookedRate: "15", settlementRate: "15.5" }).toString()).toBe("-500");
    expect(realizedFxDifference({ side: "RECEIVABLE", settledForeignAmount: "1000", bookedRate: "15", settlementRate: "15" }).isZero()).toBe(true);
    expect(unrealizedFxDifference({ side: "RECEIVABLE", openForeignAmount: "200", carryingRate: "15", revaluationRate: "14.5" }).toString()).toBe("-100");
  });

  it("snapshots the original amount, currency, rate, date, and base equivalent", () => {
    const rateDate = new Date("2026-10-01T00:00:00.000Z");
    const snapshot = buildFxSnapshot({ amount: "250.00", currency: "usd", baseCurrency: "GHS", rate: "15.2", rateDate, rateSource: "MANUAL" });
    expect(snapshot).toMatchObject({ currency: "USD", baseCurrency: "GHS", rateDate, rateSource: "MANUAL" });
    expect(snapshot.rate.toString()).toBe("15.2");
    expect(snapshot.baseAmount.toString()).toBe("3800");
    const base = buildFxSnapshot({ amount: "250", currency: "GHS", baseCurrency: "GHS", rate: "99", rateDate, rateSource: "MANUAL" });
    expect(base.rate.equals(new Prisma.Decimal(1))).toBe(true);
    expect(base.rateSource).toBe("BASE");
  });
});
