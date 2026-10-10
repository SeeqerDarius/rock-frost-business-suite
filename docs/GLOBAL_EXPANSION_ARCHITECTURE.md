# Global accounting and contract expansion: audit baseline

**Audit date:** 2026-10-06
**Status:** Phase 1 discovery is complete. A first, additive localization utility increment is implemented; organization persistence/onboarding, accounting currency snapshots, jurisdiction tax behavior, and Contracts are still outstanding.

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

## Current blocker and release status

The working tree at audit start already contained substantial uncommitted work across schema, Accounting, Payroll, School, SEO, UI, docs, generated artifacts, and migrations. Those changes are outside this expansion and must be attributed and resolved before any release can safely select a commit scope. No production deployment, migration, or claim of completion is made by this audit. The remaining phases require implementation, tests, disposable-database migration verification, and the repository's full release gates.

## Implemented foundation increment (2026-10-06)

- `src/lib/localization.ts` now offers explicit, overridable onboarding suggestions for Ghana, the United States, selected EU countries, the UK, Switzerland, Norway, Japan, Canada, Australia, New Zealand, South Africa, Nigeria, Kenya, UAE, India, and Singapore. Country names/codes normalize consistently. Unsupported countries return an empty currency/locale/timezone so the setup flow can require a deliberate choice instead of silently assigning Ghana or USD.
- The United States receives an explicit US pack identifier and a primary-state timezone suggestion helper; the generic US timezone suggestion is only a fallback. It is not legal nexus or tax determination.
- `src/lib/currency.ts` accepts an explicit locale and otherwise uses a currency-level presentation fallback. Ghana remains the fallback when no currency is provided. Country-specific formatting (such as French versus German EUR) requires passing the saved organization locale; current callers have not yet been migrated to organization locale settings.
- `formatLocalizedNumber()` and `formatLocalizedDate()` accept explicit locale/timezone context.
- `test/global-localization.test.ts` covers country defaults, distinct EU/non-EU packs, US timezone suggestions, unsupported country handling, currency formatting, and date boundaries.
- This is only a code-level foundation. Defaults are not persisted, onboarding/settings do not consume them yet, accounting remains single-currency, and tax packs other than the existing Ghana implementation are identifiers only.
