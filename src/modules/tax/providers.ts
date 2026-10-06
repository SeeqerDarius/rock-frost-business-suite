/**
 * Provider abstractions so Accounting never couples to an external tax
 * vendor. Nothing here calls the network: registry and rate providers are
 * registered when an organization configures one, and until then the
 * built-in implementations are used and labeled for what they are.
 */

// --- VAT / tax identification number validation ---------------------------

export type VatIdCheck = {
  countryCode: string;
  normalized: string;
  /** "FORMAT" means only the shape was checked; it does not prove registration. */
  level: "FORMAT" | "REGISTRY";
  valid: boolean;
  provider: string;
  checkedAt: Date;
  registeredName?: string | null;
  registeredAddress?: string | null;
  message: string;
};

export interface VatIdValidationProvider {
  readonly name: string;
  readonly level: "FORMAT" | "REGISTRY";
  validate(countryCode: string, vatNumber: string): Promise<VatIdCheck>;
}

/** Simplified national VAT number shapes (after removing the country prefix). */
const VAT_FORMATS: Record<string, RegExp> = {
  AT: /^U\d{8}$/, BE: /^[01]\d{9}$/, BG: /^\d{9,10}$/, HR: /^\d{11}$/, CY: /^\d{8}[A-Z]$/, CZ: /^\d{8,10}$/, DK: /^\d{8}$/, EE: /^\d{9}$/,
  FI: /^\d{8}$/, FR: /^[0-9A-Z]{2}\d{9}$/, DE: /^\d{9}$/, EL: /^\d{9}$/, HU: /^\d{8}$/, IE: /^\d{7}[A-W][A-I]?$|^\d[A-Z+*]\d{5}[A-W]$/, IT: /^\d{11}$/,
  LV: /^\d{11}$/, LT: /^(\d{9}|\d{12})$/, LU: /^\d{8}$/, MT: /^\d{8}$/, NL: /^\d{9}B\d{2}$/, PL: /^\d{10}$/, PT: /^\d{9}$/, RO: /^\d{2,10}$/,
  SK: /^\d{10}$/, SI: /^\d{8}$/, ES: /^[0-9A-Z]\d{7}[0-9A-Z]$/, SE: /^\d{12}$/, XI: /^(\d{9}|\d{12}|GD\d{3}|HA\d{3})$/,
  GB: /^(\d{9}|\d{12}|GD\d{3}|HA\d{3})$/, CH: /^E?\d{9}(MWST|TVA|IVA)?$/, NO: /^\d{9}(MVA)?$/,
};

/** Greece uses the EL prefix in VAT numbers. */
function vatPrefix(countryCode: string) {
  return countryCode === "GR" ? "EL" : countryCode;
}

export function normalizeVatNumber(countryCode: string, vatNumber: string): string {
  const prefix = vatPrefix(countryCode.toUpperCase());
  let value = vatNumber.toUpperCase().replace(/[\s.\-]/g, "");
  if (value.startsWith(prefix)) value = value.slice(prefix.length);
  if (prefix === "CH" && value.startsWith("CHE")) value = value.slice(3);
  return value;
}

export const formatOnlyVatProvider: VatIdValidationProvider = {
  name: "format-check",
  level: "FORMAT",
  async validate(countryCode, vatNumber) {
    const country = countryCode.toUpperCase();
    const normalized = normalizeVatNumber(country, vatNumber);
    const pattern = VAT_FORMATS[vatPrefix(country)];
    const valid = pattern ? pattern.test(normalized) : normalized.length >= 5;
    return {
      countryCode: country, normalized, level: "FORMAT", valid, provider: "format-check", checkedAt: new Date(),
      message: valid ? "The number has a valid format. Registration has not been verified with a tax registry." : "The number does not match the expected format for this country.",
    };
  },
};

const vatProviders: VatIdValidationProvider[] = [];

/** Registers a registry-backed provider (for example an EU VIES adapter). */
export function registerVatIdProvider(provider: VatIdValidationProvider) {
  vatProviders.unshift(provider);
}

export async function validateVatNumber(countryCode: string, vatNumber: string): Promise<VatIdCheck> {
  const provider = vatProviders[0] ?? formatOnlyVatProvider;
  return provider.validate(countryCode, vatNumber);
}

// --- External tax rate providers -----------------------------------------

export type TaxQuoteRequest = {
  organizationId: string;
  documentDate: Date;
  currency: string;
  shipFrom?: { countryCode: string; region?: string | null; postalCode?: string | null; city?: string | null };
  shipTo: { countryCode: string; region?: string | null; postalCode?: string | null; city?: string | null; line1?: string | null };
  customerExemptionNumber?: string | null;
  lines: { amount: string; categoryCode?: string | null; description?: string | null }[];
};

export type TaxQuoteComponent = { jurisdictionCode: string; jurisdictionLevel: string; name: string; taxKind: string; rate: string; taxableAmount: string; taxAmount: string };

/**
 * A professional tax engine (address-level US sales tax, for example) can
 * implement this to return jurisdiction components for a document. The
 * internal manual configuration (rules and rates) remains the default and
 * keeps working when no provider is configured. A provider's quote must be
 * stored as the document's tax-line snapshot like any other calculation.
 */
export interface TaxRateProvider {
  readonly name: string;
  quote(request: TaxQuoteRequest): Promise<TaxQuoteComponent[]>;
}

const rateProviders = new Map<string, TaxRateProvider>();

export function registerTaxRateProvider(provider: TaxRateProvider) {
  rateProviders.set(provider.name, provider);
}

export function getTaxRateProvider(name: string | null | undefined): TaxRateProvider | null {
  return name ? rateProviders.get(name) ?? null : null;
}
