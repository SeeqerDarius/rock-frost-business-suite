/**
 * Provider abstractions so Accounting never couples to an external tax
 * vendor. EU and Northern Ireland VAT numbers are checked against the
 * European Commission's VIES registry when it is enabled (production by
 * default); every other check is format-only and labeled as such. Rate
 * providers are registered when an organization configures one.
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
  /** VIES consultation number (only when the requester's own VAT number was sent). */
  consultationNumber?: string | null;
  /** UNAVAILABLE: the registry could not be reached and only the format was checked. */
  status: "VALID" | "INVALID" | "UNAVAILABLE";
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
      countryCode: country, normalized, level: "FORMAT", valid, status: valid ? "VALID" : "INVALID", provider: "format-check", checkedAt: new Date(),
      message: valid ? "The number has a valid format. Registration has not been verified with a tax registry." : "The number does not match the expected format for this country.",
    };
  },
};

// --- EU VIES registry ------------------------------------------------------

export const VIES_ENDPOINT = "https://ec.europa.eu/taxation_customs/vies/rest-api/check-vat-number";

/** Member states (VIES uses EL for Greece) plus Northern Ireland (XI). */
const VIES_PREFIXES = new Set(["AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "EL", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE", "XI"]);

export function isViesCountry(countryCode: string) {
  return VIES_PREFIXES.has(vatPrefix(countryCode.toUpperCase()));
}

/** On in production unless VIES_ENABLED=false; elsewhere only with VIES_ENABLED=true, so tests never call the registry. */
export function viesEnabled() {
  if (process.env.VIES_ENABLED === "true") return true;
  if (process.env.VIES_ENABLED === "false") return false;
  return process.env.NODE_ENV === "production" && !process.env.VITEST;
}

export type ViesRequester = { countryCode: string; vatNumber: string };
type ViesResponse = { valid?: boolean; name?: string | null; address?: string | null; requestIdentifier?: string | null; userError?: string | null; errorWrappers?: { error?: string; message?: string }[] };

const hidden = (value: string | null | undefined) => (value && value.trim() && value.trim() !== "---" ? value.trim() : null);

/**
 * Checks a number with VIES. A registry outage (member state unavailable,
 * rate limits, timeouts) is never reported as "invalid": the result falls
 * back to a format check with status UNAVAILABLE so the user can retry.
 */
export async function checkVies(countryCode: string, vatNumber: string, options: { requester?: ViesRequester | null; fetchImpl?: typeof fetch; timeoutMs?: number } = {}): Promise<VatIdCheck> {
  const country = countryCode.toUpperCase();
  const prefix = vatPrefix(country);
  const normalized = normalizeVatNumber(country, vatNumber);
  const unavailable = async (reason: string): Promise<VatIdCheck> => {
    const format = await formatOnlyVatProvider.validate(country, vatNumber);
    return { ...format, status: format.valid ? "UNAVAILABLE" : "INVALID", message: format.valid ? `VIES could not confirm the number (${reason}). Its format is valid; check again later.` : format.message };
  };
  const body: Record<string, string> = { countryCode: prefix, vatNumber: normalized };
  if (options.requester && isViesCountry(options.requester.countryCode)) {
    body.requesterMemberStateCode = vatPrefix(options.requester.countryCode.toUpperCase());
    body.requesterNumber = normalizeVatNumber(options.requester.countryCode, options.requester.vatNumber);
  }
  let response: Response;
  try {
    response = await (options.fetchImpl ?? fetch)(VIES_ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(options.timeoutMs ?? 8000) });
  } catch {
    return unavailable("the registry did not respond");
  }
  let payload: ViesResponse;
  try {
    payload = (await response.json()) as ViesResponse;
  } catch {
    return unavailable(`unexpected response ${response.status}`);
  }
  if (!response.ok) {
    const code = payload.errorWrappers?.[0]?.error ?? String(response.status);
    if (code === "INVALID_INPUT") return { countryCode: country, normalized, level: "REGISTRY", valid: false, status: "INVALID", provider: "vies", checkedAt: new Date(), message: "VIES rejected the number as malformed." };
    return unavailable(code.toLowerCase().replaceAll("_", " "));
  }
  if (payload.userError && payload.userError !== "VALID" && payload.userError !== "INVALID") return unavailable(payload.userError.toLowerCase().replaceAll("_", " "));
  const valid = payload.valid === true;
  return {
    countryCode: country, normalized, level: "REGISTRY", valid, status: valid ? "VALID" : "INVALID", provider: "vies", checkedAt: new Date(),
    registeredName: valid ? hidden(payload.name) : null, registeredAddress: valid ? hidden(payload.address) : null, consultationNumber: hidden(payload.requestIdentifier),
    message: valid ? "VIES confirms this VAT number is registered for intra-EU transactions." : "VIES reports that this VAT number is not valid for intra-EU transactions.",
  };
}

const vatProviders: VatIdValidationProvider[] = [];

/** Registers a registry-backed provider for countries VIES does not cover. */
export function registerVatIdProvider(provider: VatIdValidationProvider) {
  vatProviders.unshift(provider);
}

/**
 * Validates a VAT number: VIES for EU and Northern Ireland numbers when
 * enabled, a registered provider otherwise, and a format check as the
 * fallback. The result states which level of check was made.
 */
export async function validateVatNumber(countryCode: string, vatNumber: string, options: { requester?: ViesRequester | null; fetchImpl?: typeof fetch } = {}): Promise<VatIdCheck> {
  if (isViesCountry(countryCode) && viesEnabled()) {
    const format = await formatOnlyVatProvider.validate(countryCode, vatNumber);
    // A malformed number is rejected without calling the registry.
    if (!format.valid) return format;
    return checkVies(countryCode, vatNumber, options);
  }
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
