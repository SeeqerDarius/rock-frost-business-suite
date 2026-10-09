import type { JurisdictionPack } from "./types";

const GRA = "https://gra.gov.gh/domestic-tax/tax-types/vat/";

/**
 * Ghana: VAT 15%, NHIL 2.5%, GETFund Levy 2.5%, each on the taxable value
 * (not compounded) from 1 January 2026 under the Value Added Tax Act, 2025
 * (Act 1151). Mirrors the effective-dated codes Rock Frost already
 * provisions, so existing Ghana behavior is unchanged. Accounts map to the
 * existing separate VAT, NHIL, and GETFund payable and recoverable accounts.
 */
export const ghanaPack: JurisdictionPack = {
  key: "GH",
  name: "Ghana",
  version: "2026.1",
  description: "Ghana VAT with NHIL and GETFund Levy, effective 1 January 2026.",
  jurisdictions: [{ code: "GH", name: "Ghana", level: "COUNTRY", countryCode: "GH" }],
  authorities: [{ code: "GH-GRA", name: "Ghana Revenue Authority", jurisdictionCode: "GH", website: "https://gra.gov.gh" }],
  categories: [
    { code: "STANDARD", name: "Standard-rated goods and services" },
    { code: "ZERO_RATED", name: "Zero-rated supplies", description: "For example qualifying exports." },
    { code: "EXEMPT", name: "Exempt supplies" },
  ],
  rates: [
    { code: "GH-VAT", name: "Ghana VAT", jurisdictionCode: "GH", authorityCode: "GH-GRA", taxKind: "VAT", rate: "15", effectiveFrom: "2026-01-01", sourceReference: GRA, outputAccountCode: "2100", inputAccountCode: "1300" },
    { code: "GH-NHIL", name: "National Health Insurance Levy", jurisdictionCode: "GH", authorityCode: "GH-GRA", taxKind: "LEVY", rate: "2.5", effectiveFrom: "2026-01-01", sourceReference: GRA, outputAccountCode: "2110", inputAccountCode: "1310" },
    { code: "GH-GETFUND", name: "GETFund Levy", jurisdictionCode: "GH", authorityCode: "GH-GRA", taxKind: "LEVY", rate: "2.5", effectiveFrom: "2026-01-01", sourceReference: GRA, outputAccountCode: "2120", inputAccountCode: "1320" },
  ],
  rules: [
    { code: "GH-STANDARD", name: "Ghana standard-rated", jurisdictionCode: "GH", categoryCode: "STANDARD", treatment: "STANDARD", rateCodes: ["GH-VAT", "GH-NHIL", "GH-GETFUND"], effectiveFrom: "2026-01-01", sourceReference: GRA },
    { code: "GH-ZERO", name: "Ghana zero-rated", jurisdictionCode: "GH", categoryCode: "ZERO_RATED", treatment: "ZERO_RATED", rateCodes: ["GH-VAT", "GH-NHIL", "GH-GETFUND"], effectiveFrom: "2026-01-01", sourceReference: GRA },
    { code: "GH-EXEMPT", name: "Ghana exempt", jurisdictionCode: "GH", categoryCode: "EXEMPT", treatment: "EXEMPT", rateCodes: ["GH-VAT", "GH-NHIL", "GH-GETFUND"], effectiveFrom: "2026-01-01", sourceReference: GRA },
  ],
};
