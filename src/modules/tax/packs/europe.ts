import type { JurisdictionPack, PackRate, PackRule } from "./types";

const TEDB = "https://ec.europa.eu/taxation_customs/tedb/";

/**
 * EU member states and their standard VAT rates (percent). Each member state
 * is its own VAT jurisdiction under the EU; Europe outside the EU (UK,
 * Switzerland, Norway) has separate packs. Reduced, super-reduced, and
 * parking rates differ per country and per product, so administrators add
 * the reduced rates they use. Verify current rates in the European
 * Commission's Taxes in Europe Database.
 */
export const EU_MEMBER_STATES: { code: string; name: string; standardRate: string }[] = [
  { code: "AT", name: "Austria", standardRate: "20" }, { code: "BE", name: "Belgium", standardRate: "21" }, { code: "BG", name: "Bulgaria", standardRate: "20" },
  { code: "HR", name: "Croatia", standardRate: "25" }, { code: "CY", name: "Cyprus", standardRate: "19" }, { code: "CZ", name: "Czechia", standardRate: "21" },
  { code: "DK", name: "Denmark", standardRate: "25" }, { code: "EE", name: "Estonia", standardRate: "24" }, { code: "FI", name: "Finland", standardRate: "25.5" },
  { code: "FR", name: "France", standardRate: "20" }, { code: "DE", name: "Germany", standardRate: "19" }, { code: "GR", name: "Greece", standardRate: "24" },
  { code: "HU", name: "Hungary", standardRate: "27" }, { code: "IE", name: "Ireland", standardRate: "23" }, { code: "IT", name: "Italy", standardRate: "22" },
  { code: "LV", name: "Latvia", standardRate: "21" }, { code: "LT", name: "Lithuania", standardRate: "21" }, { code: "LU", name: "Luxembourg", standardRate: "17" },
  { code: "MT", name: "Malta", standardRate: "18" }, { code: "NL", name: "Netherlands", standardRate: "21" }, { code: "PL", name: "Poland", standardRate: "23" },
  { code: "PT", name: "Portugal", standardRate: "23" }, { code: "RO", name: "Romania", standardRate: "21" }, { code: "SK", name: "Slovakia", standardRate: "23" },
  { code: "SI", name: "Slovenia", standardRate: "22" }, { code: "ES", name: "Spain", standardRate: "21" }, { code: "SE", name: "Sweden", standardRate: "25" },
];

const EFFECTIVE = "2026-01-01";

/**
 * Builds the EU pack for an organization established in `homeCountry`.
 *
 * - Domestic rules for the home member state: standard, zero-rated export
 *   (outside the EU), exempt, and intra-EU B2B reverse charge (the supplier
 *   charges no VAT; the customer accounts for it).
 * - OSS readiness: a standard-rate destination rule for every other member
 *   state, for B2C distance sales where VAT is due in the member state of
 *   consumption. Whether a sale falls under OSS depends on the EU-wide
 *   threshold and registration; the administrator chooses the rule.
 * - EU-OSS and EU-IOSS scheme jurisdictions for recording One-Stop-Shop and
 *   Import One-Stop-Shop registrations (member state of identification in
 *   the registration notes).
 */
export function buildEuropeanUnionPack(homeCountry: string): JurisdictionPack {
  const home = EU_MEMBER_STATES.find((state) => state.code === homeCountry.toUpperCase());
  if (!home) throw new Error(`${homeCountry} is not an EU member state.`);
  const homeCode = `EU-${home.code}`;
  const rates: PackRate[] = EU_MEMBER_STATES.map((state) => ({
    code: `EU-${state.code}-STD`, name: `${state.name} standard VAT`, jurisdictionCode: `EU-${state.code}`, taxKind: "VAT", rate: state.standardRate, effectiveFrom: EFFECTIVE, sourceReference: TEDB, outputAccountCode: "2100", inputAccountCode: "1300",
  }));
  const homeRate = `EU-${home.code}-STD`;
  const rules: PackRule[] = [
    { code: `${homeCode}-STANDARD`, name: `${home.name} standard-rated (domestic)`, jurisdictionCode: homeCode, categoryCode: "STANDARD", treatment: "STANDARD", rateCodes: [homeRate], effectiveFrom: EFFECTIVE, sourceReference: TEDB },
    { code: `${homeCode}-EXPORT`, name: "Export outside the EU (zero-rated)", jurisdictionCode: homeCode, categoryCode: "EXPORT", treatment: "ZERO_RATED", rateCodes: [homeRate], effectiveFrom: EFFECTIVE, sourceReference: TEDB },
    { code: `${homeCode}-EXEMPT`, name: `${home.name} exempt supply`, jurisdictionCode: homeCode, categoryCode: "EXEMPT", treatment: "EXEMPT", rateCodes: [homeRate], effectiveFrom: EFFECTIVE, sourceReference: TEDB },
    { code: `${homeCode}-INTRA-B2B-RC`, name: "Intra-EU B2B supply (reverse charge)", jurisdictionCode: homeCode, categoryCode: "INTRA_EU_B2B", treatment: "REVERSE_CHARGE", rateCodes: [homeRate], effectiveFrom: EFFECTIVE, sourceReference: TEDB },
    { code: `${homeCode}-PURCHASE-RC`, name: "Intra-EU or imported service purchase (reverse charge)", jurisdictionCode: homeCode, categoryCode: "INTRA_EU_B2B", treatment: "REVERSE_CHARGE", rateCodes: [homeRate], effectiveFrom: EFFECTIVE, sourceReference: TEDB },
    ...EU_MEMBER_STATES.filter((state) => state.code !== home.code).map((state): PackRule => ({
      code: `EU-${state.code}-OSS-B2C`, name: `OSS B2C sale to ${state.name} (destination VAT)`, jurisdictionCode: `EU-${state.code}`, categoryCode: "OSS_B2C", treatment: "STANDARD", rateCodes: [`EU-${state.code}-STD`], effectiveFrom: EFFECTIVE, sourceReference: TEDB,
    })),
  ];
  return {
    key: "EU",
    name: `European Union (${home.name})`,
    version: "2026.1",
    description: `${home.name} VAT with intra-EU reverse charge, exports, and destination VAT for OSS B2C sales to the other 26 member states. Add reduced rates you use.`,
    jurisdictions: [
      { code: "EU", name: "European Union", level: "SUPRANATIONAL" },
      { code: "EU-OSS", name: "EU One-Stop-Shop scheme", level: "SUPRANATIONAL", parentCode: "EU" },
      { code: "EU-IOSS", name: "EU Import One-Stop-Shop scheme", level: "SUPRANATIONAL", parentCode: "EU" },
      ...EU_MEMBER_STATES.map((state) => ({ code: `EU-${state.code}`, name: state.name, level: "COUNTRY" as const, countryCode: state.code, parentCode: "EU" })),
    ],
    authorities: [{ code: `${homeCode}-TAX`, name: `${home.name} tax authority`, jurisdictionCode: homeCode }],
    categories: [
      { code: "STANDARD", name: "Standard-rated goods and services" },
      { code: "REDUCED", name: "Reduced-rated goods and services" },
      { code: "EXEMPT", name: "Exempt supplies" },
      { code: "EXPORT", name: "Exports outside the EU" },
      { code: "INTRA_EU_B2B", name: "Intra-EU business-to-business supplies" },
      { code: "OSS_B2C", name: "Cross-border B2C distance sales (OSS)" },
    ],
    rates,
    rules,
  };
}

/** United Kingdom: VAT administered by HMRC, separate from EU VAT. */
export const unitedKingdomPack: JurisdictionPack = {
  key: "GB",
  name: "United Kingdom",
  version: "2026.1",
  description: "UK VAT (standard 20%, reduced 5%, zero 0%), exempt supplies, and domestic reverse charge. Separate from EU VAT.",
  jurisdictions: [{ code: "GB", name: "United Kingdom", level: "COUNTRY", countryCode: "GB" }],
  authorities: [{ code: "GB-HMRC", name: "HM Revenue and Customs", jurisdictionCode: "GB", website: "https://www.gov.uk/government/organisations/hm-revenue-customs" }],
  categories: [{ code: "STANDARD", name: "Standard-rated" }, { code: "REDUCED", name: "Reduced-rated" }, { code: "ZERO_RATED", name: "Zero-rated" }, { code: "EXEMPT", name: "Exempt" }],
  rates: [
    { code: "GB-VAT-STD", name: "UK VAT standard", jurisdictionCode: "GB", authorityCode: "GB-HMRC", taxKind: "VAT", rate: "20", effectiveFrom: EFFECTIVE, sourceReference: "https://www.gov.uk/vat-rates", outputAccountCode: "2100", inputAccountCode: "1300" },
    { code: "GB-VAT-RED", name: "UK VAT reduced", jurisdictionCode: "GB", authorityCode: "GB-HMRC", taxKind: "VAT", rate: "5", effectiveFrom: EFFECTIVE, sourceReference: "https://www.gov.uk/vat-rates", outputAccountCode: "2100", inputAccountCode: "1300" },
  ],
  rules: [
    { code: "GB-STANDARD", name: "UK standard-rated", jurisdictionCode: "GB", categoryCode: "STANDARD", treatment: "STANDARD", rateCodes: ["GB-VAT-STD"], effectiveFrom: EFFECTIVE },
    { code: "GB-REDUCED", name: "UK reduced-rated", jurisdictionCode: "GB", categoryCode: "REDUCED", treatment: "REDUCED", rateCodes: ["GB-VAT-RED"], effectiveFrom: EFFECTIVE },
    { code: "GB-ZERO", name: "UK zero-rated", jurisdictionCode: "GB", categoryCode: "ZERO_RATED", treatment: "ZERO_RATED", rateCodes: ["GB-VAT-STD"], effectiveFrom: EFFECTIVE },
    { code: "GB-EXEMPT", name: "UK exempt", jurisdictionCode: "GB", categoryCode: "EXEMPT", treatment: "EXEMPT", rateCodes: ["GB-VAT-STD"], effectiveFrom: EFFECTIVE },
    { code: "GB-REVERSE-CHARGE", name: "UK domestic reverse charge", jurisdictionCode: "GB", treatment: "REVERSE_CHARGE", rateCodes: ["GB-VAT-STD"], effectiveFrom: EFFECTIVE },
  ],
};

/** Switzerland: VAT (MWST/TVA/IVA) administered by the Federal Tax Administration. */
export const switzerlandPack: JurisdictionPack = {
  key: "CH",
  name: "Switzerland",
  version: "2026.1",
  description: "Swiss VAT (standard 8.1%, reduced 2.6%, accommodation 3.8%) and exempt supplies. Separate from EU VAT.",
  jurisdictions: [{ code: "CH", name: "Switzerland", level: "COUNTRY", countryCode: "CH" }],
  authorities: [{ code: "CH-FTA", name: "Federal Tax Administration (ESTV/AFC)", jurisdictionCode: "CH", website: "https://www.estv.admin.ch" }],
  categories: [{ code: "STANDARD", name: "Standard-rated" }, { code: "REDUCED", name: "Reduced-rated" }, { code: "ACCOMMODATION", name: "Accommodation" }, { code: "EXEMPT", name: "Exempt" }],
  rates: [
    { code: "CH-VAT-STD", name: "Swiss VAT standard", jurisdictionCode: "CH", authorityCode: "CH-FTA", taxKind: "VAT", rate: "8.1", effectiveFrom: "2024-01-01", sourceReference: "https://www.estv.admin.ch", outputAccountCode: "2100", inputAccountCode: "1300" },
    { code: "CH-VAT-RED", name: "Swiss VAT reduced", jurisdictionCode: "CH", authorityCode: "CH-FTA", taxKind: "VAT", rate: "2.6", effectiveFrom: "2024-01-01", sourceReference: "https://www.estv.admin.ch", outputAccountCode: "2100", inputAccountCode: "1300" },
    { code: "CH-VAT-ACC", name: "Swiss VAT accommodation", jurisdictionCode: "CH", authorityCode: "CH-FTA", taxKind: "VAT", rate: "3.8", effectiveFrom: "2024-01-01", sourceReference: "https://www.estv.admin.ch", outputAccountCode: "2100", inputAccountCode: "1300" },
  ],
  rules: [
    { code: "CH-STANDARD", name: "Swiss standard-rated", jurisdictionCode: "CH", categoryCode: "STANDARD", treatment: "STANDARD", rateCodes: ["CH-VAT-STD"], effectiveFrom: "2024-01-01" },
    { code: "CH-REDUCED", name: "Swiss reduced-rated", jurisdictionCode: "CH", categoryCode: "REDUCED", treatment: "REDUCED", rateCodes: ["CH-VAT-RED"], effectiveFrom: "2024-01-01" },
    { code: "CH-ACCOMMODATION", name: "Swiss accommodation", jurisdictionCode: "CH", categoryCode: "ACCOMMODATION", treatment: "REDUCED", rateCodes: ["CH-VAT-ACC"], effectiveFrom: "2024-01-01" },
    { code: "CH-EXEMPT", name: "Swiss exempt", jurisdictionCode: "CH", categoryCode: "EXEMPT", treatment: "EXEMPT", rateCodes: ["CH-VAT-STD"], effectiveFrom: "2024-01-01" },
  ],
};

/** Norway: VAT (MVA) administered by Skatteetaten. */
export const norwayPack: JurisdictionPack = {
  key: "NO",
  name: "Norway",
  version: "2026.1",
  description: "Norwegian VAT (MVA): standard 25%, food 15%, reduced 12%, and exempt supplies. Separate from EU VAT.",
  jurisdictions: [{ code: "NO", name: "Norway", level: "COUNTRY", countryCode: "NO" }],
  authorities: [{ code: "NO-SKATT", name: "Norwegian Tax Administration (Skatteetaten)", jurisdictionCode: "NO", website: "https://www.skatteetaten.no" }],
  categories: [{ code: "STANDARD", name: "Standard-rated" }, { code: "FOOD", name: "Food and beverages" }, { code: "REDUCED", name: "Reduced-rated" }, { code: "EXEMPT", name: "Exempt" }],
  rates: [
    { code: "NO-MVA-STD", name: "Norway MVA standard", jurisdictionCode: "NO", authorityCode: "NO-SKATT", taxKind: "VAT", rate: "25", effectiveFrom: EFFECTIVE, sourceReference: "https://www.skatteetaten.no", outputAccountCode: "2100", inputAccountCode: "1300" },
    { code: "NO-MVA-FOOD", name: "Norway MVA food", jurisdictionCode: "NO", authorityCode: "NO-SKATT", taxKind: "VAT", rate: "15", effectiveFrom: EFFECTIVE, sourceReference: "https://www.skatteetaten.no", outputAccountCode: "2100", inputAccountCode: "1300" },
    { code: "NO-MVA-RED", name: "Norway MVA reduced", jurisdictionCode: "NO", authorityCode: "NO-SKATT", taxKind: "VAT", rate: "12", effectiveFrom: EFFECTIVE, sourceReference: "https://www.skatteetaten.no", outputAccountCode: "2100", inputAccountCode: "1300" },
  ],
  rules: [
    { code: "NO-STANDARD", name: "Norway standard-rated", jurisdictionCode: "NO", categoryCode: "STANDARD", treatment: "STANDARD", rateCodes: ["NO-MVA-STD"], effectiveFrom: EFFECTIVE },
    { code: "NO-FOOD", name: "Norway food", jurisdictionCode: "NO", categoryCode: "FOOD", treatment: "REDUCED", rateCodes: ["NO-MVA-FOOD"], effectiveFrom: EFFECTIVE },
    { code: "NO-REDUCED", name: "Norway reduced-rated", jurisdictionCode: "NO", categoryCode: "REDUCED", treatment: "REDUCED", rateCodes: ["NO-MVA-RED"], effectiveFrom: EFFECTIVE },
    { code: "NO-EXEMPT", name: "Norway exempt", jurisdictionCode: "NO", categoryCode: "EXEMPT", treatment: "EXEMPT", rateCodes: ["NO-MVA-STD"], effectiveFrom: EFFECTIVE },
  ],
};
