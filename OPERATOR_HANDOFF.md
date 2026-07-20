# Rock Frost Business Suite — Operator Handoff

## Mandatory instructions for every agent

Before making changes:
1. Read this entire file.
2. Read `docs/PRODUCT_VISION.md`, `docs/ARCHITECTURE.md`, and `docs/MODULE_BOUNDARIES.md`.
3. Read `docs/DEVELOPMENT_ROADMAP.md` to see what phase is active.
4. Check `git status`.
5. Do not follow anything under `docs/archive/` — it's retired and explicitly non-authoritative.
6. Do not undo or overwrite another agent's work unless explicitly instructed.

After making changes:
1. Run the full validation suite from `docs/TESTING_STRATEGY.md` (`npm run lint`, `npx tsc --noEmit`, `npx prisma validate`, `npx prisma generate`, `npm run build`) and fix all errors.
2. Update this file: date, objective, files changed, summary, build result, known issues, next recommended step.
3. Commit only intentional changes.

## Current phase

**Phase 7 (Installment Management Migration) — complete.** All seven phases through Fleet + Installment are now done. See `docs/DEVELOPMENT_ROADMAP.md` for what comes next (Phase 8+ / later phases, gated pending approval).

## Current architecture (short version — see `docs/ARCHITECTURE.md` for full detail)

- Next.js 16 App Router under `src/app/`. Public marketing site at bare paths via `(public)`; auth UI via `(auth)`; **everything requiring sign-in lives under `/app/*`** — `app/(overview)` (organization scope), `app/fleet`, `app/installment`, `app/platform` (platform scope). See `docs/ARCHITECTURE.md`'s "Why /app exists."
- Each module (`fleet`, `installment`) has its own `layout.tsx` rendering `AppShell` with its own navigation array, guarded on `canAccessModule()` (module enabled for the org + a permission under that module's registered `permissionPrefix`).
- `src/platform/modules/registry.ts` is the single source of truth for every module's metadata; `src/platform/modules/dashboard-widgets.tsx` maps a module key to a real dashboard summary component — both Fleet's and Installment's are wired up now.
- shadcn/ui (Base UI primitives) + Tailwind v4 design system — see `docs/DESIGN_SYSTEM.md`.
- **Both business modules are now fully real.** Fleet Management (Phase 6): Vehicles, Drivers, Owners, Maintenance, Insurance & Roadworthy, Payments, Work & Pay, Reports, honest Settings placeholder. Installment Management (Phase 7): Customers, Products (with a Procurement view), Staff, Customer Accounts, Payments (with a Customer Credits section), Collections, Reports, and a Settings page that's explicit about which fields drive real calculations vs. are reserved for later — both built on Prisma models (`Fleet*`, `HirePurchase*`) that already existed in the schema before this rebuild. See `docs/AUTHENTICATION_AND_AUTHORIZATION.md` and `docs/MODULE_BOUNDARIES.md` for full detail.
- `prisma/schema.prisma` is untouched — Phase 7, like Phase 6, only wrote/updated *rows*, never the schema itself.

## Files changed (Phase 7 — Installment Management Migration)

**Created:**
- `src/modules/installment/service.ts` — the org-scoped service layer (largest in the codebase): settings, staff/customer/receipt code generation, product categories/products (with price-floor validation and default staff-inventory assignment), staff CRUD + salary history/payments, staff inventory consumption/restoration, customer CRUD, account creation (atomic inventory-gated), payment recording (allocation, overpayment credits, receipt numbering) and editing (3-hour window, full recalculation), credit resolution, the account lifecycle sweep + effective-status computation + closure refunds + reactivation, the procurement-readiness list, and three report aggregates.
- `src/modules/installment/dashboard-widget.tsx` — `InstallmentDashboardWidget`, registered in `dashboard-widgets.tsx`.
- Eight route trees under `src/app/app/installment/`: `products`, `staff`, `customers`, `accounts`, `payments`, `collections`, `reports`, `settings` — each with `page.tsx` and (except collections/reports, read-only) `actions.ts`.

**Rewritten:**
- `src/app/app/installment/page.tsx` — Installment Overview now shows real counts (customers, active accounts, products, outstanding balance) instead of a static `EmptyState`.

## Summary of what was done

User said "continue" then "get it started" after the Phase 5/6 report — explicit approval for Phase 7.

**Before writing any code**, spawned an Explore agent against the reference implementation (`C:\Users\andre\glv-management-system`) to extract its *actual* behavior rather than assume from its schema or settings UI. The critical finding, confirmed by GLV's own operator doc: several of its settings fields (commission, payroll day, administration fee, minimum deposit, `deliveryTimeAfterCompletionDays`-as-a-deadline) are stored and user-editable but **never read by any calculation** — dead configuration, not validated business rules. Some values that looked like real settings (`installmentDurationDays`, `refundDeductionPercent`) turned out to be hardcoded constants in GLV's actual code, with the settings field only used as a form default (or, for the refund rate, not read at all). This distinction shaped every subsequent design decision: only migrate what GLV *actually does*, not what its UI implies it does.

**Design decisions made deliberately better than GLV, not just copied:** where GLV hardcoded a rate that happened to match a settings field already in this schema (e.g. the 32% refund/reactivation service fee), this build reads the real setting instead of hardcoding — same validated number, genuinely configurable. Procurement threshold (70%) and the payment edit window (3 hours) were already live-read in GLV and are here too. `deliveryTimeAfterCompletionDays` governs the completed→archived transition here (GLV hardcoded that as a separate constant despite having the setting). The `OVERDUE` account status is deliberately never persisted — only computed at read time — resolving an inconsistency in GLV where `OVERDUE` appeared in a stored-status filter list that no write path there ever actually produces.

**Deliberately not migrated** (real GLV features, out of scope here as scope-control decisions, not oversights): the step-up re-authentication pattern (re-entering a password for sensitive mutations), fuzzy duplicate-detection on customer/product creation, and hard deletes for payments/accounts (GLV's admin-delete-with-strong-confirmation pattern). **Not migrated because GLV itself never implements it**, despite the schema/settings suggesting otherwise: commission calculation, payroll-day-triggered payroll runs, administration fee, minimum-deposit enforcement, and applying an `OPEN` credit to a future payment (the `APPLIED` status exists but is unreachable — in GLV and here).

**Staff scoping migrated as a real rule**: `resolveInstallmentStaffScope()` restricts a field-staff user (permissions but not `hirepurchase.staff.manage`) to their own assigned customers/accounts/payments/credits; a manager sees everyone's. GLV has this exact rule for its STAFF role.

**Verification surfaced pre-existing state worth flagging, not a bug**: the database already contained real Installment demo data (10 customers, 3 products, 7 accounts, 10 payments) — but among the 10 customers, 5 are named "Test Customer Playwright" and 1 "Debug Customer," clearly leftover test/debug artifacts from before this session (the other 4 have realistic Ghanaian names matching Fleet's demo data pattern). These were **not created or touched by this session** and were **left in place** rather than unilaterally deleted, since — unlike the throwaway records this agent creates and cleans up each session — this looked like pre-existing seed data of ambiguous intent. Flagged for the user to decide whether to clean up.

**Verification:** full validation suite (lint, `tsc --noEmit`, `prisma validate`, `prisma generate`, `npm run build`) passes clean — 44 routes (up from 36; eight new Installment sub-pages). Playwright installed **temporarily**, logged in as the Hire Purchase Manager (`hirepurchase@demo.com`, also the only real `HirePurchaseStaff` row, "Efua Darko"/`EFU`) and exercised the full lifecycle against real pre-existing data: recorded an overpayment against a real dormant-turned-active account (balance 360.00, paid 500.00) — confirmed the account correctly completed, a `140.00` `PAYMENT_OVERPAYMENT` credit was created, and it now shows a "Mark delivered" action; confirmed Collections' expected-vs-actual math and Reports' aggregate figures (expected receivables, total collected, open credits total of `200.00` — an exact match for the two real open credits summed) all computed correctly; confirmed the Settings page's wired/reserved split renders correctly. This real payment and its resulting credit were **left in place** afterward (a genuine, correctly-computed use of the feature, not test junk) — consistent with how Phase 3's password reset and Phase 6's payment-verify/work-and-pay actions were also left as real feature usage rather than reverted. Removed Playwright surgically via `npm uninstall playwright`, confirmed via `git diff --stat package.json package-lock.json` (no output); stopped this project's own dev-server processes afterward (confirmed by command-line inspection first).

Did **not** end-to-end test the field-staff ("own customers only") scoping path in the browser — no demo account exists with a non-manager Installment role today, only the Manager. The logic was reviewed carefully during design and exercises the same simple query-filter pattern already proven correct elsewhere in the codebase, but this specific path has not been exercised by an actual non-manager session.

## Build result

**Passed.** `npm run lint` clean, `npx tsc --noEmit` clean, `npx prisma validate`/`generate` succeed, `npm run build` succeeds — 44 routes (up from 36).

## Known issues / deliberate gaps

- **Pre-existing test-looking customer records** ("Test Customer Playwright" ×5, "Debug Customer" ×1, codes `CUST/EFU/26/005` through `010`) — predate this session, not cleaned up; flagged for the user to decide.
- **No commission, payroll-day, administration-fee, or minimum-deposit logic** — GLV itself never implements these despite having the settings fields; this build is upfront about the same gap on `/app/installment/settings` rather than inventing untested rules.
- **No credit-application feature** (`APPLIED` status unreachable) — GLV has no reference implementation for this either.
- **No step-up re-authentication for sensitive mutations, no fuzzy duplicate detection on create, no hard deletes** for payments/accounts/customers — all real GLV features, deferred here.
- **Field-staff "own customers only" scoping is unverified in the browser** — no non-manager Installment demo account exists yet.
- **No branch-level access enforcement** — unchanged from Phase 4/6.
- **No rate limiting, no public self-registration** — carried forward unchanged.
- **`RESEND_API_KEY` is unset** — emails still log via `console.warn` instead of delivering.
- **Organization switcher is real but functionally inert today** — unchanged, every demo user belongs to exactly one organization.

## Next recommended step

All seven originally-scoped phases are now complete. Get explicit direction on what's next — candidates per `docs/DEVELOPMENT_ROADMAP.md`'s "Later phases" section are billing/subscriptions (no `Subscription` model exists yet) or additional modules (CRM, Inventory, Accounting, HR, Payroll, Procurement, Projects, Analytics) — or address one of the known gaps above (e.g. cleaning up the pre-existing test customer records, or production-hardening items like rate limiting).

---

## Handoff log

### 2026-07-20 — Claude Code — Phase 7 (Installment Management Migration)

See "Files changed," "Summary," "Build result," "Known issues," and "Next recommended step" above — kept in the current-state sections rather than duplicated here, since this is the most recent entry.

### 2026-07-20 — Claude Code — Phase 5 (Module Framework) + Phase 6 (Fleet Management)

**Files changed:** Created `src/platform/modules/dashboard-widgets.tsx`, `src/modules/fleet/service.ts`, `src/modules/fleet/dashboard-widget.tsx`, `src/components/forms/entity-dialog.tsx`, and nine Fleet route trees (`vehicles`, `owners`, `drivers`, `maintenance`, `insurance-roadworthy`, `payments`, `work-and-pay`, `reports`, `settings`). Modified `src/types/module.ts` (`permissionPrefix`), `src/platform/modules/registry.ts`, `src/lib/auth/permissions.ts` (`canAccessModule` reads the registry), `src/app/app/(overview)/dashboard/page.tsx`, `src/app/app/fleet/page.tsx`.

**Summary:** Phase 5 consolidated the permission-prefix concept onto `ModuleDefinition` and added dashboard-widget registration. Phase 6 built Fleet Management completely on top of already-existing `Fleet*` Prisma models — discovered real pre-existing Fleet demo data with no UI ever built to show it. Designed permissions per page against the actual seeded `ROLE_PERMISSIONS`: viewing needs only module access, mutating needs that area's specific `.manage` permission, Reports gated separately on `.reports.view`. One real bug found via testing: the module-toggle `Switch` had no local state and mishandled rapid consecutive clicks — fixed with `useState`.

**Build result:** Passed. Lint/tsc/prisma/build all clean — 36 routes (up from 27).

**Known issues:** No owner-facing maintenance approval portal, no branch-level enforcement, no photo upload for maintenance. All either resolved or explicitly carried forward in the Phase 7 entry above.

**Next recommended step (at the time):** Get explicit approval before Phase 7 — which the user then gave ("continue" then "get it started"), leading directly into the work above.

### 2026-07-20 — Claude Code — Phase 4 (Platform Workspace)

**Files changed:** Created `src/lib/auth/permissions.ts`, `src/lib/tenant/actions.ts`, `src/components/navigation/organization-switcher.tsx`, `src/app/app/(overview)/administration/actions.ts`, `src/app/app/(overview)/notifications/actions.ts`, `src/app/app/platform/actions.ts`, `src/app/app/platform/organizations/module-toggle.tsx`. Rewrote `src/lib/tenant/index.ts` (added `enabledModuleKeys`/`memberships`, `active_org` cookie support), `src/platform/modules/workspace-navigation.tsx` (became `getWorkspaceNavigation(tenant)`), `src/components/layout/app-shell.tsx`/`module-launcher.tsx`, all four scope layouts (platform/fleet/installment/overview — each now guards access), and every Platform Workspace + Administration/Organization/Notifications page with real data.

**Summary:** Reconciled a real data drift found before writing any UI: the `Module` table had a legacy `layaway` code that didn't match the `installment` registry key, five modules mismarked `ACTIVE` with no real pages, three registry modules missing from the DB, and an orphaned `pos` row — all fixed with explicit user approval (direct DB writes are gated by the auto-mode permission classifier; the user added a scoped `Bash(node ./_*.mjs)` allow-rule to their own settings for this). Built the full authorization layer (`src/lib/auth/permissions.ts`): platform access gated on the literal "Super Admin" role name (not a permission, since Organization Owner holds every permission but must never reach Platform), module access gated on a permission *prefix* (not a single `.view` permission, to accommodate Investor's `fleet.investor.view` without `fleet.view`). Wired every Platform Workspace page to real data including a working invite-a-member flow and a live per-org module enable/disable toggle. One real bug found via testing: the module toggle `Switch` had no local state and mishandled rapid consecutive clicks — fixed with `useState`.

**Build result:** Passed. Lint/tsc/prisma/build all clean — 27 routes (unchanged count from Phase 3).

**Known issues:** No branch-level access enforcement, no action-level in-page permission checks (Fleet/Installment had no real pages yet), no rate limiting, organization switcher functionally inert (single-org demo data). All either resolved or explicitly carried forward in the Phase 5/6 entry above.

**Next recommended step (at the time):** Get explicit approval before Phase 5 — which the user then gave ("continue with phase 5 and 6"), leading directly into the work above.

### 2026-07-19 — Claude Code — Phase 3 (Authentication)

**Files changed:** Created `src/lib/db.ts` (Prisma singleton), `src/lib/auth/{nextauth.ts,next-auth.d.ts,session.ts,tokens.ts,actions.ts}`, `src/app/api/auth/[...nextauth]/route.ts`, `src/lib/tenant/index.ts` (first version), `src/app/app/{layout.tsx,page.tsx}`, `src/components/session-provider.tsx`, `src/lib/email.ts`, `src/app/(auth)/{reset-password,invite}/page.tsx`, `src/app/(public)/contact/actions.ts`. Rewrote `src/app/(auth)/login/page.tsx`, `src/app/(auth)/forgot-password/page.tsx`, `src/components/navigation/user-menu.tsx`.

**Summary:** Reconnected to the existing Neon database (no schema changes) and built NextAuth v4 credentials-based authentication with JWT sessions, replacing every placeholder from Phase 1/2: real login, real session data in `UserMenu`, real sign-out, and `/app/*` route protection where none existed before. Built password reset and invite acceptance on NextAuth's previously-unused `VerificationToken` model (single-use, prefixed identifiers, distinct TTLs). Wired the contact form to real email delivery (Resend) with graceful degradation. One real bug found via browser verification: Base UI requires `DropdownMenuLabel` inside a `<DropdownMenuGroup>` (unlike Radix) — fixed.

**Build result:** Passed. Lint/tsc/prisma/build all clean — 27 routes (up from 24).

**Known issues:** No admin-facing "send invite" UI, no permission/role enforcement beyond org membership, no rate limiting. All addressed or explicitly carried forward in the Phase 4 entry above.

**Next recommended step (at the time):** Get explicit approval before Phase 4 — which the user then gave ("start phase 4"), leading directly into the Phase 4 work above.

### 2026-07-19 — Claude Code — Phase 2 (Public Website + `/app` restructure)

**Files changed:** Moved (git history preserved) `src/app/(workspace)/(overview)/*` → `src/app/app/(overview)/*`, `src/app/(workspace)/fleet/*` → `src/app/app/fleet/*`, `src/app/(workspace)/installment/*` → `src/app/app/installment/*`, `src/app/(platform)/platform/*` + layout → `src/app/app/platform/*`; removed the now-empty `(workspace)`/`(platform)` folders. Created `src/app/(public)/{solutions,modules,industries,company,contact}/page.tsx`. Modified `public-header.tsx` (full nav), homepage CTAs, `logo.tsx` (optional `href`), `app-shell.tsx`, `user-menu.tsx` and dashboard links (`/app`-prefixed), all navigation configs and `registry.ts` (`/app`-prefixed hrefs), and `docs/{ARCHITECTURE,MODULE_BOUNDARIES,DEVELOPMENT_ROADMAP,AUTHENTICATION_AND_AUTHORIZATION}.md` + `README.md`.

**Summary:** Caught a real structural collision before writing any Phase 2 content: the planned public `/modules` marketing page would have collided with Phase 1's authenticated `/modules` module launcher at the identical bare URL. Fixed by moving every authenticated route under a literal `/app` URL segment before starting Phase 2 content. Directory-level renames failed with Windows "Permission denied" (likely an editor file-handle lock); worked around by moving files individually via `git mv`. Built five new marketing pages (Solutions, Modules, Industries, Company, Contact) with honestly-scoped copy — no fabricated metrics or claims. Found and fixed two real Server→Client prop-boundary bugs via browser verification (not caught by `tsc`/lint/build): the Contact page's `<Select>` showed a raw value instead of its label (Base UI doesn't auto-derive labels from `SelectItem` children like Radix does), and a first fix attempt (a `children` formatter function) produced an unrelated-looking error ("Encountered a script tag...") traced back to the same root cause as Phase 1's icon bug — a function crossing the Server→Client boundary. Fixed via `Select`'s `items` prop instead of a callback.

**Build result:** Passed. Lint/tsc/prisma/build all clean — 24 routes (up from 19).

**Known issues:** No database/auth/business logic yet (by design), contact form UI-only until Phase 3, no route guards yet. All resolved or superseded in the Phase 3 entry above.

**Next recommended step (at the time):** Get explicit approval before Phase 3 — which the user then gave ("continue"), leading directly into the Phase 3 work above.

### 2026-07-19 — Claude Code — Phase 1 (Foundation and Design System, clean rebuild)

**Objective:** Per an explicit, detailed rebuild instruction, retire the entire previous Rock Frost Business Suite implementation and rebuild Phase 1 (Foundation and Design System) from scratch, per the instruction's own safety rule and scope gate.

**Files changed:** Removed the entire previous `app/`, `components/`, `lib/` implementation (full history preserved, also snapshotted on branch `archive/pre-redesign-rfbs`) plus 5 unused create-next-app boilerplate icons and 3 now-broken seed scripts (archived, not deleted). Archived all previous docs under `docs/archive/previous-implementation/` with an OBSOLETE banner. Created the full `src/` foundation: root layout with ThemeProvider/TooltipProvider/Toaster, `(public)` homepage, `(auth)` login/forgot-password (UI only), `(workspace)`/`(platform)` route groups (later restructured under `/app` in Phase 2 — see above), 24 shadcn/ui components, `AppShell`/navigation/`EmptyState` components, the module registry and type system. New authoritative docs: `DECISIONS.md`, `PRODUCT_VISION.md`, `ARCHITECTURE.md`, `MODULE_BOUNDARIES.md`, `DESIGN_SYSTEM.md`, `DEVELOPMENT_ROADMAP.md`, `DATABASE_STRATEGY.md`, `AUTHENTICATION_AND_AUTHORIZATION.md`, `TESTING_STRATEGY.md`.

**Summary:** Root cause of the rebuild: the previous implementation had no enforced module-boundary concept — Fleet and Installment navigation/dashboard chrome bled into each other (a hardcoded "Fleet Operations" / "Rock Frost Fleet Control" heading rendered on every page regardless of module, a flat unsectioned sidebar). Backed up first (branch + push + private env-var/asset migration note) per the instruction's safety rule, then rebuilt with module isolation as a structural property: each module gets its own nested route-group `layout.tsx` rendering a shared `AppShell` with its own navigation array — no shared conditional-sidebar logic that could drift. Chose shadcn/ui on Base UI primitives (documented in `DECISIONS.md`); got the `asChild`-vs-`render` prop distinction wrong initially (Base UI, not Radix), which produced two real bugs caught only by actually building and running the app: a hard build failure from passing Lucide icon component references as props across a Server→Client boundary (fixed by pre-rendering icons as JSX elements instead), and a Base UI accessibility warning on `Button`s rendered as `Link`s (fixed with `nativeButton={false}`).

**Build result:** Passed. Lint/tsc/prisma/build all clean — 19 static routes. Verified visually in a real browser (Playwright, temporary) with zero console errors across every route plus the module-launcher dialog.

**Known issues:** See Phase 2 entry above — the "no database/auth/business-logic yet" and "form component not added" gaps carried forward unchanged into Phase 2 and are documented there.

**Next recommended step (at the time):** Report per the instruction's required final-report format and get explicit approval before continuing — which the user then gave ("proceed to the next phase"), leading directly into the Phase 2 work above.
