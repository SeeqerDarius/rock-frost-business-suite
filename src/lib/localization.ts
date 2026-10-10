/**
 * Country-level onboarding suggestions. These are starting values only: an
 * organization administrator must be able to review and change them.
 * Accounting must always use the saved organization currency, never browser
 * locale or IP location.
 */
export type LocalizationDefaults = {
  countryCode: string;
  currency: string;
  locale: string;
  timezone: string;
  taxPack: "GH" | "US" | "EU" | "GB" | "CH" | "NO" | "GENERIC";
  dateStyle: "DMY" | "MDY" | "YMD";
};

const COUNTRY_DEFAULTS: Record<string, Omit<LocalizationDefaults, "countryCode">> = {
  GH: { currency: "GHS", locale: "en-GH", timezone: "Africa/Accra", taxPack: "GH", dateStyle: "DMY" },
  US: { currency: "USD", locale: "en-US", timezone: "America/New_York", taxPack: "US", dateStyle: "MDY" },
  DE: { currency: "EUR", locale: "de-DE", timezone: "Europe/Berlin", taxPack: "EU", dateStyle: "DMY" },
  FR: { currency: "EUR", locale: "fr-FR", timezone: "Europe/Paris", taxPack: "EU", dateStyle: "DMY" },
  NL: { currency: "EUR", locale: "nl-NL", timezone: "Europe/Amsterdam", taxPack: "EU", dateStyle: "DMY" },
  IE: { currency: "EUR", locale: "en-IE", timezone: "Europe/Dublin", taxPack: "EU", dateStyle: "DMY" },
  GB: { currency: "GBP", locale: "en-GB", timezone: "Europe/London", taxPack: "GB", dateStyle: "DMY" },
  CH: { currency: "CHF", locale: "de-CH", timezone: "Europe/Zurich", taxPack: "CH", dateStyle: "DMY" },
  NO: { currency: "NOK", locale: "nb-NO", timezone: "Europe/Oslo", taxPack: "NO", dateStyle: "DMY" },
  JP: { currency: "JPY", locale: "ja-JP", timezone: "Asia/Tokyo", taxPack: "GENERIC", dateStyle: "YMD" },
  CA: { currency: "CAD", locale: "en-CA", timezone: "America/Toronto", taxPack: "GENERIC", dateStyle: "YMD" },
  AU: { currency: "AUD", locale: "en-AU", timezone: "Australia/Sydney", taxPack: "GENERIC", dateStyle: "DMY" },
  NZ: { currency: "NZD", locale: "en-NZ", timezone: "Pacific/Auckland", taxPack: "GENERIC", dateStyle: "DMY" },
  ZA: { currency: "ZAR", locale: "en-ZA", timezone: "Africa/Johannesburg", taxPack: "GENERIC", dateStyle: "YMD" },
  NG: { currency: "NGN", locale: "en-NG", timezone: "Africa/Lagos", taxPack: "GENERIC", dateStyle: "DMY" },
  KE: { currency: "KES", locale: "en-KE", timezone: "Africa/Nairobi", taxPack: "GENERIC", dateStyle: "DMY" },
  AE: { currency: "AED", locale: "en-AE", timezone: "Asia/Dubai", taxPack: "GENERIC", dateStyle: "DMY" },
  IN: { currency: "INR", locale: "en-IN", timezone: "Asia/Kolkata", taxPack: "GENERIC", dateStyle: "DMY" },
  SG: { currency: "SGD", locale: "en-SG", timezone: "Asia/Singapore", taxPack: "GENERIC", dateStyle: "DMY" },
};

const CURRENCY_LOCALES: Record<string, string> = {
  GHS: "en-GH", USD: "en-US", EUR: "en-IE", GBP: "en-GB", CHF: "de-CH",
  NOK: "nb-NO", JPY: "ja-JP", CAD: "en-CA", AUD: "en-AU", NZD: "en-NZ",
  ZAR: "en-ZA", NGN: "en-NG", KES: "en-KE", AED: "en-AE", INR: "en-IN",
  SGD: "en-SG",
};

export function normalizeCountryCode(country: string | null | undefined): string | null {
  const value = country?.trim();
  if (!value) return null;
  const normalized = value.toUpperCase();
  if (normalized.length === 2) return normalized;
  const names: Record<string, string> = {
    GHANA: "GH", "UNITED STATES": "US", "UNITED STATES OF AMERICA": "US",
    GERMANY: "DE", FRANCE: "FR", NETHERLANDS: "NL", IRELAND: "IE",
    "UNITED KINGDOM": "GB", BRITAIN: "GB", SWITZERLAND: "CH", NORWAY: "NO", JAPAN: "JP",
    CANADA: "CA", AUSTRALIA: "AU", "NEW ZEALAND": "NZ", "SOUTH AFRICA": "ZA", NIGERIA: "NG",
    KENYA: "KE", "UNITED ARAB EMIRATES": "AE", INDIA: "IN", SINGAPORE: "SG",
  };
  return names[normalized] ?? null;
}

export function getLocalizationDefaults(country: string | null | undefined): LocalizationDefaults {
  const normalized = normalizeCountryCode(country);
  if (!normalized) return { countryCode: "GH", ...COUNTRY_DEFAULTS.GH };
  if (COUNTRY_DEFAULTS[normalized]) return { countryCode: normalized, ...COUNTRY_DEFAULTS[normalized] };
  return { countryCode: normalized, currency: "", locale: "", timezone: "", taxPack: "GENERIC", dateStyle: "DMY" };
}

/** Region-specific US timezone suggestions where a single default is unsafe. */
export function suggestUsTimezone(stateOrRegion: string | null | undefined): string {
  const region = stateOrRegion?.trim().toUpperCase() ?? "";
  const central = new Set(["AL", "AR", "IA", "IL", "LA", "MN", "MO", "MS", "OK", "WI"]);
  const mountain = new Set(["CO", "MT", "NM", "UT", "WY"]);
  const pacific = new Set(["CA", "NV", "OR", "WA"]);
  const alaska = new Set(["AK"]);
  const hawaii = new Set(["HI"]);
  if (central.has(region)) return "America/Chicago";
  if (mountain.has(region)) return "America/Denver";
  if (pacific.has(region)) return "America/Los_Angeles";
  if (alaska.has(region)) return "America/Anchorage";
  if (hawaii.has(region)) return "Pacific/Honolulu";
  return "America/New_York";
}

export function getDefaultLocaleForCurrency(currencyCode: string | null | undefined): string {
  const currency = currencyCode?.trim().toUpperCase();
  return (currency && CURRENCY_LOCALES[currency]) || "en-GH";
}

export function formatLocalizedNumber(value: number, locale: string, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(locale, options).format(value);
}

export function formatLocalizedDate(value: Date | string | number, locale: string, timeZone: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone }).format(value instanceof Date ? value : new Date(value));
}
