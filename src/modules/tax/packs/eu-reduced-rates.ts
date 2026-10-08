/**
 * Reference catalog of EU reduced VAT rates.
 *
 * The European Commission does not publish a machine-readable rate table;
 * its Taxes in Europe Database (TEDB) is the authoritative interactive source,
 * and each member state decides which goods and services each rate covers.
 * This catalog lists only the rates on which two independent published
 * tables agreed when it was compiled. Rates on which they disagreed are
 * listed as unconfirmed and cannot be applied from the catalog.
 *
 * Nothing here is applied automatically. An administrator chooses the member
 * states, confirms the rates against TEDB or the national tax authority, and
 * the rates are created as ordinary effective-dated rates they can version.
 */

export const EU_REDUCED_CATALOG_SOURCES = [
  { name: "VATupdate, Overview of current VAT rates", url: "https://www.vatupdate.com/vat-rates-eu/", asOf: "2026-01-01" },
  { name: "Eurofiscalis, EU VAT rates 2026", url: "https://www.eurofiscalis.com/en/vat-rates-in-ue/", asOf: "2026-09-28" },
] as const;

export const EU_REDUCED_CATALOG_COMPILED = "2026-10-11";
export const TEDB_URL = "https://ec.europa.eu/taxation_customs/tedb/";

export type ReducedRateKind = "REDUCED" | "SUPER_REDUCED" | "PARKING";
export type CatalogRate = { rate: string; kind: ReducedRateKind };
export type CatalogEntry = { countryCode: string; rates: CatalogRate[]; unconfirmed: { rate: string; note: string }[] };

const r = (rate: string, kind: ReducedRateKind = "REDUCED"): CatalogRate => ({ rate, kind });

export const EU_REDUCED_RATE_CATALOG: CatalogEntry[] = [
  { countryCode: "AT", rates: [r("10"), r("13")], unconfirmed: [{ rate: "4.9", note: "Listed by only one source (as of September 2026)." }] },
  { countryCode: "BE", rates: [r("6"), r("12")], unconfirmed: [] },
  { countryCode: "BG", rates: [r("9")], unconfirmed: [] },
  { countryCode: "HR", rates: [r("5"), r("13")], unconfirmed: [] },
  { countryCode: "CY", rates: [r("5"), r("9")], unconfirmed: [{ rate: "3", note: "Listed by only one source (as of September 2026)." }] },
  { countryCode: "CZ", rates: [r("12")], unconfirmed: [] },
  { countryCode: "DK", rates: [], unconfirmed: [] },
  { countryCode: "EE", rates: [r("9"), r("13")], unconfirmed: [] },
  { countryCode: "FI", rates: [r("10")], unconfirmed: [{ rate: "13.5", note: "Sources disagree: 14% (January 2026) or 13.5% (September 2026)." }] },
  { countryCode: "FR", rates: [r("5.5"), r("10"), r("2.1", "SUPER_REDUCED")], unconfirmed: [] },
  { countryCode: "DE", rates: [r("7")], unconfirmed: [] },
  { countryCode: "GR", rates: [r("6"), r("13")], unconfirmed: [{ rate: "4", note: "Listed by only one source (as of September 2026)." }] },
  { countryCode: "HU", rates: [r("5"), r("18")], unconfirmed: [] },
  { countryCode: "IE", rates: [r("9"), r("13.5"), r("4.8", "SUPER_REDUCED")], unconfirmed: [] },
  { countryCode: "IT", rates: [r("5"), r("10"), r("4", "SUPER_REDUCED")], unconfirmed: [] },
  { countryCode: "LV", rates: [r("5"), r("12")], unconfirmed: [] },
  { countryCode: "LT", rates: [r("5")], unconfirmed: [{ rate: "12", note: "Sources disagree: 9% (January 2026) or 12% (September 2026)." }] },
  { countryCode: "LU", rates: [r("8"), r("3", "SUPER_REDUCED"), r("14", "PARKING")], unconfirmed: [] },
  { countryCode: "MT", rates: [r("5"), r("7"), r("12", "PARKING")], unconfirmed: [] },
  { countryCode: "NL", rates: [r("9")], unconfirmed: [] },
  { countryCode: "PL", rates: [r("5"), r("8")], unconfirmed: [] },
  { countryCode: "PT", rates: [r("6"), r("13")], unconfirmed: [] },
  { countryCode: "RO", rates: [r("11")], unconfirmed: [] },
  { countryCode: "SK", rates: [r("5"), r("19")], unconfirmed: [] },
  { countryCode: "SI", rates: [r("5"), r("9.5")], unconfirmed: [] },
  { countryCode: "ES", rates: [r("10"), r("4", "SUPER_REDUCED")], unconfirmed: [] },
  { countryCode: "SE", rates: [r("6"), r("12")], unconfirmed: [] },
];

export function catalogEntry(countryCode: string) {
  return EU_REDUCED_RATE_CATALOG.find((entry) => entry.countryCode === countryCode.toUpperCase()) ?? null;
}

/** Rate code for a catalog rate, e.g. EU-FR-RED-5_5 (codes allow letters, numbers, hyphens, underscores). */
export function catalogRateCode(countryCode: string, rate: string) {
  return `EU-${countryCode.toUpperCase()}-RED-${rate.replace(".", "_")}`;
}

export const KIND_LABEL: Record<ReducedRateKind, string> = { REDUCED: "reduced", SUPER_REDUCED: "super-reduced", PARKING: "parking" };
