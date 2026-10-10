import { describe, expect, it } from "vitest";
import { formatMoney } from "@/lib/currency";
import { formatLocalizedDate, formatLocalizedNumber, getLocalizationDefaults, getDefaultLocaleForCurrency, normalizeCountryCode, suggestUsTimezone } from "@/lib/localization";

describe("global localization defaults", () => {
  it("suggests the existing Ghana defaults without a country and normalizes country names", () => {
    expect(getLocalizationDefaults(null)).toEqual({ countryCode: "GH", currency: "GHS", locale: "en-GH", timezone: "Africa/Accra", taxPack: "GH", dateStyle: "DMY" });
    expect(normalizeCountryCode("United States")).toBe("US");
    expect(getLocalizationDefaults("Ghana").timezone).toBe("Africa/Accra");
  });

  it("keeps EU country defaults distinct and Europe outside the EU separate", () => {
    expect(getLocalizationDefaults("FR")).toMatchObject({ currency: "EUR", locale: "fr-FR", timezone: "Europe/Paris", taxPack: "EU" });
    expect(getLocalizationDefaults("DE")).toMatchObject({ currency: "EUR", locale: "de-DE", timezone: "Europe/Berlin", taxPack: "EU" });
    expect(getLocalizationDefaults("GB").taxPack).toBe("GB");
    expect(getLocalizationDefaults("CH").taxPack).toBe("CH");
  });

  it("uses the region for a US timezone suggestion and leaves unknown countries unconfigured", () => {
    expect(getLocalizationDefaults("US")).toMatchObject({ currency: "USD", taxPack: "US" });
    expect(suggestUsTimezone("CA")).toBe("America/Los_Angeles");
    expect(suggestUsTimezone("NY")).toBe("America/New_York");
    expect(getLocalizationDefaults("BR")).toMatchObject({ countryCode: "BR", currency: "", taxPack: "GENERIC" });
  });

  it("formats currencies using a caller locale or a currency-level fallback", () => {
    expect(formatMoney("1250.5", "USD", "en-US")).toContain("1,250.50");
    expect(formatMoney("1250.5", "EUR", "de-DE")).toContain("1.250,50");
    expect(formatMoney("1250.5", "GHS", "en-GH")).toContain("1,250.50");
    expect(formatMoney("1250.5", "NOTACURRENCY")).toContain("NOTACURRENCY");
    expect(getDefaultLocaleForCurrency("JPY")).toBe("ja-JP");
  });

  it("formats numbers and dates with explicit locale and timezone", () => {
    expect(formatLocalizedNumber(1250.5, "de-DE")).toBe("1.250,5");
    expect(formatLocalizedDate("2026-01-01T00:30:00.000Z", "en-US", "America/Los_Angeles")).toContain("Dec 31, 2025");
  });
});
