# Global accounting and contract expansion: audit baseline

**Audit date:** 2026-10-06  
**Status:** Increments 1 to 4 (global foundation, multi-currency accounting, tax engine, jurisdiction packs and tax reports) and Increments 5a and 5b (Contract Management core and lifecycle) are live in production. Increment 5c (contract integrations, risk scoring, and reports) is implemented; see `docs/CONTRACTS_MODULE.md`.

This document records the current reusable architecture and the gaps that must be closed before Rock Frost can claim global accounting or Contract Lifecycle Management. It is a delivery plan, not a claim that the expansion is complete.

## Existing foundations to preserve

- `Organization` is the canonical tenant root. It already stores `country`, `region`, `city`, `address`, `businessRegistrationNumber`, `taxNumber`, `currency` (default `GHS`), `defaultLanguage` (default `en`) and `timezone` (default `UTC`). `Branch.timezone` is optional. Onboarding and settings need to extend these rather than create parallel organization models.
- Existing money values use Prisma `Decimal` in Accounting, and the general ledger derives balances from journal entries. Cross-module revenue posts through `src/lib/accounting-integration.ts` and the Accounting service boundary.
- `AccountingTaxCode` already has jurisdiction text, a treatment, effective dates, VAT/NHIL/GETFund/WHT rates, and a tenant-scoped uniqueness key. Invoice/bill headers and lines preserve decimal totals. Tax transactions keep transaction date and calculated tax amounts. The Ghana tax configuration uses effective-dated codes.
- `AccountingContact` is the common Accounting customer/supplier party and includes a tax identification number. It can be extended with country-specific IDs and currency defaults without replacing Fleet, CRM, or Procurement records.
- Tenant authorization uses `OrganizationMember`, `Role`, `Permission`, and `RolePermission`; module subscriptions/access use `Module`, `OrganizationModule`, and `Subscription`. New routes must enforce both entitlement and permission in server-side entry points.
- `AuditLog`, `Notification`, and `FileAsset` are shared infrastructure. Fleet document relationships and private attachment patterns are useful references, but contract files require explicit private-storage and access checks.
- `FleetWorkAndPayContract` is a Fleet repayment/vehicle agreement with Fleet-specific lifecycle and payment fields. It is not a general legal contract and must remain intact.

## Gaps confirmed in current code

- `src/lib/currency.ts` formats every amount with `en-GH`; its fallback also forces GHS. `Organization.currency` exists, but format locale and currency context are not separated.
- Organization localization lacks a locale, date/number preferences, fiscal-year configuration, legal entity type, and structured registration/address fields. Timezone exists but defaults to UTC, including the existing Ghana population.
- Accounting documents have no transaction-currency, rate, rate source/date, base-currency equivalent, or FX gain/loss snapshot. Existing single-currency assumptions are distributed through accounting creation and posting code.
- Tax setup in `src/modules/accounting/tax-service.ts` seeds Ghana tax codes for `GH` and a generic `NO-TAX` code for every other country. Existing tax code fields cannot represent layered authority rules, categories, registrations, customer exemptions, nexus, reverse charge, OSS/IOSS, or version provenance.
- The invoice and bill tax snapshots store component amounts but rely on the linked tax code for configuration context. A durable historical rule snapshot is needed before rates can be safely replaced or jurisdiction logic expanded.
- Pricing models (`ModulePricingPlan`, `PricingBundle`) and catalog fields are GHS-specific. Subscription billing currency must remain distinct from organization accounting currency.
- There is no general contract module, lifecycle, permission namespace, contract entitlement, version history, approval model, obligations, amendment/termination workflow, or confidential document access model. Existing user/party/file/audit/notification concepts should be reused where suitable.
- Existing schemas and UI include Ghana-specific labels and date conventions. These require a usage audit and jurisdiction-aware replacement; a global text replacement would risk damaging valid Ghana experiences.

## Architecture direction

1. Keep stable country, currency, and locale metadata in code/configuration. Store organization choices and accounting policy in tenant-scoped database records. Use explicit country/jurisdiction pack adapters for defaults and tax behavior; do not spread country conditionals through route components.
2. Preserve existing `Organization` and `Branch`. Add a normalized localization settings record or carefully extend `Organization` only after mapping all writers, imports, seed paths, and tenant settings. Existing organizations need an explicit, reviewed backfill policy, especially their current timezone and currency.
3. Define currency amounts as decimal value plus ISO currency code. For posted accounting documents, persist original amount/currency and immutable conversion rate, rate date/source, and base amount. Add realized/unrealized FX journals only through accounting lifecycle events and explicit revaluation, never by changing historical source amounts.
4. Evolve taxation additively. Keep `AccountingTaxCode` as a compatibility surface until the new rule/rate/registration/category models and migration/backfill are proven. Every posted document must retain the selected rule/version and calculated component snapshots. Tax provider and VAT-ID validation interfaces must not make provider availability a dependency for manual configuration.
5. Treat tax calculation as a server-side domain service accepting tenant, transaction date, supply/customer context, currency, and jurisdiction facts. Return auditable component lines and account mappings. USA state/local layers and EU country VAT must be separate pack implementations. Europe outside the EU must have independent pack keys.
6. Build Contracts as an independently entitled module with tenant-scoped models and service methods. Use composite tenant-aware lookups for all related entities and document access. Reuse `AccountingContact` only as a cross-reference where appropriate; do not merge its customer/supplier lifecycle into contracts. Reuse Fleet asset IDs through an explicit integration boundary.
7. Keep historical states immutable: contract versions/documents and tax/FX snapshots are append-only records. Corrective changes create amendments, credit notes, reversals, or new versions.

## Controlled implementation sequence and gates

The requested expansion spans multiple releases. Deliver it in increments that can each be migrated, validated and released safely:

1. **Global foundation:** country/currency/locale metadata, organization localization settings, onboarding defaults/overrides, locale-aware formatters, timezone boundary policy, FX abstraction and transaction snapshots.
2. **Tax core:** jurisdiction, authority, registrations, category, effective-dated/versioned rules and rates, transaction snapshots, tax account mapping, migrations/backfill, and Ghana regression coverage.
3. **Jurisdiction packs:** Ghana compatibility first; USA layered state/county/city/local configuration and distinct federal/employment settings; EU country VAT; explicit UK/CH/NO extension boundaries.
4. **Contracts core:** entitlement and permissions, tenant-scoped contract/party/document/version/template/clause models, private file access, audit and basic lifecycle.
5. **Contract lifecycle:** approval policies, obligations/milestones, renewal/expiry, amendments, termination, internal acknowledgement and provider adapter boundaries.
6. **Integrations and reporting:** Accounting/Fleet/customer/vendor links, tax and contract reports, settings, filters/exports, calendar and notifications.
7. **Release per increment:** inspect exact dirty scope; use additive migrations; validate with guarded disposable Postgres for schema changes; run affected and full gates; commit only owned changes; push and pass CI/preview; deploy and verify routes, migration state, health and errors. Never include pre-existing unrelated work implicitly.

## Phase 1 evidence reviewed

- `prisma/schema.prisma`: organization/branch, contacts, invoices/bills, tax codes/transactions/periods, roles/permissions, module entitlements, audit, files, notifications, and Fleet Work & Pay.
- `src/lib/currency.ts`: current GHS/en-GH formatting behavior.
- `src/modules/accounting/tax-service.ts`: effective-date tax-code selection and current GH versus generic no-tax defaults.
- `src/modules/accounting/service.ts` and `src/lib/accounting-integration.ts`: decimal accounting posting and module integration boundary.
- `src/lib/auth/permissions.ts`, `prisma/seed-data.ts`, and `src/platform/modules/registry.ts`: permission and module access patterns.
- `docs/MODULE_BOUNDARIES.md`, `docs/ACCOUNTING_MODULE.md`, and `docs/ACCOUNT_AND_TENANT_SETTINGS.md`: current module and accounting contracts.

## Release scoping

The main checkout's uncommitted Payroll, School, SEO, and media work is outside this expansion. Each increment is built in an isolated worktree off `origin/main` (Increment 1: branch `claude/global-foundation`, worktree `.worktrees/global-foundation`) so none of that work is swept into a release.

## Increment 1: global foundation (implemented 2026-10-06)

### Schema (migration `20261006090000_global_localization_foundation`, additive)

- `Organization` gains `legalName`, `tradingName`, `postalCode`, `legalEntityType`, `vatRegistrationNumber`, `locale` (nullable; null derives from the base currency so existing tenants keep en-GH), `dateFormat` and `numberFormat` (default `LOCALE`), `fiscalYearStartMonth` (1 to 12, database CHECK), `accountingBasis` (`ACCRUAL`/`CASH`, recorded for reporting; posting remains accrual), `pricesIncludeTax`, and `jurisdictionCode` (GH, US, EU-DE, GB, CH, NO and so on). Existing `country`, `region`, `city`, `address`, `taxNumber`, `businessRegistrationNumber`, `currency`, `timezone`, and `defaultLanguage` are reused, not duplicated. Decision: extend `Organization` rather than add a 1:1 settings table, because every request already loads the organization and these values are tenant identity, not module configuration.
- New `ExchangeRate` (organization-scoped, append-only): `fromCurrency`, `toCurrency`, `rate` DECIMAL(20,10), `rateDate` DATE, `source` (`MANUAL`/`PROVIDER`), `providerName`, `notes`, `createdById`. Database CHECKs enforce a positive rate, ISO-shaped codes, and distinct currencies. Indexed by organization, pair, and date.
- Backfill: legacy `country = 'Ghana'` becomes `GH`; Ghana organizations (explicit GH, or no country with GHS) get `jurisdictionCode = 'GH'`; Ghana organizations still on the legacy `UTC` timezone move to `Africa/Accra` (same offset and no daylight saving, so no displayed time or reporting boundary changes). No currency, amount, or document is modified.

### Code

- `src/lib/localization.ts`: the country catalog (Ghana, United States, all 27 EU member states, UK, Switzerland, Norway, Japan, Canada, Australia, New Zealand, South Africa, Nigeria, Kenya, UAE, India, Singapore) with currency, locale, timezone, tax pack, jurisdiction code, fiscal-year default, and jurisdiction-specific field labels (State/ZIP/EIN for the US, VAT identification number for the EU, TIN/Region/GhanaPostGPS for Ghana). Unknown countries return global labels and no currency or timezone so the administrator must choose. Validators for ISO 4217 codes (against the runtime's real currency list, not just the three-letter shape), IANA timezones, and BCP 47 locales. `suggestCountryFromAcceptLanguage()` is a suggestion only.
- `src/lib/org-format.ts`: `createOrganizationFormatter()` for money, numbers, dates, and date-times using the organization's locale, number format, date format, and timezone. Formatting never changes stored decimal values. Shared by server and client components.
- `src/modules/globalization/fx.ts`: pure decimal FX arithmetic (conversion with half-up cent rounding, inversion, realized and unrealized gain/loss with receivable/payable sign conventions, and the immutable `FxSnapshot` a document will store).
- `src/modules/globalization/exchange-rates.ts`: the `ExchangeRateProvider` interface, the built-in recorded-rate provider (latest rate on or before the document date, newest correction wins, inverse pair fallback), `resolveExchangeRate()` (fails clearly when no rate exists rather than guessing), and audited `recordExchangeRate()` (`exchange_rate.recorded` / `exchange_rate.corrected` with the superseded rate).
- `src/modules/globalization/organization-localization.ts`: validated, serialized (advisory lock), audited updates. The base currency is refused once any journal entry, invoice, or bill exists, and requires explicit confirmation otherwise. A jurisdiction change requires confirmation when tax transactions exist; existing tax records keep their rates. Tax identifiers are masked in audit metadata.
- Routes: `/app/organization/settings/localization` (requires `org.settings.manage`; country selection suggests currency, timezone, locale, and fiscal year only for fields the administrator has not edited, with a live formatting preview and confirmation for dangerous changes) and `/app/accounting/exchange-rates` (Accounting entitlement plus `accounting.view` to read and `accounting.settings.manage` to record; rates are always recorded against the session organization's base currency, never a client-supplied organization).
- Public signup (`/subscribe`) asks for the country of registration (preselected from Accept-Language as a suggestion) and creates the organization with that country's base currency, timezone, jurisdiction, and fiscal-year default instead of hardcoded Ghana values. Subscription prices remain GHS: billing currency is separate from accounting currency.
- Platform operator create/update normalizes country to ISO codes, derives the jurisdiction, validates currency and timezone, and honors the same base-currency lock (previously an operator profile edit could re-label a ledger's currency).
- `ensureJurisdictionTaxCodes()` uses `jurisdictionCode` first, falling back to country, so existing Ghana behavior is unchanged and non-Ghana organizations do not receive Ghana tax codes.
- `TenantContext.organization` carries `locale`, `dateFormat`, and `numberFormat` for formatting.

### Tests

- `test/global-foundation.test.ts`: GH/US/EU defaults, EU member-state jurisdictions, UK/CH/NO separation, no Ghana terminology in other jurisdictions, unknown-country handling, Accept-Language suggestions, identifier validation, locale-aware money formatting (US, DE, FR, GH), number-format overrides, timezone date boundaries, decimal FX conversion, gain/loss signs, and snapshots.
- `test/global-settings-and-rates.test.ts` (mocked database): tenant scoping, base-currency lock and confirmation, jurisdiction confirmation, administrator overrides, validation before writes, masked audit identifiers, no-op saves, rate resolution order, inversion, missing-rate failure, append-only corrections, and pagination bounds.
- `test/integration/tenant-isolation/globalization.test.ts` (real PostgreSQL): cross-tenant rate isolation, historical rate preservation after corrections, database CHECK constraints, US and German onboarding, base-currency lock after an invoice, and Ghana tax codes only for the Ghana jurisdiction.

### Known limitations of Increment 1

- Accounting documents were single-currency in this increment; Increment 2 below adds multi-currency documents.
- Since the formatting sweep (2026-10-08), every module formats money with the organization's currency and number format (see "Formatting sweep" below).
- No live FX provider is connected; manual rates are the source of truth.
- The interface language remains English; `defaultLanguage` is stored for generated documents.

Increment 1 was released to production on 2026-10-06 (PR #54, merge `513d9ab`, deployment `dpl_8z2DuFXrzin7qbPEuG26qLY96FDr`; migration applied).

## Increment 2: multi-currency accounting documents (implemented 2026-10-06)

### Schema (migration `20261006120000_multi_currency_documents`, additive)

- `AccountingInvoice`, `AccountingBill`, `AccountingCreditNote`: `currency`, `exchangeRate` DECIMAL(20,10) default 1 (CHECK > 0), `exchangeRateDate`, `exchangeRateSource` (`BASE`, `MANUAL`, `PROVIDER`, `INVERTED`, `MANUAL_ENTRY`, or `INVOICE` for an applied credit note), and `baseAmount`. Invoices and bills also store `baseAmountSettled`, the base carrying amount already relieved by payments and credits. Indexed by organization and currency.
- `AccountingReceivablePayment`, `AccountingPayablePayment`: `currency`, settlement `exchangeRate`, `exchangeRateSource`, `baseAmount` (base value received or paid), `settledBaseAmount` (carrying amount relieved), and `realizedFxAmount` (positive = gain).
- `AccountingAccount.currency` (a foreign-currency bank account; ledger balances stay in base currency), `AccountingJournalLine.transactionCurrency/transactionAmount/exchangeRate` (original amount on converted lines), `AccountingContact.currency/countryCode/vatNumber`, `AccountingTaxTransaction.currency/exchangeRate` (tax amounts remain in base currency; the document currency is evidence).
- Backfill: every existing document and payment becomes a base-currency record at rate 1 with `baseAmount = amount` and `baseAmountSettled = amountPaid (+ amountCredited)`. No existing total, balance, or posting changes.

### Rules (`src/modules/accounting/multi-currency.ts`)

- Document amounts stay in the document currency. The rate is resolved once on the server when the document is created, from the organization's recorded rates for the document date or an explicit rate the user enters, and is never recalculated. A newer recorded rate never changes an existing document.
- Postings convert each component (revenue/expense, each tax, receivable/payable) at the stored rate; the receivable/payable is the exact sum of the converted components, so journals always balance and a void reproduces the original base amounts.
- Base-currency documents post exactly the values they posted before (byte-identical journal lines), verified by the unchanged existing suites.
- Settlement relieves the receivable/payable at the document's booked rate. The base value received or paid uses the settlement rate (recorded, or entered from the bank advice). The difference posts to `4810 Foreign Exchange Gain (Realized)` or `5810 Foreign Exchange Loss (Realized)`. The final settlement relieves exactly the remaining carrying amount, so rounding never leaves residue on a closed document. Withholding tax on a foreign bill is valued at the settlement rate.
- A cash or bank account may settle a document only in the base currency or the document's own currency.
- A credit note can be applied only to an invoice in the same currency and is posted at that invoice's booked rate (it adjusts the invoice, so it creates no artificial FX difference). A refunded credit note uses its own rate.
- FX gain/loss accounts (4810, 5810, and unrealized 4820, 5820) are created only when an organization first needs them; single-currency charts of accounts are unchanged.
- Reports and dashboards (receivables summary, ageing, overview, financial dashboard, revenue trend, top invoices, insights) aggregate base-currency values, so mixed-currency documents are never summed as one currency.

### Unrealized revaluation (`src/modules/accounting/revaluation.ts`)

An explicit period-end action on `/app/accounting/exchange-rates` (preview with `accounting.view`, posting requires `accounting.periods.manage`). It values open foreign invoices and bills at the closing rate for a date, posts one journal on that date against 4820/5820, and an automatic reversal the next day. Posting is idempotent per date, refuses missing closing rates, respects closed periods, never modifies documents or carrying amounts, and is audited (`fx_revaluation.posted`).

### UI

- Invoices, bills, and credit notes: currency selector (base by default) and an optional explicit rate; amounts render in the document currency with the base equivalent and rate; payment dialogs offer an optional settlement rate and list only compatible accounts; payment history shows realized FX.
- Chart of accounts: account currency for foreign bank accounts. Contacts: country, VAT/GST number, default currency; the tax ID label is now jurisdiction-neutral ("Tax identification number" instead of a Ghana-specific label).
- Printable invoices and bills use the document currency.

### Tests

- `test/multi-currency-accounting.test.ts`: component conversion and exact totals, realized gain/loss signs, rounding-free final settlement, base-currency identity, FX journal lines, original-currency metadata, base reporting values.
- Existing accounting suites (Ghana tax, bills/credit notes, reporting, dashboard, decimal hygiene, regression) updated only where they assert the new `baseAmountSettled` bookkeeping or base-currency aggregate fields.
- `test/integration/tenant-isolation/multi-currency.test.ts` (real PostgreSQL): USD invoice with rate snapshot, converted posting and base tax evidence, collection at a higher rate with a realized gain, unchanged historical rate, rounding-free partial payments, exact void reversal, account-currency and credit-note-currency guards, EUR bill paid at a lower rate, revaluation and next-day reversal (idempotent), base-currency regression, and cross-tenant rate isolation.

### Known limitations of Increment 2

- Choosing a contact with a default currency on a new invoice, bill, or credit note pre-selects that currency; the user can change it before saving.
- Procurement supplier invoices, POS, Fleet, School, and other modules that post to Accounting remain base-currency.
- Printable documents still use the existing (Ghana-oriented) tax layout; jurisdiction-specific invoice templates arrive with the tax packs.
- No live FX provider is connected.

Increment 2 was released to production on 2026-10-06 (PR #55, merge `0a9f5d5`, deployment `dpl_6wbsa3KjvJsF4KEZCVtkidwdZUX9`; migration applied).

## Increment 3: tax engine core (implemented 2026-10-06)

### Schema (migration `20261006150000_tax_engine_core`, additive)

Tenant-scoped, effective-dated, versioned configuration: `TaxJurisdiction` (SUPRANATIONAL, COUNTRY, STATE, COUNTY, CITY, DISTRICT with a parent hierarchy and pack key), `TaxAuthority`, `TaxCategory`, `TaxRate` (one component: tax kind VAT/GST/SALES/USE/LEVY/EXCISE/WITHHOLDING/PAYROLL/INCOME/OTHER, rate, compound, recoverable, effective range, version, supersedes link, source reference, output/input account codes), `TaxRule` (jurisdiction, optional category, treatment STANDARD/REDUCED/ZERO_RATED/EXEMPT/REVERSE_CHARGE/OUT_OF_SCOPE, rate codes, effective range, version), `TaxRegistration` (status NOT_REGISTERED/MONITORING/REGISTERED/DEREGISTERED, collection enabled, filing frequency), `TaxExemption` (customer, optional jurisdiction, type, certificate, validity), `DocumentTaxLine` (immutable per-document tax snapshot), and `TaxLedgerEntry` (per-component base-currency evidence for reporting by jurisdiction, level, authority, and kind). Invoices and bills gain `taxRuleId`, `taxTreatment`, and `taxAmount` (backfilled to the legacy component total). CHECKs enforce rate range, effective ranges, and positive versions.

### Engine (`src/modules/tax/engine.ts`)

Pure Decimal calculation with no country logic: simple and compound components, exclusive and inclusive pricing (the last component absorbs inclusive rounding so taxable plus tax equals the gross exactly), and explicit zero lines for zero-rated, exempt, and out-of-scope supplies. Reverse charge charges nothing and returns the buyer's self-assessed amount.

### Configuration service (`src/modules/tax/service.ts`)

- `provisionJurisdictionPack()` seeds a pack idempotently and never overwrites administrator changes.
- `createTaxRateVersion()` changes a rate from a date by adding a version and closing the prior one the day before. It refuses a start on or before the current version's start, so historical periods are never rewritten.
- `resolveDocumentTax()` is server-authoritative. It loads the rule and every rate version in effect on the document date, fails clearly if a rate is missing, skips components in jurisdictions whose registration explicitly disables collection, and turns standard-rated sales to a customer with a valid exemption into exempt sales.
- Every configuration write is organization-scoped and audited (rate versions record the previous rate; registration numbers are masked).

### Jurisdiction packs (`src/modules/tax/packs`)

Static, versioned configuration with source references. Increment 3 ships the Ghana pack (VAT 15%, NHIL 2.5%, GETFund 2.5% on the taxable value from 1 January 2026, mapped to the existing separate payable and recoverable accounts). The US, EU member state, UK, Switzerland, and Norway packs are Increment 4; until then administrators can configure those jurisdictions manually (the integration tests do exactly this for Georgia state, Fulton County, and Atlanta).

### Accounting integration

- Invoices and bills may use either a legacy `AccountingTaxCode` (unchanged behavior) or a tax rule. The document form's tax selector lists rules and codes; a "line prices include tax" option defaults to the organization setting.
- An engine-taxed document stores its `DocumentTaxLine` snapshot at creation. Sending, approving, and voiding post each component to its own account (rate mapping, or defaults by kind: VAT/GST 2100 and 1300, sales tax 2140, use tax 2145, excise 2160, other levies 2150, other recoverable input 1330; missing catalog accounts are created on first use), so sales tax, VAT, levies, and excise never share one balance. Non-recoverable purchase tax is added to the expense. Reverse charge and use tax are self-assessed: input tax (or expense) is debited and the output or use tax payable credited, and the supplier is owed only the net. Foreign-currency documents convert each component at the document rate.
- Posting writes `TaxLedgerEntry` rows for engine documents and, from this release, for legacy tax-code documents and untaxed documents (as out of scope), so all tax reporting can read one source. The legacy `AccountingTaxTransaction` is still written; for engine documents its VAT/NHIL/GETFund columns are filled by payable account (2100/2110/2120), so the existing Ghana working VAT return includes engine-taxed documents.
- Credit notes and Procurement supplier invoices use the tax engine since the 2026-10-10 tax follow-ups (see "Tax follow-ups" below); other modules still use legacy tax codes.

### Tax and Compliance (`/app/accounting/tax-compliance`)

Sections: Overview (pack application, organization jurisdiction, pricing default), Rates (version history and a guarded "change rate from a date" dialog that requires confirmation), Rules, Registrations and nexus, Customer exemptions, Jurisdictions, Categories. Viewing requires `accounting.view`; changes require `accounting.settings.manage`. Error text is passed through a short-lived httpOnly cookie instead of the URL. Copy states that calculations follow the organization's selected tax settings and does not claim compliance.

### Tests

- `test/tax-engine.test.ts`: exclusive and inclusive pricing, Ghana structure, US state/county/city layering, compound components, German inclusive VAT, rounding invariants, zero-rated, exempt, reverse charge, validation, and line aggregation.
- `test/tax-engine-posting.test.ts`: per-component accounts, Ghana VAT-return mapping, sales tax kept out of VAT, foreign conversion balance, exempt ledger lines, recoverable versus non-recoverable purchase tax, reverse-charge self-assessment, reversal, and base totals.
- `test/integration/tenant-isolation/tax-engine.test.ts` (real PostgreSQL): idempotent Ghana pack, snapshot and per-component posting feeding the working return, rate change effective only from its date (earlier and backdated documents keep the old rate; rewriting history is refused), exact void reversal with a net-zero ledger, US layered sales tax by jurisdiction, collection-disabled components skipped, registration guard, resale exemption recorded for reporting, reverse-charge purchase, and cross-tenant rule and contact isolation.

### Fixes found while building this increment

`Prisma.Decimal.isPositive()` returns true for zero. New code uses `greaterThan(0)`. Revaluation previously could include a zero-open document as a zero-difference row; that is now skipped.

### Known limitations of Increment 3

- Tax reports by jurisdiction (the data now exists in `TaxLedgerEntry`) and the US, EU, UK, CH, and NO packs are Increment 4.
- Rules are selected per document (one rule for all lines); per-line categories are a later enhancement.
- No external tax-rate provider or VAT-number validation provider is connected yet. Their interfaces arrive with the packs.
- Withholding tax remains on legacy tax codes.

Increment 3 was released to production on 2026-10-06 (PR #56, merge `6cdaba7`, deployment `dpl_H7FN6YcmHYGpxUsAT9UZNm8KmBoi`; migration applied).

## Increment 4: jurisdiction packs and tax reports (implemented 2026-10-06)

No schema change.

### Packs (`src/modules/tax/packs`)

- **United States** (foundation): the US plus all 50 states and DC as STATE jurisdictions, the IRS authority, and categories (taxable goods, taxable services, non-taxable, resale). It creates no rates and no rules, because sales tax varies by state, county, city, and district and changes often. Organizations record their registrations (nexus) and the state and local rates they collect, and can layer state, county, city, and district components in one rule. A reference table of statewide base rates (`US_STATE_BASE_RATE_REFERENCE`) is shown on the Rates section as a suggestion to verify, never applied automatically. The pack provisions separate ledger accounts for federal and employment taxes so they are never mixed with sales tax: 2200 Federal Income Tax Payable, 1450 Estimated Federal Income Tax Payments, 2210 Federal Income Tax Withheld, 2211/2212 Social Security (employee/employer), 2213/2214 Medicare (employee/employer), 2215 FUTA, 2216 State Unemployment, 2160 Excise, 2140 Sales Tax, 2145 Use Tax, 6100 Employer Payroll Tax Expense, and 6110 Income Tax Expense. Existing accounts with the same code are left untouched.
- **European Union**, built for the organization's home member state (from its jurisdiction code, e.g. EU-DE): the EU, EU-OSS, and EU-IOSS scheme jurisdictions plus all 27 member states, each member state's standard VAT rate (source: the Commission's Taxes in Europe Database), and rules for domestic standard, export outside the EU (zero-rated), exempt, intra-EU B2B reverse charge (sale and purchase), and a destination-VAT OSS B2C rule for each of the other 26 member states. Whether a sale falls under OSS depends on the EU-wide threshold and registration; the administrator chooses the rule, and OSS/IOSS registrations are recorded on the scheme jurisdictions. Reduced rates are added by the administrator.
- **United Kingdom** (HMRC; standard 20%, reduced 5%, zero, exempt, domestic reverse charge), **Switzerland** (FTA; 8.1%, 2.6%, accommodation 3.8%, exempt), and **Norway** (Skatteetaten; 25%, food 15%, reduced 12%, exempt). These are separate jurisdictions and never use EU logic.

### Providers (`src/modules/tax/providers.ts`)

- `VatIdValidationProvider`, with a built-in format-only check covering EU member states (including Greece's EL prefix and Northern Ireland's XI), the UK, Switzerland, and Norway. Results are labeled FORMAT and state that registration was not verified. A registry provider (for example VIES) can be registered without changing Accounting. Contacts with a country and VAT number are format-checked on save.
- `TaxRateProvider` for professional tax engines (for example address-level US sales tax). Manual configuration remains the default, and a provider quote must be stored as the document's tax-line snapshot like any other calculation. No provider is connected.

### Reports (`src/modules/tax/reports.ts`, `/app/accounting/tax-reports`)

Read from `TaxLedgerEntry` (base currency) over local calendar days in the organization timezone (`src/lib/timezone.ts`, which handles daylight-saving changeovers). Views: by jurisdiction, by level (state, county, city), by tax kind, by authority, and by month. Each shows taxable, zero-rated, exempt, non-taxable, and reverse-charge sales, plus tax collected, recoverable input tax, self-assessed tax, adjustments, and net payable. A document's taxable amount counts once per group even when it has several components. Voided bills reduce input tax and voided invoices reduce output tax. Net payable deducts only recoverable kinds (VAT, GST, levies); sales and use tax on purchases is cost. Also included are a customer exemption report (exempt sales by customer with certificates on file) and tax liabilities by class from ledger balances (VAT and levies, sales and use tax, excise, other levies, withholding, payroll and employment, income tax, recoverable input tax, estimated payments). CSV export at `/app/accounting/tax-reports/export` neutralizes spreadsheet formulas and is not cached. Access requires `accounting.reports.view`. The reports are working reports and state that Rock Frost does not file returns.

### Tests

- `test/tax-packs.test.ts`: US pack structure (51 states/DC, no rates, separate federal accounts, reference rates), EU pack per home state (27 rates, 26 OSS rules, reverse charge, export), refusal without an EU home state, UK/CH/NO separation, registry listing, VAT format checks and prefixes, and timezone boundaries including New York and Berlin daylight-saving days.
- `test/integration/tenant-isolation/tax-packs-reports.test.ts` (real PostgreSQL): EU pack for a German organization (domestic VAT, intra-EU B2B reverse charge, OSS B2C sale to France at French VAT, reported under EU-FR), US pack provisioning (51 states, federal accounts, no rates), New York sales tax by state and level, sales tax kept out of VAT, an invoice issued late on 31 October in New York reported in October, the resale exemption report, liabilities by class, and cross-tenant report isolation.

### Known limitations of Increment 4

- US local rates and taxability by product are configured by the organization or a future provider; Rock Frost does not determine economic nexus. The nexus status is the administrator's record.
- EU reduced rates, OSS return file formats, and VIES registry checks are not included; OSS and IOSS are readiness (scheme registrations, destination rules, reporting by member state of consumption).
- Payroll does not yet post US employment taxes into the new accounts automatically; the accounts and the liability report are ready for it.

## Tax follow-ups, part 1: engine coverage (implemented 2026-10-10)

Migration `20261010090000_tax_engine_coverage` (additive): `taxRuleId`, `taxTreatment`, and `taxAmount` on `AccountingCreditNote` and `ProcurementSupplierInvoice`, and a `SUPPLIER_INVOICE` value on `TaxDocumentType`.

- **Credit notes on the tax engine.** The credit note form lists tax rules beside legacy codes, with the inclusive-pricing option. An engine credit note computes tax from the rates in effect on its issue date and stores its own `DocumentTaxLine` snapshot (`CREDIT_NOTE`). Applying it to an invoice (at the invoice's booked rate, the final credit relieving the exact remaining base amount) or refunding it debits revenue and each output tax component's account and credits the receivable or refund account, with negative `ADJUSTMENT` tax ledger rows per component.
- **Credit notes in the tax records (fix).** Applying or refunding any credit note, legacy or engine, now writes a negative `ADJUSTMENT` row to the working VAT return (`AccountingTaxTransaction`) and the tax ledger, dated when it is settled to match its journal entry. Previously credit notes reversed tax in the journal only, so the working return and tax reports overstated output tax.
- **Procurement supplier invoices on the tax engine.** The supplier invoice form lists tax rules. Purchase order costs exclude tax, so the engine adds each component from the rates on the invoice date and stores a `SUPPLIER_INVOICE` snapshot. Approval debits inventory and each recoverable input tax component (non-recoverable tax is added to inventory cost; self-assessed components credit their output account) and credits accounts payable, with `INPUT` tax ledger rows.
- **Legacy supplier invoices in the tax ledger (fix).** Approving a legacy-taxed supplier invoice now also writes tax ledger rows, so Procurement input tax appears in the jurisdiction reports as Accounting bills do.
- A credit note or supplier invoice uses either a legacy tax code or a tax rule, never both, and a rule must belong to the organization.

Tests: `test/integration/tenant-isolation/tax-engine-coverage.test.ts` (real PostgreSQL: legacy credit note tax records, engine credit note snapshot, application and refund postings per component, inclusive pricing, cross-organization refusal, engine and legacy supplier invoice postings and ledger rows, rule and code exclusivity); `test/accounting-contacts-bills-credit-notes.test.ts` asserts the credit note tax records.

## Remaining increments

2. **Formatting sweep (done 2026-10-08):** module pages, dashboard widgets, charts, the POS sell screen, Fleet owner statements, the invoice and bill PDF, and the payslip SMS format money with the organization formatter or `formatMoney(value, currency, organizationNumberLocale(organization))`; the School helper that hard-coded GHS was removed; new invoices, bills, and credit notes pre-select a contact's default currency. `test/money-formatting-sweep.test.ts` fails if new code calls `formatMoney` without a currency or without the organization locale outside the documented exceptions (Rock Frost's own GHS platform billing pages, and service error messages, which use the document or base currency).
3. **Tax follow-ups:** in progress. Done: credit notes and Procurement supplier invoices on the tax engine, and credit notes and supplier invoices in the tax records (see "Tax follow-ups, part 1"). Remaining: per-line tax categories, EU reduced-rate catalogs, a VIES registry provider, OSS return exports, and configurable payroll statutory deductions with US federal posting.
4. **Contracts:** core (5a), lifecycle (5b), and integrations and reporting (5c) implemented (`docs/CONTRACTS_MODULE.md`); an electronic signature provider and public listing remain.
