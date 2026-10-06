/**
 * Country-level onboarding suggestions and jurisdiction-aware labels. These
 * are starting values only: an organization administrator must be able to
 * review and change them. Accounting must always use the saved organization
 * currency, never browser locale or IP location.
 *
 * Country behavior lives in this catalog, not in `if (country === ...)`
 * branches across the app. Adding a country means adding a catalog row (and,
 * for tax, a jurisdiction pack under src/modules/tax/packs).
 */
export type TaxPackKey = "GH" | "US" | "EU" | "GB" | "CH" | "NO" | "GENERIC";
export type DateStyle = "DMY" | "MDY" | "YMD";

export type LocalizationDefaults = {
  countryCode: string;
  currency: string;
  locale: string;
  timezone: string;
  taxPack: TaxPackKey;
  dateStyle: DateStyle;
};

/** Field labels that legitimately differ by jurisdiction. */
export type JurisdictionLabels = {
  region: string;
  postalCode: string;
  taxId: string;
  indirectTaxRegistration: string;
  businessRegistration: string;
};

export type CountryProfile = LocalizationDefaults & {
  name: string;
  /** Jurisdiction code used by tax configuration, e.g. GH, US, EU-DE, GB. */
  jurisdictionCode: string;
  euMember: boolean;
  fiscalYearStartMonth: number;
  labels: JurisdictionLabels;
};

const GLOBAL_LABELS: JurisdictionLabels = {
  region: "State/Province/Region",
  postalCode: "Postal/ZIP code",
  taxId: "Tax identification number",
  indirectTaxRegistration: "VAT/GST/Sales tax registration",
  businessRegistration: "Business registration number",
};

const EU_LABELS: JurisdictionLabels = {
  region: "Region",
  postalCode: "Postal code",
  taxId: "Tax identification number",
  indirectTaxRegistration: "VAT identification number",
  businessRegistration: "Company registration number",
};

type CatalogRow = Omit<CountryProfile, "countryCode" | "jurisdictionCode" | "labels" | "euMember" | "fiscalYearStartMonth"> & {
  labels?: Partial<JurisdictionLabels>;
  euMember?: boolean;
  fiscalYearStartMonth?: number;
};

function eu(name: string, currency: string, locale: string, timezone: string): CatalogRow {
  return { name, currency, locale, timezone, taxPack: "EU", dateStyle: "DMY", euMember: true, labels: EU_LABELS };
}

const COUNTRY_CATALOG: Record<string, CatalogRow> = {
  GH: {
    name: "Ghana", currency: "GHS", locale: "en-GH", timezone: "Africa/Accra", taxPack: "GH", dateStyle: "DMY",
    labels: { region: "Region", postalCode: "Digital address (GhanaPostGPS)", taxId: "Taxpayer Identification Number (TIN)", indirectTaxRegistration: "VAT registration number", businessRegistration: "Registrar-General registration number" },
  },
  US: {
    name: "United States", currency: "USD", locale: "en-US", timezone: "America/New_York", taxPack: "US", dateStyle: "MDY",
    labels: { region: "State", postalCode: "ZIP code", taxId: "Employer Identification Number (EIN)", indirectTaxRegistration: "Sales tax permit number", businessRegistration: "State entity number" },
  },
  AT: eu("Austria", "EUR", "de-AT", "Europe/Vienna"),
  BE: eu("Belgium", "EUR", "nl-BE", "Europe/Brussels"),
  BG: eu("Bulgaria", "EUR", "bg-BG", "Europe/Sofia"),
  HR: eu("Croatia", "EUR", "hr-HR", "Europe/Zagreb"),
  CY: eu("Cyprus", "EUR", "el-CY", "Asia/Nicosia"),
  CZ: eu("Czechia", "CZK", "cs-CZ", "Europe/Prague"),
  DK: eu("Denmark", "DKK", "da-DK", "Europe/Copenhagen"),
  EE: eu("Estonia", "EUR", "et-EE", "Europe/Tallinn"),
  FI: eu("Finland", "EUR", "fi-FI", "Europe/Helsinki"),
  FR: eu("France", "EUR", "fr-FR", "Europe/Paris"),
  DE: eu("Germany", "EUR", "de-DE", "Europe/Berlin"),
  GR: eu("Greece", "EUR", "el-GR", "Europe/Athens"),
  HU: eu("Hungary", "HUF", "hu-HU", "Europe/Budapest"),
  IE: eu("Ireland", "EUR", "en-IE", "Europe/Dublin"),
  IT: eu("Italy", "EUR", "it-IT", "Europe/Rome"),
  LV: eu("Latvia", "EUR", "lv-LV", "Europe/Riga"),
  LT: eu("Lithuania", "EUR", "lt-LT", "Europe/Vilnius"),
  LU: eu("Luxembourg", "EUR", "fr-LU", "Europe/Luxembourg"),
  MT: eu("Malta", "EUR", "en-MT", "Europe/Malta"),
  NL: eu("Netherlands", "EUR", "nl-NL", "Europe/Amsterdam"),
  PL: eu("Poland", "PLN", "pl-PL", "Europe/Warsaw"),
  PT: eu("Portugal", "EUR", "pt-PT", "Europe/Lisbon"),
  RO: eu("Romania", "RON", "ro-RO", "Europe/Bucharest"),
  SK: eu("Slovakia", "EUR", "sk-SK", "Europe/Bratislava"),
  SI: eu("Slovenia", "EUR", "sl-SI", "Europe/Ljubljana"),
  ES: eu("Spain", "EUR", "es-ES", "Europe/Madrid"),
  SE: eu("Sweden", "SEK", "sv-SE", "Europe/Stockholm"),
  GB: {
    name: "United Kingdom", currency: "GBP", locale: "en-GB", timezone: "Europe/London", taxPack: "GB", dateStyle: "DMY", fiscalYearStartMonth: 4,
    labels: { region: "County", postalCode: "Postcode", taxId: "Unique Taxpayer Reference (UTR)", indirectTaxRegistration: "VAT registration number", businessRegistration: "Companies House number" },
  },
  CH: { name: "Switzerland", currency: "CHF", locale: "de-CH", timezone: "Europe/Zurich", taxPack: "CH", dateStyle: "DMY", labels: { region: "Canton", postalCode: "Postal code", indirectTaxRegistration: "VAT number (UID MWST)", businessRegistration: "Company identification number (UID)" } },
  NO: { name: "Norway", currency: "NOK", locale: "nb-NO", timezone: "Europe/Oslo", taxPack: "NO", dateStyle: "DMY", labels: { region: "County", postalCode: "Postal code", indirectTaxRegistration: "VAT number (MVA)", businessRegistration: "Organisation number" } },
  JP: { name: "Japan", currency: "JPY", locale: "ja-JP", timezone: "Asia/Tokyo", taxPack: "GENERIC", dateStyle: "YMD", labels: { region: "Prefecture", indirectTaxRegistration: "Qualified invoice issuer number" } },
  CA: { name: "Canada", currency: "CAD", locale: "en-CA", timezone: "America/Toronto", taxPack: "GENERIC", dateStyle: "YMD", labels: { region: "Province/Territory", postalCode: "Postal code", taxId: "Business Number (BN)", indirectTaxRegistration: "GST/HST registration number" } },
  AU: { name: "Australia", currency: "AUD", locale: "en-AU", timezone: "Australia/Sydney", taxPack: "GENERIC", dateStyle: "DMY", fiscalYearStartMonth: 7, labels: { region: "State/Territory", postalCode: "Postcode", taxId: "Australian Business Number (ABN)", indirectTaxRegistration: "GST registration" } },
  NZ: { name: "New Zealand", currency: "NZD", locale: "en-NZ", timezone: "Pacific/Auckland", taxPack: "GENERIC", dateStyle: "DMY", fiscalYearStartMonth: 4, labels: { region: "Region", postalCode: "Postcode", taxId: "IRD number", indirectTaxRegistration: "GST number" } },
  ZA: { name: "South Africa", currency: "ZAR", locale: "en-ZA", timezone: "Africa/Johannesburg", taxPack: "GENERIC", dateStyle: "YMD", fiscalYearStartMonth: 3, labels: { region: "Province", postalCode: "Postal code", indirectTaxRegistration: "VAT registration number" } },
  NG: { name: "Nigeria", currency: "NGN", locale: "en-NG", timezone: "Africa/Lagos", taxPack: "GENERIC", dateStyle: "DMY", labels: { region: "State", taxId: "Tax Identification Number (TIN)", indirectTaxRegistration: "VAT registration number", businessRegistration: "CAC registration number" } },
  KE: { name: "Kenya", currency: "KES", locale: "en-KE", timezone: "Africa/Nairobi", taxPack: "GENERIC", dateStyle: "DMY", fiscalYearStartMonth: 7, labels: { region: "County", taxId: "KRA PIN", indirectTaxRegistration: "VAT registration number" } },
  AE: { name: "United Arab Emirates", currency: "AED", locale: "en-AE", timezone: "Asia/Dubai", taxPack: "GENERIC", dateStyle: "DMY", labels: { region: "Emirate", taxId: "Tax Registration Number (TRN)", indirectTaxRegistration: "VAT TRN" } },
  IN: { name: "India", currency: "INR", locale: "en-IN", timezone: "Asia/Kolkata", taxPack: "GENERIC", dateStyle: "DMY", fiscalYearStartMonth: 4, labels: { region: "State/Union territory", postalCode: "PIN code", taxId: "PAN", indirectTaxRegistration: "GSTIN" } },
  SG: { name: "Singapore", currency: "SGD", locale: "en-SG", timezone: "Asia/Singapore", taxPack: "GENERIC", dateStyle: "DMY", labels: { postalCode: "Postal code", taxId: "Unique Entity Number (UEN)", indirectTaxRegistration: "GST registration number" } },
};

/** Currencies offered for base, transaction, and billing currency pickers. */
export const SUPPORTED_CURRENCIES = [
  "GHS", "USD", "EUR", "GBP", "CHF", "NOK", "SEK", "DKK", "PLN", "CZK", "HUF", "RON",
  "JPY", "CAD", "AUD", "NZD", "ZAR", "NGN", "KES", "AED", "INR", "SGD", "XOF", "CNY",
] as const;

const CURRENCY_LOCALES: Record<string, string> = {
  GHS: "en-GH", USD: "en-US", EUR: "en-IE", GBP: "en-GB", CHF: "de-CH",
  NOK: "nb-NO", SEK: "sv-SE", DKK: "da-DK", PLN: "pl-PL", CZK: "cs-CZ", HUF: "hu-HU", RON: "ro-RO",
  JPY: "ja-JP", CAD: "en-CA", AUD: "en-AU", NZD: "en-NZ",
  ZAR: "en-ZA", NGN: "en-NG", KES: "en-KE", AED: "en-AE", INR: "en-IN",
  SGD: "en-SG", XOF: "fr-SN", CNY: "zh-CN",
};

/** Number formats an organization may choose independently of its locale. */
export const NUMBER_FORMATS = {
  LOCALE: { label: "Follow the selected locale", locale: null },
  COMMA_DOT: { label: "1,234.56", locale: "en-US" },
  DOT_COMMA: { label: "1.234,56", locale: "de-DE" },
  SPACE_COMMA: { label: "1 234,56", locale: "fr-FR" },
  APOSTROPHE_DOT: { label: "1'234.56", locale: "de-CH" },
} as const;
export type NumberFormatKey = keyof typeof NUMBER_FORMATS;

export const DATE_FORMATS = {
  LOCALE: "Follow the selected locale",
  DMY: "DD/MM/YYYY",
  MDY: "MM/DD/YYYY",
  YMD: "YYYY-MM-DD",
} as const;
export type DateFormatKey = keyof typeof DATE_FORMATS;

export const LEGAL_ENTITY_TYPES = [
  "SOLE_PROPRIETORSHIP", "PARTNERSHIP", "LIMITED_LIABILITY_COMPANY", "PRIVATE_LIMITED_COMPANY",
  "PUBLIC_LIMITED_COMPANY", "CORPORATION", "S_CORPORATION", "NON_PROFIT", "COOPERATIVE",
  "GOVERNMENT", "BRANCH_OF_FOREIGN_COMPANY", "OTHER",
] as const;
export type LegalEntityType = (typeof LEGAL_ENTITY_TYPES)[number];

export const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"] as const;

export const SUPPORTED_LANGUAGES = { en: "English", fr: "French", de: "German", es: "Spanish", pt: "Portuguese", nl: "Dutch", it: "Italian" } as const;

const NAME_TO_CODE: Record<string, string> = Object.fromEntries([
  ...Object.entries(COUNTRY_CATALOG).map(([code, row]) => [row.name.toUpperCase(), code]),
  ["UNITED STATES OF AMERICA", "US"], ["USA", "US"], ["BRITAIN", "GB"], ["GREAT BRITAIN", "GB"], ["UK", "GB"],
  ["CZECH REPUBLIC", "CZ"], ["HOLLAND", "NL"], ["UAE", "AE"],
]);

export function normalizeCountryCode(country: string | null | undefined): string | null {
  const value = country?.trim();
  if (!value) return null;
  const normalized = value.toUpperCase();
  if (NAME_TO_CODE[normalized]) return NAME_TO_CODE[normalized];
  if (/^[A-Z]{2}$/.test(normalized)) return normalized;
  return null;
}

export function listCountries(): { code: string; name: string }[] {
  return Object.entries(COUNTRY_CATALOG)
    .map(([code, row]) => ({ code, name: row.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function getLocalizationDefaults(country: string | null | undefined): LocalizationDefaults {
  const normalized = normalizeCountryCode(country);
  const code = normalized ?? "GH";
  const row = COUNTRY_CATALOG[code];
  if (row) {
    return { countryCode: code, currency: row.currency, locale: row.locale, timezone: row.timezone, taxPack: row.taxPack, dateStyle: row.dateStyle };
  }
  return { countryCode: code, currency: "", locale: "", timezone: "", taxPack: "GENERIC", dateStyle: "DMY" };
}

/**
 * Full country profile, including jurisdiction-specific labels. Unknown
 * countries get global labels and no suggested currency/timezone, so the
 * administrator must choose deliberately.
 */
export function getCountryProfile(country: string | null | undefined): CountryProfile {
  const defaults = getLocalizationDefaults(country);
  const row = COUNTRY_CATALOG[defaults.countryCode];
  return {
    ...defaults,
    name: row?.name ?? defaults.countryCode,
    jurisdictionCode: defaultJurisdictionCode(defaults.countryCode, defaults.taxPack),
    euMember: row?.euMember ?? false,
    fiscalYearStartMonth: row?.fiscalYearStartMonth ?? 1,
    labels: { ...GLOBAL_LABELS, ...(row?.labels ?? {}) },
  };
}

/** EU member states are separate VAT jurisdictions under the EU pack (EU-DE, EU-FR...). */
export function defaultJurisdictionCode(countryCode: string, taxPack: TaxPackKey): string {
  return taxPack === "EU" ? `EU-${countryCode}` : countryCode;
}

export function isEuMemberState(country: string | null | undefined): boolean {
  const code = normalizeCountryCode(country);
  return !!code && COUNTRY_CATALOG[code]?.euMember === true;
}

/**
 * First-time onboarding suggestion from the browser's Accept-Language header
 * (e.g. "de-DE,de;q=0.9" → DE). A suggestion only: it must never be used as
 * the accounting currency without the customer confirming the country.
 */
export function suggestCountryFromAcceptLanguage(header: string | null | undefined): string | null {
  if (!header) return null;
  const tags = header.split(",").map((part) => part.split(";")[0]?.trim()).filter(Boolean) as string[];
  for (const tag of tags) {
    const region = tag.split("-").find((segment, index) => index > 0 && /^[A-Za-z]{2}$/.test(segment))?.toUpperCase();
    if (region && COUNTRY_CATALOG[region]) return region;
  }
  return null;
}

/** Region-specific US timezone suggestions where a single default is unsafe. */
export function suggestUsTimezone(stateOrRegion: string | null | undefined): string {
  const region = stateOrRegion?.trim().toUpperCase() ?? "";
  const central = new Set(["AL", "AR", "IA", "IL", "LA", "MN", "MO", "MS", "OK", "WI", "TX", "KS", "NE", "SD", "ND", "TN"]);
  const mountain = new Set(["CO", "MT", "NM", "UT", "WY", "ID"]);
  const arizona = new Set(["AZ"]);
  const pacific = new Set(["CA", "NV", "OR", "WA"]);
  const alaska = new Set(["AK"]);
  const hawaii = new Set(["HI"]);
  if (central.has(region)) return "America/Chicago";
  if (mountain.has(region)) return "America/Denver";
  if (arizona.has(region)) return "America/Phoenix";
  if (pacific.has(region)) return "America/Los_Angeles";
  if (alaska.has(region)) return "America/Anchorage";
  if (hawaii.has(region)) return "Pacific/Honolulu";
  return "America/New_York";
}

export function getDefaultLocaleForCurrency(currencyCode: string | null | undefined): string {
  const currency = currencyCode?.trim().toUpperCase();
  return (currency && CURRENCY_LOCALES[currency]) || "en-GH";
}

let isoCurrencies: Set<string> | null = null;

/**
 * True for a real ISO 4217 code. Intl.NumberFormat accepts any well-formed
 * three-letter code (even "XXQ"), so validate against the runtime's list of
 * known currencies, falling back to the supported set.
 */
export function isValidCurrencyCode(code: string | null | undefined): boolean {
  if (!code || !/^[A-Z]{3}$/.test(code)) return false;
  if (!isoCurrencies) {
    const intl = Intl as typeof Intl & { supportedValuesOf?: (key: string) => string[] };
    const known = intl.supportedValuesOf?.("currency") ?? [];
    isoCurrencies = new Set([...known, ...SUPPORTED_CURRENCIES]);
  }
  return isoCurrencies.has(code);
}

export function isValidTimeZone(timeZone: string | null | undefined): boolean {
  if (!timeZone) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone }).format(0);
    return true;
  } catch {
    return false;
  }
}

export function isValidLocale(locale: string | null | undefined): boolean {
  if (!locale || !/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(locale)) return false;
  try {
    return Intl.NumberFormat.supportedLocalesOf([locale]).length > 0;
  } catch {
    return false;
  }
}

/** All IANA timezones known to the runtime, for settings pickers. */
export function listTimeZones(): string[] {
  const intl = Intl as typeof Intl & { supportedValuesOf?: (key: string) => string[] };
  const zones = intl.supportedValuesOf?.("timeZone") ?? [];
  return zones.includes("UTC") ? zones : ["UTC", ...zones];
}

export function formatLocalizedNumber(value: number, locale: string, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(locale, options).format(value);
}

export function formatLocalizedDate(value: Date | string | number, locale: string, timeZone: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone }).format(value instanceof Date ? value : new Date(value));
}
