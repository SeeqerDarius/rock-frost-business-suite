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

**Phase 4 (Platform Workspace) — complete.** See `docs/DEVELOPMENT_ROADMAP.md` for what comes next (Phase 5: Module Framework, gated pending approval).

## Current architecture (short version — see `docs/ARCHITECTURE.md` for full detail)

- Next.js 16 App Router under `src/app/`. Public marketing site at bare paths (`/`, `/solutions`, `/modules`, `/industries`, `/company`, `/contact`) via the `(public)` route group; auth UI (`/login`, `/forgot-password`, `/reset-password`, `/invite`) via `(auth)`; **everything requiring sign-in lives under `/app/*`** — `app/(overview)` (organization scope: `/app/dashboard`, `/app/modules`, etc.), `app/fleet`, `app/installment`, `app/platform` (platform scope). See `docs/ARCHITECTURE.md`'s "Why /app exists."
- Each module (`fleet`, `installment`) has its own `layout.tsx` rendering the shared `AppShell` component with its own navigation array — module isolation enforced structurally, not conditionally. Both layouts now also guard on `canAccessModule()` (module enabled for the org + a permission under that module's prefix).
- `src/platform/modules/registry.ts` is the single source of truth for every module's metadata (name/icon/routePrefix/nav); real per-organization enablement now lives in the database (`Module`/`OrganizationModule`) and is joined in via `tenant.enabledModuleKeys`.
- shadcn/ui (Base UI primitives, not Radix) + Tailwind v4 design system — see `docs/DESIGN_SYSTEM.md`.
- **Real authentication + real authorization.** NextAuth v4 credentials/JWT sessions (Phase 3) plus, as of this phase, real role/permission/module-based access control everywhere: `/app/platform/*` restricted to the "Super Admin" role, `/app/administration`+`/app/organization` restricted to `org.settings.manage`, Fleet/Installment restricted to module-enabled + a permission under that module's prefix. See `docs/AUTHENTICATION_AND_AUTHORIZATION.md` for full detail.
- **Fleet and Installment modules are still empty `EmptyState` shells** past their own gated layout — no real business logic yet. That's Phase 6/7 scope, unaffected by this phase.
- `prisma/schema.prisma` is untouched — this phase only wrote/updated *rows* (module reconciliation, enablement, invites, audit logs), never the schema itself.

## Files changed (Phase 4 — Platform Workspace)

**Created:**
- `src/lib/auth/permissions.ts` — `PERMISSIONS` constants (22 keys, mirroring the archived `lib/permissions/constants.ts`), `hasPermission()`, `canAccessModule()` (module-enabled + permission-prefix check), `isPlatformOperator()` (role-name check).
- `src/lib/tenant/actions.ts` — `switchOrganization` server action (sets the `active_org` cookie after verifying real membership).
- `src/components/navigation/organization-switcher.tsx` — client dropdown (renders a plain label instead of a fake single-item dropdown when the user belongs to only one organization, which is every demo user today).
- `src/app/app/(overview)/administration/actions.ts` — `inviteMember` server action (creates `User`+`OrganizationMember` in `INVITED` status, issues a Phase 3 invite token, sends the email, logs an `AuditLog` row, all in one transaction). "Super Admin" is excluded from the invitable-role list.
- `src/app/app/(overview)/notifications/actions.ts` — `markNotificationRead`, `markAllNotificationsRead`.
- `src/app/app/platform/actions.ts` — `toggleOrganizationModule` (Super-Admin-only, upserts `OrganizationModule.enabled`, logs an `AuditLog` row).
- `src/app/app/platform/organizations/module-toggle.tsx` — client `Switch` wrapper with local optimistic state (see bug note below).

**Rewritten:**
- `src/lib/tenant/index.ts` — `TenantContext` gained `enabledModuleKeys: string[]` and `memberships: {...}[]`; `getCurrentTenant()` now honors an `active_org` cookie override (validated against real membership) and reads `role`/`permissions` fresh from the DB each call instead of from the JWT.
- `src/platform/modules/workspace-navigation.tsx` — `workspaceNavigation` array became `getWorkspaceNavigation(tenant)`, filtering Administration/Organization by `org.settings.manage`.
- `src/components/layout/app-shell.tsx`, `src/components/navigation/module-launcher.tsx` — accept `enabledModuleKeys`/`organization` props; module launcher now renders three real states (open / not enabled for your org / coming soon).
- `src/app/app/(overview)/layout.tsx`, `src/app/app/platform/layout.tsx`, `src/app/app/fleet/layout.tsx`, `src/app/app/installment/layout.tsx` — each now fetches the tenant and enforces its own access guard (platform: Super Admin only; fleet/installment: `canAccessModule()`), rendering an `EmptyState`-based access-denied message rather than redirecting, and passes `enabledModuleKeys`/`organization` into `AppShell`.
- `src/app/app/(overview)/{dashboard,modules,organization,administration,notifications}/page.tsx`, `src/app/app/platform/{dashboard,organizations,modules,activity}/page.tsx` — every one replaced with real database-backed content (see Summary below).

**Modified:**
- `src/app/app/(overview)/account/page.tsx` — corrected stale "alongside authentication" placeholder copy (out of scope this phase; still a real placeholder).
- `docs/DEVELOPMENT_ROADMAP.md`, `docs/AUTHENTICATION_AND_AUTHORIZATION.md` — Phase 4 marked complete; Authorization section rewritten from "planned" to "real," with the exact enforcement points.

## Summary of what was done

User said "start phase 4" after approving the Phase 3 report. Per `docs/DEVELOPMENT_ROADMAP.md`, that's Phase 4 (Platform Workspace).

**Data reconciliation performed first** (with explicit user approval, since direct database writes are gated by the auto-mode permission classifier — the user added a scoped allow-rule, `Bash(node ./_*.mjs)`, to their own `~/.claude/settings.json` for this): the `Module` table had drifted from the code registry — a legacy `layaway` code that didn't match the `installment` key used everywhere else, five modules (`crm`/`inventory`/`accounting`/`hr`/`payroll`) marked `ACTIVE` despite having no real pages, three registry modules (`procurement`/`projects`/`analytics`) missing entirely, and an orphaned `pos` module row with no registry counterpart or product-doc mention. Fixed all of it: renamed `layaway`→`installment`, corrected every module's `status` to match reality, added the three missing rows, deleted the unreferenced `pos` row, and enabled `installment` for the demo organization (previously only `fleet` was enabled, despite `hirepurchase@demo.com` clearly expecting Installment access).

Built the full authorization layer: `src/lib/auth/permissions.ts` centralizes all 22 permission keys and three access-check helpers. Platform access is gated on the literal "Super Admin" role name rather than a permission, specifically because Organization Owner holds every permission a tenant can have and must never reach `/app/platform/*`. Module access (`canAccessModule`) is gated on a permission *prefix* rather than a single `.view` permission, specifically to accommodate the Investor role, which holds `fleet.investor.view`/`fleet.reports.view` but not `fleet.view` — a single-permission check would have incorrectly locked Investor out of Fleet entirely.

Wired every Platform Workspace page to real data: Organization (profile + branches), Administration (member table + working invite-a-member form, reusing Phase 3's token/email infrastructure), Notifications (real `Notification` rows with mark-read actions — this surfaced pre-existing "Welcome back" sign-in notifications that had never been displayed before, confirming the query works against real historical data, not just newly-created rows), the module launcher and `/app/modules` (three real states), the dashboard (enabled-module summary cards), and all four Platform Administration pages (`dashboard` aggregate stats, `organizations` with a live per-module enable/disable toggle, `modules` with real adoption counts, `activity` reading real `AuditLog` rows). Deliberately left `subscriptions` as a placeholder — no `Subscription`/billing model exists in the schema yet, and inventing one wasn't in scope.

**One real bug found via browser verification, not caught by `tsc`/lint/build:** the platform organizations page's module-enable `Switch` was fully controlled by a server-rendered `enabled` prop with no local state. A single click worked, but a second click in the same page view (without a full navigation) re-derived its toggle direction from the stale original prop instead of the just-clicked state — so two rapid clicks could both send the same direction instead of alternating. Fixed by giving `ModuleToggle` its own `useState` seeded from the prop, updated optimistically on click; re-verified with three rapid consecutive clicks producing three correctly-alternating, correctly-ordered `AuditLog` entries.

**Verification:** full validation suite (lint, `tsc --noEmit`, `prisma validate`, `prisma generate`, `npm run build`) passes clean — 27 routes (unchanged count; this phase only changed page/layout logic, not the route tree). Playwright installed **temporarily**, drove the full RBAC matrix across four real demo accounts (Super Admin, Organization Owner, Fleet Manager, Hire Purchase Manager) against five protected routes (`/app/platform/dashboard`, `/app/administration`, `/app/organization`, `/app/fleet`, `/app/installment`) — every single one of the 20 checks matched the intended access matrix exactly, including Organization Owner being correctly denied Platform despite holding every other permission, and Fleet Manager/Hire Purchase Manager each being confined to their own module. Also drove the invite flow end-to-end (real `User`+`OrganizationMember` rows created, then cleaned up afterward) and the module-toggle bug fix above. Removed Playwright surgically via `npm uninstall playwright` afterward, confirmed via `git diff --stat package.json package-lock.json` (no output) that nothing else was touched. Also had to stop several lingering `next dev` processes from an earlier verification pass that were holding a file lock on the Prisma query engine DLL, blocking `prisma generate` — confirmed via process command-line inspection that only this project's own dev-server processes were involved before stopping any of them (the user's own real Chrome browser windows were briefly considered and correctly ruled out as unrelated).

**Known-credentials note:** `owner@demo.com` and `fleet@demo.com` had no recoverable passwords (bcrypt hashes with no plaintext anywhere in the repo), so test passwords were set directly for RBAC verification: `owner@demo.com` → `OwnerTest@2026!`, `fleet@demo.com` → `FleetTest@2026!`. These are now the real passwords for those two demo accounts going forward.

## Build result

**Passed.** `npm run lint` clean, `npx tsc --noEmit` clean, `npx prisma validate`/`generate` succeed, `npm run build` succeeds — 27 routes, same shape as Phase 3 (this phase changed behavior inside existing routes, not the route tree itself).

## Known issues / deliberate gaps

- **No branch-level access enforcement** — `Branch` exists in the schema and is shown read-only on the Organization page, but nothing gates access by branch yet. Revisit per-module during Phase 6/7.
- **No action-level (in-page) permission checks** — e.g. `fleet.vehicles.manage` vs `fleet.vehicles.view` on a single page. Moot until Fleet/Installment have real pages (Phase 6/7).
- **No rate limiting or account lockout on failed logins** — carried forward unchanged, still not addressed.
- **No public self-registration/signup flow** — the new invite UI covers admin-initiated onboarding only.
- **`RESEND_API_KEY` is unset** — reset/invite/contact/notification emails log via `console.warn` instead of delivering. No code changes needed to enable delivery, just the env var.
- **Organization switcher is real but functionally inert today** — every demo user belongs to exactly one organization, so it renders as a plain label. The switching mechanism (cookie + membership validation) is fully built and will activate the moment any user has a second `OrganizationMember` row.
- **Fleet and Installment are still empty shells** — unaffected by this phase, still Phase 6/7 scope.

## Next recommended step

Get explicit approval before starting Phase 5 (Module Framework) — same operating rule as before.

---

## Handoff log

### 2026-07-20 — Claude Code — Phase 4 (Platform Workspace)

See "Files changed," "Summary," "Build result," "Known issues," and "Next recommended step" above — kept in the current-state sections rather than duplicated here, since this is the most recent entry.

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
