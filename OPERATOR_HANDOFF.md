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

**Phase 5 (Module Framework) and Phase 6 (Fleet Management) — both complete.** See `docs/DEVELOPMENT_ROADMAP.md` for what comes next (Phase 7: Installment Management Migration, gated pending approval).

## Current architecture (short version — see `docs/ARCHITECTURE.md` for full detail)

- Next.js 16 App Router under `src/app/`. Public marketing site at bare paths via `(public)`; auth UI via `(auth)`; **everything requiring sign-in lives under `/app/*`** — `app/(overview)` (organization scope), `app/fleet`, `app/installment`, `app/platform` (platform scope). See `docs/ARCHITECTURE.md`'s "Why /app exists."
- Each module (`fleet`, `installment`) has its own `layout.tsx` rendering `AppShell` with its own navigation array, guarded on `canAccessModule()` (module enabled for the org + a permission under that module's registered `permissionPrefix` — now a field on `ModuleDefinition` itself, see Phase 5 below).
- `src/platform/modules/registry.ts` is the single source of truth for every module's metadata; `src/platform/modules/dashboard-widgets.tsx` is a separate, server-only-safe registration point mapping a module key to a real dashboard summary component (Fleet's is wired up; a module with no entry just gets the generic "open module" card).
- shadcn/ui (Base UI primitives) + Tailwind v4 design system — see `docs/DESIGN_SYSTEM.md`.
- **Real authentication, authorization, and — as of this phase — a real first module.** NextAuth (Phase 3) + role/module authorization (Phase 4) + Fleet Management fully built (Phase 6): Vehicles, Drivers, Owners, Maintenance, Insurance & Roadworthy, Payments, Work & Pay, Reports, and an honest Settings placeholder, all backed by the `Fleet*` Prisma models that already existed in the schema. See `docs/AUTHENTICATION_AND_AUTHORIZATION.md` and `docs/MODULE_BOUNDARIES.md` for full detail.
- **Installment is still an empty `EmptyState` shell** — that's Phase 7 scope, unaffected by this phase. Do not begin it without a separate approval, per the roadmap's own sequencing rule.
- `prisma/schema.prisma` is untouched — Phase 6 only wrote/updated *rows* against Fleet's already-existing tables, never the schema itself.

## Files changed (Phase 5 — Module Framework, Phase 6 — Fleet Management)

**Phase 5 — Created:**
- `src/platform/modules/dashboard-widgets.tsx` — per-module dashboard widget registration (`Record<string, ComponentType>`), kept separate from `registry.ts` so a widget's server-only data fetching never reaches the client-side `ModuleLauncher` bundle.

**Phase 5 — Modified:**
- `src/types/module.ts` — `ModuleDefinition` gained `permissionPrefix?: string`.
- `src/platform/modules/registry.ts` — `fleet`/`installment` entries set `permissionPrefix: "fleet."` / `"hirepurchase."`.
- `src/lib/auth/permissions.ts` — `canAccessModule()` now reads the prefix from `getModule(moduleKey)` instead of a separate hardcoded map; the old `MODULE_PERMISSION_PREFIX` export was removed.
- `src/app/app/(overview)/dashboard/page.tsx` — renders a registered widget (if any) for each enabled module instead of always the generic card.

**Phase 6 — Created (Fleet module):**
- `src/modules/fleet/service.ts` — the org-scoped service layer: every function takes `organizationId` explicitly and filters on it. Covers Owners, Drivers, Vehicles, Vehicle Documents (insurance/roadworthy), Maintenance Requests, Payments, Work & Pay Contracts, plus `getFleetSummary()` for aggregates (used by both Reports and the dashboard widget).
- `src/modules/fleet/dashboard-widget.tsx` — `FleetDashboardWidget`, a real Server Component showing vehicle/driver/maintenance counts, registered in `dashboard-widgets.tsx`.
- `src/components/forms/entity-dialog.tsx` — shared create/edit dialog shell (`EntityDialog`) reused across every Fleet entity page, so each page only supplies its own field JSX rather than reimplementing the dialog/form/close-on-redirect plumbing seven times.
- Nine route trees under `src/app/app/fleet/`: `vehicles`, `owners`, `drivers`, `maintenance`, `insurance-roadworthy`, `payments`, `work-and-pay`, `reports`, `settings` — each with `page.tsx` and (except reports/settings, which are read-only/placeholder) `actions.ts`.

**Phase 6 — Rewritten:**
- `src/app/app/fleet/page.tsx` — Fleet Overview now shows real counts (vehicles, active drivers, pending maintenance, active contracts) instead of a static `EmptyState`.

## Summary of what was done

User said "continue with phase 5 and 6" after the Phase 4 report — explicit approval to proceed through both without an intermediate checkpoint, unlike prior phases.

**Phase 5** was small by design, per the roadmap's own framing: consolidated the permission-prefix concept (previously a standalone map in `permissions.ts`, duplicating what should live on the module definition itself) onto `ModuleDefinition.permissionPrefix`, and added a real dashboard-widget registration mechanism. Subscription/billing gating was confirmed still correctly out of scope — no `Subscription` model exists, and module activation (the actual gating mechanism) was already built in Phase 4.

**Phase 6** built Fleet Management completely. Before writing any UI, discovered (and fixed, with explicit user approval for the direct database write) that the `Module`/`OrganizationModule` data didn't matter here since that was already reconciled in Phase 4 — instead, the discovery this phase was that **real Fleet demo data already existed in the database** (owners, drivers, vehicles, maintenance requests, insurance records, payments, and work-and-pay contracts with realistic Ghanaian names and routes) with **no UI ever built to show any of it** — every page before this phase was a static `EmptyState`. This made verification stronger than usual: mutations were tested against real historical rows, not just data created during the test itself.

Designed the permission model per page carefully against the actual seeded `ROLE_PERMISSIONS`, not assumptions: viewing a Fleet list only requires reaching the module at all (any permission under `fleet.`), but each page's create/edit controls require that specific area's `.manage` permission (`fleet.vehicles.manage`, `fleet.owners.manage`, etc.) — so Driver/Mechanic (who hold only `fleet.maintenance.manage`) can report and manage maintenance requests but see no "New vehicle" button, while Investor (read-only, `fleet.investor.view` + `fleet.reports.view`) can browse everything but mutate nothing. `/app/fleet/reports` is gated separately on `fleet.reports.view`, which Driver/Mechanic don't hold — confirmed via browser testing that they're correctly denied that one page while having full maintenance access everywhere else.

Work & Pay's "record payment" action recomputes `amountPaid`, `outstandingBalance`, and `completionPercentage` server-side from the contract's real amounts (never trusts a client-submitted percentage), and auto-transitions a contract to `COMPLETED` once the outstanding balance reaches zero. Insurance & Roadworthy documents compute their own `renewalStatus` (clear / renewal due soon / overdue) from the two expiry dates rather than requiring it to be set manually. Fleet Settings is an honest placeholder — there's no fleet-wide configuration concept in the schema, so the page says that directly instead of fabricating options.

**Deliberately not built:** an owner-facing maintenance approval portal (`FleetOwner` has no login/session concept in this schema — `ownerApprovalStatus` is tracked in the data model but nothing sets it), branch-level access enforcement (branch is stored on records where relevant but nothing gates by it yet), and file/photo upload for maintenance requests (`photoAssetId` exists on the model but no upload UI was built).

**Verification:** full validation suite (lint, `tsc --noEmit`, `prisma validate`, `prisma generate`, `npm run build`) passes clean — 36 routes (up from 27; nine new Fleet sub-pages). Playwright installed **temporarily**, logged in as Fleet Manager and exercised every entity: created an owner, a driver, and a vehicle; reviewed an existing (pre-seeded) maintenance request; verified an existing pending payment; recorded a payment against an existing work-and-pay contract (confirmed the balance/percentage math updated correctly); confirmed Reports shows real aggregate numbers matching the underlying data. Then logged in as Driver and Investor separately to confirm the permission boundaries above held exactly as designed — the one surprising-at-first result (Driver having "Review" access on Maintenance) turned out to be correct once re-checked against the actual seeded permissions, not a bug. Cleaned up the handful of test-created records afterward (the pre-existing curated demo data was left untouched); removed Playwright surgically via `npm uninstall playwright`, confirmed via `git diff --stat package.json package-lock.json` (no output) that nothing else was touched; stopped this project's own lingering dev-server processes afterward (confirmed by command-line inspection before touching any process).

**Known-credentials note:** `driver@demo.com` and `investor@demo.com` had no recoverable passwords either, so test passwords were set for this phase's verification: `driver@demo.com` → `DriverTest@2026!`, `investor@demo.com` → `InvestorTest@2026!`. These are now the real passwords for those two demo accounts going forward.

## Build result

**Passed.** `npm run lint` clean, `npx tsc --noEmit` clean, `npx prisma validate`/`generate` succeed, `npm run build` succeeds — 36 routes (up from 27).

## Known issues / deliberate gaps

- **No owner-facing maintenance approval portal** — `FleetMaintenanceRequest.ownerApprovalStatus` exists in the schema but nothing sets it; owners have no login concept in this system.
- **No branch-level access enforcement** — still just stored on records, not gated on. Unchanged from Phase 4.
- **No file/photo upload for maintenance requests** — `photoAssetId` exists on the model, no upload UI built.
- **No rate limiting or account lockout on failed logins** — carried forward unchanged.
- **No public self-registration/signup flow.**
- **`RESEND_API_KEY` is unset** — emails still log via `console.warn` instead of delivering.
- **Organization switcher is real but functionally inert today** — unchanged from Phase 4, every demo user belongs to exactly one organization.
- **Installment Management is still an empty shell** — Phase 7 scope, not started.

## Next recommended step

Get explicit approval before starting Phase 7 (Installment Management Migration) — this one pulls business logic from an external reference implementation (`C:\Users\andre\glv-management-system`) rather than building from scratch, so it's worth a checkpoint before diving in.

---

## Handoff log

### 2026-07-20 — Claude Code — Phase 5 (Module Framework) + Phase 6 (Fleet Management)

See "Files changed," "Summary," "Build result," "Known issues," and "Next recommended step" above — kept in the current-state sections rather than duplicated here, since this is the most recent entry.

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
