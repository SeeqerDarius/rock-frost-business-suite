# Global accounting and contract expansion: audit baseline

**Audit date:** 2026-10-06  
**Status:** Phase 1 discovery is complete. Increment 1 (global foundation) is implemented: organization localization persistence and settings, country-aware signup, locale and timezone-aware formatting, and an append-only exchange-rate store with a provider abstraction. Multi-currency documents, the jurisdiction tax engine, country packs, and Contracts are outstanding.

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

- Accounting documents are still single-currency. `resolveExchangeRate()` and `buildFxSnapshot()` are ready, but invoices, bills, payments, and contacts do not yet store a transaction currency or post realized FX. That is Increment 2.
- About 170 existing `formatMoney()` call sites still format with the currency-level default locale. Ghana tenants are unaffected; a non-GHS tenant's amounts are labeled correctly only where the call passes the organization currency. Migrating call sites to `createOrganizationFormatter()` is part of Increment 2.
- No live FX provider is connected; manual rates are the source of truth.
- The interface language remains English; `defaultLanguage` is stored for generated documents.

## Remaining increments

2. **Multi-currency accounting:** transaction currency and FX snapshot columns on invoices, bills, credit notes, payments, and contacts; base-currency posting; realized FX gain/loss journals on settlement; unrealized revaluation as an explicit, reversible accounting event; formatter migration.
3. **Tax engine core:** jurisdictions, authorities, tax types, categories, registrations, exemptions, effective-dated and versioned rules and rates with provenance, document tax-line snapshots, account mappings, and Ghana compatibility through the existing `AccountingTaxCode` surface.
4. **Jurisdiction packs:** Ghana; US (state/county/city/district layering, nexus status, exemption certificates, sales versus use tax, separate federal/employment/excise account configuration and reports); EU (member-state rates, B2B/B2C, reverse charge, OSS/IOSS readiness, VAT ID validation provider interface); UK, CH, and NO foundations.
5. **Tax and Compliance settings UI and tax reports.**
6. **Contracts:** core, lifecycle, integrations, and reporting as described in the architecture direction above.
