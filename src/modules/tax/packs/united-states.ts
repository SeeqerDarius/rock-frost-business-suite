import type { JurisdictionPack, PackJurisdiction } from "./types";

/**
 * United States. Sales and use tax is administered by states and, in many
 * states, counties, cities, and special districts; it is not one national
 * rate. This pack seeds every state (and DC) as a jurisdiction, product and
 * service categories, and nothing that would charge tax on its own: an
 * organization records its registrations (nexus) and the state and local
 * rates it collects. Reference state base rates are offered only as editable
 * suggestions because rates and local add-ons change frequently.
 *
 * Federal business taxes (income, employment, excise) are not sales taxes.
 * The pack provisions separate ledger accounts for them so they are never
 * mixed into a sales tax balance. Rock Frost records and reports these
 * amounts; it does not file returns.
 */
export const US_STATES: { code: string; name: string }[] = [
  ["AL", "Alabama"], ["AK", "Alaska"], ["AZ", "Arizona"], ["AR", "Arkansas"], ["CA", "California"], ["CO", "Colorado"], ["CT", "Connecticut"],
  ["DE", "Delaware"], ["DC", "District of Columbia"], ["FL", "Florida"], ["GA", "Georgia"], ["HI", "Hawaii"], ["ID", "Idaho"], ["IL", "Illinois"],
  ["IN", "Indiana"], ["IA", "Iowa"], ["KS", "Kansas"], ["KY", "Kentucky"], ["LA", "Louisiana"], ["ME", "Maine"], ["MD", "Maryland"],
  ["MA", "Massachusetts"], ["MI", "Michigan"], ["MN", "Minnesota"], ["MS", "Mississippi"], ["MO", "Missouri"], ["MT", "Montana"], ["NE", "Nebraska"],
  ["NV", "Nevada"], ["NH", "New Hampshire"], ["NJ", "New Jersey"], ["NM", "New Mexico"], ["NY", "New York"], ["NC", "North Carolina"], ["ND", "North Dakota"],
  ["OH", "Ohio"], ["OK", "Oklahoma"], ["OR", "Oregon"], ["PA", "Pennsylvania"], ["RI", "Rhode Island"], ["SC", "South Carolina"], ["SD", "South Dakota"],
  ["TN", "Tennessee"], ["TX", "Texas"], ["UT", "Utah"], ["VT", "Vermont"], ["VA", "Virginia"], ["WA", "Washington"], ["WV", "West Virginia"],
  ["WI", "Wisconsin"], ["WY", "Wyoming"],
].map(([code, name]) => ({ code, name }));

/**
 * Reference statewide base sales tax rates (percent), excluding local
 * add-ons. Shown as a starting suggestion when adding a state rate. Verify
 * with the state's department of revenue before use. States with no
 * statewide sales tax are listed as 0.
 */
export const US_STATE_BASE_RATE_REFERENCE: Record<string, { rate: string; note?: string }> = {
  AL: { rate: "4" }, AK: { rate: "0", note: "No state sales tax; many localities levy one." }, AZ: { rate: "5.6", note: "Transaction privilege tax." },
  AR: { rate: "6.5" }, CA: { rate: "7.25", note: "Includes the statewide local portion." }, CO: { rate: "2.9" }, CT: { rate: "6.35" },
  DE: { rate: "0", note: "No sales tax; gross receipts tax applies to sellers." }, DC: { rate: "6" }, FL: { rate: "6" }, GA: { rate: "4" },
  HI: { rate: "4", note: "General excise tax on the seller." }, ID: { rate: "6" }, IL: { rate: "6.25" }, IN: { rate: "7" }, IA: { rate: "6" },
  KS: { rate: "6.5" }, KY: { rate: "6" }, LA: { rate: "5" }, ME: { rate: "5.5" }, MD: { rate: "6" }, MA: { rate: "6.25" }, MI: { rate: "6" },
  MN: { rate: "6.875" }, MS: { rate: "7" }, MO: { rate: "4.225" }, MT: { rate: "0", note: "No general sales tax." }, NE: { rate: "5.5" },
  NV: { rate: "6.85" }, NH: { rate: "0", note: "No general sales tax." }, NJ: { rate: "6.625" }, NM: { rate: "4.875", note: "Gross receipts tax." },
  NY: { rate: "4" }, NC: { rate: "4.75" }, ND: { rate: "5" }, OH: { rate: "5.75" }, OK: { rate: "4.5" }, OR: { rate: "0", note: "No general sales tax." },
  PA: { rate: "6" }, RI: { rate: "7" }, SC: { rate: "6" }, SD: { rate: "4.2" }, TN: { rate: "7" }, TX: { rate: "6.25" }, UT: { rate: "4.85", note: "Statewide local and county portions are additional." },
  VT: { rate: "6" }, VA: { rate: "4.3", note: "A statewide 1% local portion is additional." }, WA: { rate: "6.5" }, WV: { rate: "6" }, WI: { rate: "5" }, WY: { rate: "4" },
};

/** Ledger accounts for federal and employment taxes, kept separate from sales tax. */
export const US_FEDERAL_ACCOUNTS = [
  { code: "2200", name: "Federal Income Tax Payable", type: "LIABILITY" as const },
  { code: "1450", name: "Estimated Federal Income Tax Payments", type: "ASSET" as const },
  { code: "2210", name: "Federal Income Tax Withheld (Employees)", type: "LIABILITY" as const },
  { code: "2211", name: "Social Security Payable (Employee)", type: "LIABILITY" as const },
  { code: "2212", name: "Social Security Payable (Employer)", type: "LIABILITY" as const },
  { code: "2213", name: "Medicare Payable (Employee)", type: "LIABILITY" as const },
  { code: "2214", name: "Medicare Payable (Employer)", type: "LIABILITY" as const },
  { code: "2215", name: "FUTA Payable", type: "LIABILITY" as const },
  { code: "2216", name: "State Unemployment Tax Payable", type: "LIABILITY" as const },
  { code: "2160", name: "Excise Tax Payable", type: "LIABILITY" as const },
  { code: "2140", name: "Sales Tax Payable", type: "LIABILITY" as const },
  { code: "2145", name: "Use Tax Payable", type: "LIABILITY" as const },
  { code: "6100", name: "Employer Payroll Tax Expense", type: "EXPENSE" as const },
  { code: "6110", name: "Income Tax Expense", type: "EXPENSE" as const },
];

const states: PackJurisdiction[] = US_STATES.map((state) => ({ code: `US-${state.code}`, name: state.name, level: "STATE", countryCode: "US", parentCode: "US" }));

export const unitedStatesPack: JurisdictionPack = {
  key: "US",
  name: "United States",
  version: "2026.1",
  description: "All 50 states and DC as sales tax jurisdictions, nexus tracking, product and service categories, and separate federal, employment, and excise tax accounts. Add the state and local rates you collect.",
  foundationOnly: true,
  jurisdictions: [{ code: "US", name: "United States", level: "COUNTRY", countryCode: "US" }, ...states],
  authorities: [{ code: "US-IRS", name: "Internal Revenue Service", jurisdictionCode: "US", website: "https://www.irs.gov" }],
  categories: [
    { code: "TAXABLE_GOODS", name: "Taxable tangible goods" },
    { code: "TAXABLE_SERVICES", name: "Taxable services", description: "Service taxability differs by state." },
    { code: "NON_TAXABLE", name: "Non-taxable goods and services" },
    { code: "RESALE", name: "Sales for resale" },
  ],
  rates: [],
  rules: [],
  accounts: US_FEDERAL_ACCOUNTS,
};
