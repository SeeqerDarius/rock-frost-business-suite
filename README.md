# Rock Frost Business Suite

A modular multi-tenant business platform. Organizations activate thirteen independent management modules — Fleet, Installment Sales, CRM, Inventory, Accounting, HR, Procurement, Payroll, Analytics, Point of Sale, Project Management, Hotel Management, and School Management — from one unified workspace, without mixing unrelated business data together.

> This is a clean rebuild started 2026-07-19. The previous implementation is archived on branch `archive/pre-redesign-rfbs` and under `docs/archive/previous-implementation/`. See `docs/DECISIONS.md` for why.

**Current status**: all thirteen business modules are implemented and have passed the complete local validation gate, including all real-PostgreSQL migration, tenant-isolation, and concurrency tests. The authenticated workspace uses a responsive, user-collapsible navigation shell with grouped Hotel and School workflows and operational overview pages. Release/deployment evidence is recorded in `OPERATOR_HANDOFF.md`. The production platform is live at [rockfrostgroup.com](https://www.rockfrostgroup.com). Public acquisition, subscriptions, hosted checkout, trial expiry, tenant isolation, and production monitoring remain implemented.

The public marketing site has a generated sitemap and robots policy, unique canonical metadata, Open Graph/Twitter sharing data, structured data, dedicated search landing pages for all thirteen modules, and a consent-controlled carousel for approved platform tenants and independent Rock Frost customers. Platform owners manage homepage copy, visibility, ordering, logos, and publication without code from the bottom-anchored Platform Settings workspace. Onboarded tenants and independent customers are never published automatically. See `docs/SEO.md` for the authoritative indexable surface, `docs/PLATFORM_SETTINGS.md` for owner controls, and the Search Console launch checklist.

## Vertical suites

- **Hotel Management:** rooms, guests, reservations, stay lifecycle, folios and payments, housekeeping, reporting, restaurant, channels, and enforced property settings for currency/timezone, stay policy, charges, numbering, settlement, and room-readiness workflow.
- **School Management:** student/guardian administration, academic periods, classes, enrollment, attendance, fees and reporting, followed by examinations, grading, timetables, transport, library, campus services and education-specific payroll integration.

School is undergoing an active customer-readiness expansion. The first tranche
adds explicit student lifecycle history, reusable fee structures with
idempotent bulk billing, enforced attendance correction windows, and
campus-specific receipt numbering. See
`docs/SCHOOL_CUSTOMER_READINESS.md` for delivered scope, remaining work, and
release gates.

See `docs/HOTEL_AND_SCHOOL_MODULES.md` for boundaries, invariants, roles, integrations, and completion gates. Both modules now have tenant routes and unique RBAC prefixes.

Production uses host-separated authentication: platform owners use `admin.rockfrostgroup.com`, tenant users use `app.rockfrostgroup.com`, and public pages remain on `www.rockfrostgroup.com`. Host-only cookies allow both accounts to stay signed in concurrently in one browser profile.

Platform administrators and organization users can enable authenticator-based two-factor authentication from Account Security. Organization administrators also have tenant-isolated, active-module Excel reporting exports, lossless JSON system backups, and password/2FA-protected merge restores; see `docs/BACKUP_AND_RECOVERY.md`.

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
  modules/        Per-module service layer + navigation + dashboard widget (fleet/, installment/, crm/, inventory/, accounting/, hr/, procurement/, payroll/, analytics/, pos/, projects/)
  platform/       Shared platform concerns: module registry, platform-scope navigation, dashboard widget registry
  components/     Genuinely reusable UI: ui/ (shadcn primitives), layout/, navigation/, feedback/, forms/
  lib/            Shared utilities: db client, auth (NextAuth config, session revocation, invitations, permissions), tenant resolution, email, validation
  types/          Shared TypeScript types
prisma/           Database schema, migrations, and the committed seed.ts (permissions/roles/modules bootstrap)
test/             Vitest suite — mocked-db unit/integration tests for the hardening-pass fixes
docs/             Authoritative documentation (this rebuild) + docs/archive/ (retired, non-authoritative)
```

## Documentation

Start with `OPERATOR_HANDOFF.md` at the repo root for the current state and next steps, and `docs/HARDENING_PLAN.md` for the production-hardening track specifically. Then:

- `docs/PRODUCT_VISION.md` — what this platform is and isn't
- `docs/ARCHITECTURE.md` — folder structure, route groups, module isolation mechanics
- `docs/MODULE_BOUNDARIES.md` — the non-negotiable isolation rules between modules
- `docs/DESIGN_SYSTEM.md` — UI foundation, tokens, component conventions
- `docs/DEVELOPMENT_ROADMAP.md` — phased build history (all sixteen phases complete)
- `docs/DATABASE_STRATEGY.md` — Prisma/Neon setup and migration workflow
- `docs/AUTHENTICATION_AND_AUTHORIZATION.md` — real, enforced auth/RBAC (104 permission keys across 13 modules)
- `docs/BACKUP_AND_RECOVERY.md` — tenant-isolated module exports, protected merge restore, and infrastructure recovery boundaries
- `docs/EMAIL_DELIVERY.md` — transactional templates, sender-domain authentication, and deliverability operations
- `docs/TESTING_STRATEGY.md` — how work is validated, current automated test coverage
- `docs/MODULE_REQUESTS_AND_CUSTOMIZATION.md` — customer requests, operator assignment, approval/enablement, and per-organization module configuration
- `docs/BILLING_AND_SUBSCRIPTIONS.md` — public acquisition, prefilled onboarding, offline/platform billing modes, activation, and expiry enforcement
- `docs/ORGANIZATION_LIFECYCLE.md` — Super Admin onboarding, profile/status management, protected platform organizations, and recoverable deletion
- `docs/HARDENING_PLAN.md` — the production-hardening track: what's fixed, what's deferred, why
- `docs/OPERATIONS_AND_MONITORING.md` — trial-expiry cron, health checks, logs, performance monitoring, and accessibility operations
- `docs/DECISIONS.md` — dated log of consequential technical decisions

`docs/archive/previous-implementation/` contains the retired implementation's docs, marked obsolete. Do not follow them.
