# Rock Frost Business Suite

Shared Paystack operational-payment infrastructure lets tenant organizations connect a masked Settlement Account. Fleet drivers can pay server-calculated remittance and Work & Pay obligations through hosted checkout, with confirmed revenue posted to the tenant Accounting ledger. Shared trend charts across dashboards and reporting allow Curved, Zigzag, and Bars views without changing the underlying figures. See [Shared Payments and Settlements](docs/SHARED_PAYMENTS_AND_SETTLEMENTS.md).

Security and compliance claims are tracked in [docs/COMPLIANCE_AND_ASSURANCE.md](docs/COMPLIANCE_AND_ASSURANCE.md). The register separates implemented product controls from provider-dependent controls and external certifications or regulatory determinations.

A modular multi-tenant business platform. Organizations activate fourteen customer-facing products: Fleet, Installment Sales, CRM, Inventory & Procurement, Accounting, Human Resources & Payroll, Analytics, Point of Sale, Project Management, Hotel Management, School Management, Hostel Management, Pharmacy Management, and Hospital Management. Each product runs in one unified workspace without mixing unrelated business data.

> This is a clean rebuild started 2026-07-19. The previous implementation is archived on branch `archive/pre-redesign-rfbs` and under `docs/archive/previous-implementation/`. See `docs/DECISIONS.md` for why.

**Current status**: fourteen customer-facing products are implemented across sixteen internal permission and route domains. Payroll remains an internal domain within Human Resources & Payroll, and Procurement remains an internal domain within Inventory & Procurement, preserving existing data and URLs while presenting one subscription for each combined product. The authenticated workspace uses a responsive, user-collapsible navigation shell with vertical-suite workflows and operational overview pages. Release and deployment evidence is recorded in `OPERATOR_HANDOFF.md`. The production platform is live at [rockfrostgroup.com](https://www.rockfrostgroup.com).

Security controls include server-enforced tenant and role boundaries, bcrypt password hashing, encrypted TOTP secrets, login lockout, signed host-only sessions, upload signature validation, global browser security headers, and CI dependency and Git-history secret scanning. Optional Cloudflare Turnstile protection for login, password reset, and contact submissions is enabled by configuring both documented Turnstile environment variables. When Turnstile is not configured, the public contact form uses a signed, expiring form proof, a honeypot, and a database-backed resubmission cooldown; authentication forms continue to fail closed.

The public marketing site has a generated sitemap and robots policy, unique canonical metadata, Open Graph/Twitter sharing data, structured data, dedicated search landing pages for all thirteen products, and a consent-controlled carousel for approved platform tenants and independent Rock Frost customers. Platform owners manage homepage copy, visibility, ordering, logos, and publication without code from the bottom-anchored Platform Settings workspace. Onboarded tenants and independent customers are never published automatically. See `docs/SEO.md` for the authoritative indexable surface, `docs/PLATFORM_SETTINGS.md` for owner controls, and the Search Console launch checklist.

## Vertical suites

- **Hotel Management:** rooms, guests, reservations, stay lifecycle, folios and payments, housekeeping, reporting, restaurant, channels, and enforced property settings for currency/timezone, stay policy, charges, numbering, settlement, and room-readiness workflow.
- **School Management:** student/guardian administration with optional profile photos, academic periods, classes, enrollment, attendance, fees and reporting, followed by examinations, grading, timetables, transport, library, campus services and education-specific payroll integration.
- **Hostel Management:** a separately subscribed companion to School Management for schools with boarding facilities. Buildings, rooms and beds (bed labels generated automatically from room capacity), student allocations, warden assignments per building, and hostel fee structures, invoices, and payments — see `docs/HOSTEL_MODULE.md`.
- **Inventory & Procurement:** tenant-isolated item/category/warehouse catalogues, optional item images and barcodes, controlled physical counts, immutable movements, multi-line requisitions, purchasing approvals, purchase orders, numbered goods receipts, supplier-invoice matching and maker-checker approval, due dates, partial supplier payments, outstanding payable balances, low-stock alerts, reporting, POS integration, and automatic Accounting liability, recoverable-input-tax, and settlement journals when Accounting is active.
- **Human Resources & Payroll:** employee records, onboarding, leave, performance reviews, controlled maker-checker termination and reinstatement, offboarding, access and final-pay coordination, compensation, payroll runs, payslips, settings, and reporting in one product and subscription.
- **Fleet Management:** administrator-linked driver logins with a task-oriented, mobile-friendly driver workspace; assigned-vehicle-only navigation; daily or Monday-to-Sunday weekly remittance obligations; driver-recorded cash, mobile money and bank payments; assigned-driver-linked Work & Pay contracts and instalments; duplicate-safe payment periods; explicit manager review with transactional verified-ledger updates and tenant audit recording; private maintenance-photo reporting; ownership history; and a linked Vehicle Owner Workspace with owner-scoped vehicles, remittance progress, verified expenses, maintenance, documents and activity. See `docs/FLEET_MODULE_IMPLEMENTATION.md`.
- **Accounting:** double-entry invoicing and expenses, complete supplier payables and customer receipt allocations, effective-dated tax codes, separate VAT/NHIL/GETFund evidence, Procurement input-tax integration, controlled tax periods and working VAT returns, revision-controlled budgets and rolling forecasts, actual-versus-plan reporting, classified cash, bank and mobile-money accounts, locked opening balances, a derived cashbook, reconciliation history, imprest petty cash, immutable posting numbers, serialized period controls, source-owned reversals, and financial reports. Activated operational modules post confirmed transactions into source-specific accounts and planning can compare those posted actuals by account, source module, and authoritative branch.
- **Point of Sale:** dynamic barcode-aware checkout, immutable sale-line snapshots, split payments, suspended sales, concurrency-safe partial returns with Inventory reversal, and expected-cash till closing with controlled variance approval. See `docs/POS_OPERATIONS.md`.
- **Pharmacy Management:** tenant-isolated medicines, licensed suppliers, batch/expiry and FEFO stock, barcode lookup for medicines and batches, patients and prescribers, a simplified prescription-led dispensing counter that fills the patient and prescribed lines automatically, a separate over-the-counter sale path, optional two-person maker-checker approval for controlled drugs, an append-only stock-reconciliation ledger (count, adjustment, write-off, supplier return, patient return), the controlled-medicine register, safety alerts, reports, settings, backups, and subscription seats.
- **Hospital Management (merged to `main` and live in production since 2026-08-12):** patient registration with organization-unique MRN and an inline duplicate-patient advisory, appointments, encounters with vitals/notes/diagnoses/care plans, admissions/wards/beds, laboratory and imaging with immutable verified results, split entry/verify permissions with maker-checker enforcement and a rejection workflow, a versioned Hospital-owned medication-order contract that never touches Pharmacy's tables directly, billing/invoicing/insurance claims, nursing tasks, and clinical alerts/referrals/consent. Operational record-keeping software, not a medical device or diagnosis engine. See `docs/HOSPITAL_MODULE.md`.

School is undergoing an active customer-readiness expansion. The first tranche
adds explicit student lifecycle history, reusable fee structures with
idempotent bulk billing, enforced attendance correction windows, and
campus-specific receipt numbering. See
`docs/SCHOOL_CUSTOMER_READINESS.md` for delivered scope, remaining work, and
release gates.

See `docs/HOTEL_AND_SCHOOL_MODULES.md` for boundaries, invariants, roles, integrations, and completion gates. Both modules now have tenant routes and unique RBAC prefixes.

Production uses host-separated authentication: platform owners use `admin.rockfrostgroup.com`, tenant users use `app.rockfrostgroup.com`, and public pages remain on `www.rockfrostgroup.com`. Host-only cookies allow both accounts to stay signed in concurrently in one browser profile.

The public site publishes canonical metadata, structured data, `robots.txt`, and a complete XML sitemap for Google discovery. Optional Vercel Analytics and Speed Insights remain disabled until a visitor accepts them through the cookie preferences interface; essential authentication and security cookies remain available independently.

A new user sees a short interactive walkthrough of the workspace chrome the first time they sign in, and a module gets its own short intro (derived automatically from its own description and navigation, not hand-written per module) the first time that user opens it; either can be replayed from the account menu. See `docs/ONBOARDING_TOURS.md`.

Platform administrators and organization users can enable two-factor authentication from Account Security, using either an authenticator app or SMS codes (via mNotify - see `docs/SMS_INTEGRATION.md`). Module subscriptions support enforced per-module user seats (including pending invitations and multi-module roles), with used and remaining capacity visible to tenant administrators. Organization administrators can purchase catalogue modules directly from Billing without platform-owner approval; verified Paystack payment activates access automatically and returns the customer to a detailed thank-you and payment-summary page. Paystack card subscriptions can renew automatically with signed-webhook verification, idempotent payment history, failure suspension, hosted card management, and cancellation that preserves already-paid access. Organization administrators can safely change roles and deactivate/reactivate members, with immediate seat release and capacity checks on restored access. Assigning a Driver-permission role also puts that member straight onto the Fleet roster. When HR is enabled, active internal members are automatically linked to one HR employee record without overwriting HR-managed details; Vehicle Owner and Investor memberships remain external stakeholders. Tenants also have active-module Excel exports, lossless JSON system backups, and password/2FA-protected merge restores; see `docs/BILLING_AND_SUBSCRIPTIONS.md` and `docs/BACKUP_AND_RECOVERY.md`. Every module's Reports page also offers PDF and Excel downloads of its live figures.

Public pricing is available at `/pricing`. The public acquisition pages position Rock Frost as a modular, role-based ERP built for Ghana: organizations can start with a focused module or connect operational suites to Accounting, while managers, staff and external stakeholders receive appropriately scoped workspaces. A database-backed, platform-operator-editable GHS catalogue (`/app/platform/subscriptions`'s "Pricing catalogue" section) covers all fourteen customer-facing products, annual savings, included and additional seats, first-class combined-suite entitlements, and enterprise pricing. Marketing updates do not overwrite operator-approved amounts. Accounting is GHS 849 monthly or GHS 8,490 annually by default, and Accounting-inclusive suites use the reviewed August 2026 catalogue prices unless a platform operator has since edited them. A visitor can start a subscription without requesting a demo or waiting for operator approval: `/subscribe` verifies the owner email, prepares the workspace and pending product or suite, then sends the owner to tenant Billing for Paystack payment and automatic activation. Trial workspaces are limited to three customer-facing products.

The public `/company` page positions Rock Frost Technologies as a broader technology partner covering bespoke software, digital commerce, websites, integrations, cloud modernization, and advisory work alongside the Business Suite. It presents selected work and carefully scoped Ghana Data Protection Act language without representing product controls as legal certification.

All public marketing pages share an editorial hero system, fluid display typography, translucent premium panels, and a restrained blue-white atmospheric background. This visual system is scoped to the public site and does not alter authenticated tenant or platform workspaces.

Every tenant can reach in-app Support via a responsive floating chat bubble available everywhere in the workspace, with an online indicator, read receipts, optimistic sending feedback, AI assistance, and human handoff; platform operators reply from a two-pane inbox (`/app/platform/support`) across every organization. Public pages also expose a floating Contact entry point, while Platform Settings controls the public sales email, support email, phone, and WhatsApp details. No email is sent by the authenticated chat feature. See `docs/SUPPORT_MESSAGING.md`.

Authenticated users can submit private product feedback or explicitly consented testimonials from `/app/feedback`. Platform operators moderate publication from `/app/platform/feedback`; nothing is published automatically, attribution and logo display remain independently consent-bound, and consent withdrawal immediately removes a testimonial from the public feed. Approved testimonials reuse the accessible homepage customer carousel. Organization dashboards also show timezone-aware greetings, while infrequent, dismissible business motivation messages remain local to each user and avoid high-attention routes. See `docs/CUSTOMER_FEEDBACK.md`.

## Stack

- **Next.js 16.2.12** (App Router, Turbopack) — see `AGENTS.md` before writing Next.js-specific code; this project pins a version with breaking changes from what most training data assumes.
- **TypeScript**, strict mode
- **Tailwind CSS v4**
- **shadcn/ui** (Base UI primitives) — see `docs/DECISIONS.md` for the license/rationale
- **Prisma** + **Neon Postgres**
- **NextAuth v4** (credentials-based auth, JWT sessions, session revocation via a `sessionVersion` check, canonical invited-email handoff to login, and accessible password visibility — see `docs/HARDENING_PLAN.md`)
- **Zod** for input validation on the highest-risk untrusted-input surfaces (see `src/lib/validation.ts`)
- **Vitest** for automated tests (`npm run test`)

## Getting started

```bash
cp .env.example .env   # fill in real values — see comments in the file
npm install
npm run db:seed        # idempotent: permissions, system roles, module registry rows
npm run dev
```

Node version is pinned in `.nvmrc`/`package.json`'s `engines` field. Required environment variables are documented in `.env.example`. See `docs/DATABASE_STRATEGY.md` for the database connection story and `docs/AUTHENTICATION_AND_AUTHORIZATION.md` for auth-related variables.

**Database migrations**: always use `npx prisma migrate deploy` (after hand-verifying a `prisma migrate diff`-generated migration file) — **never** `npx prisma migrate dev` against the shared Neon database. See `OPERATOR_HANDOFF.md`'s "Mandatory instructions" for why.

**Platform-owner isolation check/repair**: `npm run db:repair-platform-owner-isolation` removes any historical tenant memberships from platform identities, revokes their pending tenant invitations, and invalidates affected sessions. Deployment migration `20260726050000_enforce_platform_owner_isolation` performs the same idempotent repair automatically.

## Project structure

See `docs/ARCHITECTURE.md` for the full breakdown. Short version:

```
src/
  app/            App Router routes: (public) marketing site, (auth) sign-in/reset/invite, app/ (everything behind sign-in, at /app/*, one route tree per module plus app/platform for Rock Frost operators)
  modules/        Per-module service layer, navigation, dashboards and Accounting Insights (fleet/, installment/, crm/, inventory/, accounting/, hr/, procurement/, payroll/, analytics/, pos/, projects/)
  platform/       Shared platform concerns: module registry, platform-scope navigation, dashboard widget registry
  components/     Genuinely reusable UI: ui/ (shadcn primitives), layout/, navigation/, feedback/, forms/
  lib/            Shared utilities: db client, auth (NextAuth config, session revocation, invitations, permissions), tenant resolution, email, validation
  types/          Shared TypeScript types
prisma/           Database schema, migrations, and the committed seed.ts (permissions/roles/modules bootstrap)
test/             Vitest suite — mocked-db unit/integration tests for the hardening-pass fixes
docs/             Authoritative documentation (this rebuild) + docs/archive/ (retired, non-authoritative)
```

Accounting Insights includes the branded Rock Frost Business Assistant. Assistant replies use a dedicated visual identity, while each signed-in user's questions use their uploaded profile photo with an initials fallback.

## Documentation

- `docs/OFFLINE_PWA.md` - browser PWA architecture, signed synchronization, local-data security, work packs, attachment staging, retention, and release-acceptance rules. The expanded multi-module implementation remains feature-flagged until its production acceptance gate passes.
- `docs/OFFLINE_CAPABILITY_MATRIX.md` - current per-module offline support and protected conflict rules.
- `docs/OFFLINE_OPERATIONS_RUNBOOK.md` - installation, feature-flag rollout, kill switch, rollback, and disaster recovery.

Start with `OPERATOR_HANDOFF.md` at the repo root for the current state and next steps, and `docs/HARDENING_PLAN.md` for the production-hardening track specifically. Then:

- `docs/PRODUCT_VISION.md` — what this platform is and isn't
- `docs/ARCHITECTURE.md` — folder structure, route groups, module isolation mechanics
- `docs/MODULE_BOUNDARIES.md` — the non-negotiable isolation rules between modules
- `docs/DESIGN_SYSTEM.md` — UI foundation, tokens, component conventions
- `docs/DEVELOPMENT_ROADMAP.md` — phased build history (all nineteen phases complete)
- `docs/DATABASE_STRATEGY.md` — Prisma/Neon setup and migration workflow
- `docs/AUTHENTICATION_AND_AUTHORIZATION.md` - real, enforced auth/RBAC (162 permission keys across sixteen modules)
- `docs/BACKUP_AND_RECOVERY.md` — tenant-isolated module exports, protected merge restore, and infrastructure recovery boundaries
- `docs/EMAIL_DELIVERY.md` — transactional templates, sender-domain authentication, and deliverability operations
- `docs/TESTING_STRATEGY.md` — how work is validated, current automated test coverage
- `docs/MODULE_REQUESTS_AND_CUSTOMIZATION.md` — customer requests, operator assignment, approval/enablement, and per-organization module configuration
- `docs/BILLING_AND_SUBSCRIPTIONS.md` — public acquisition, prefilled onboarding, offline/platform billing modes, activation, and expiry enforcement
- `docs/ORGANIZATION_LIFECYCLE.md` — Super Admin onboarding, profile/status management, protected platform organizations, and recoverable deletion
- `docs/HARDENING_PLAN.md` — the production-hardening track: what's fixed, what's deferred, why
- `docs/OPERATIONS_AND_MONITORING.md` — trial-expiry cron, health checks, logs, performance monitoring, and accessibility operations
- `docs/OPERATIONAL_WORKFLOW_UPGRADES.md` - Fleet driver, Accounting liquidity, and HR termination workflow controls
- `docs/TAX_AND_STATUTORY_REPORTING.md` - effective-dated tax codes, Ghana VAT working returns, Procurement input tax, and filing boundaries
- `docs/ACCOUNTING_PLANNING.md` - budgets, forecasts, maker-checker approvals, revisions, and actual-versus-plan reporting
- `docs/SUPPORT_MESSAGING.md` — in-app tenant/platform support chat, presence, and why it's deliberately not email or a business module
- `docs/DECISIONS.md` — dated log of consequential technical decisions

`docs/archive/previous-implementation/` contains the retired implementation's docs, marked obsolete. Do not follow them.
