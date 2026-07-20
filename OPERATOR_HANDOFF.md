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

**Phase 9 (Inventory) — complete.** All nine original phases plus two remediation passes are done. See `docs/DEVELOPMENT_ROADMAP.md` for what comes next — the next module to build has **not yet been chosen** (candidates: Accounting, HR/Payroll, Procurement, Projects, Analytics); Billing/Subscriptions remains deliberately scheduled last, per explicit user direction.

## Current architecture (short version — see `docs/ARCHITECTURE.md` for full detail)

- Next.js 16 App Router under `src/app/`. Public marketing site at bare paths via `(public)`; auth UI via `(auth)`; **everything requiring sign-in lives under `/app/*`** — `app/(overview)` (organization scope), `app/fleet`, `app/installment`, `app/crm`, `app/inventory`, `app/platform` (platform scope). See `docs/ARCHITECTURE.md`'s "Why /app exists."
- Each module (`fleet`, `installment`, `crm`, `inventory`) has its own `layout.tsx` rendering `AppShell` with its own navigation array, guarded on `canAccessModule()` (module enabled for the org + a permission under that module's registered `permissionPrefix`).
- `src/platform/modules/registry.ts` is the single source of truth for every module's metadata; `src/platform/modules/dashboard-widgets.tsx` maps a module key to a real dashboard summary component — Fleet's, Installment's, CRM's, and Inventory's are all wired up now.
- shadcn/ui (Base UI primitives) + Tailwind v4 design system — see `docs/DESIGN_SYSTEM.md`.
- **All four business modules are fully real.** Fleet Management (Phase 6), Installment Management (Phase 7), CRM (Phase 8), and Inventory Management (Phase 9) are all complete. See `docs/AUTHENTICATION_AND_AUTHORIZATION.md` and `docs/MODULE_BOUNDARIES.md` for full detail.
- **Every mutating Server Action that redirects to a list page calls `revalidatePath()` on that page immediately before the `redirect()`** — a systemic gap discovered and fixed during Phase 8 across every action file that existed at the time; Inventory's action files were written with this pattern from the start. This is the required pattern for any new Server Action, not an optional optimization.
- `prisma/schema.prisma` changes since Phase 3's reconnection: `User.failedLoginAttempts`/`User.lockedUntil` (migration `20260720120000_add_login_lockout`); the CRM models `CrmLeadSource`/`CrmContact`/`CrmLead`/`CrmDeal`/`CrmActivity` (migration `20260720140000_add_crm_module`); the Inventory models `InventoryCategory`/`InventoryWarehouse`/`InventoryItem`/`InventoryStock`/`InventoryMovement` (migration `20260720160000_add_inventory_module`). All three applied via `prisma migrate deploy` — **not** `prisma migrate dev`, which detects a pre-existing drift between the live database's migration history and the local `prisma/migrations/` folder (leftover from before this rebuild) and offers to reset the entire database. That offer was declined every time; `migrate deploy` applied each migration cleanly without touching anything else. Anyone continuing this project should use `migrate deploy` (or hand-write the migration SQL and apply it that way) rather than `migrate dev` against this specific database.

## Files changed (Phase 9 — Inventory Management)

**Created:** `prisma/migrations/20260720160000_add_inventory_module/migration.sql`; `src/modules/inventory/{service.ts,navigation.tsx,dashboard-widget.tsx}`; `src/app/app/inventory/layout.tsx`, `src/app/app/inventory/page.tsx`, and six route trees (`items`, `warehouses`, `stock`, `movements`, `reports`, `settings`) — `stock` is read-only (no `actions.ts`), the other five each have `page.tsx` + `actions.ts`.

**Modified:** `prisma/schema.prisma` (Inventory models + back-relations on `User`/`Organization`/`Branch`); `src/lib/auth/permissions.ts` (6 new `INVENTORY_*` keys); `src/platform/modules/registry.ts` (`inventory` flipped from `coming-soon` to `available`); `src/platform/modules/dashboard-widgets.tsx` (Inventory widget registered).

**Database (via one-off scripts, not committed):** seeded 6 `Permission` rows for `inventory.*`, granted them to Super Admin/Organization Owner, created the "Inventory Manager" system role, enabled the `inventory` module for the demo organization (`Rock Frost Demo Fleet`, tenant code `rock-frost-demo-fleet` — note this is *not* `demo`, worth remembering if a future script needs to target it directly).

## Summary of what was done (Phase 9 — Inventory Management)

User chose "Inventory" as the next module after CRM (via an AskUserQuestion offering Inventory / Accounting / HR-Payroll). Like CRM, no inventory-shaped models existed in the schema (Installment's `HirePurchaseStaffInventory` is a narrow per-staff-member unit counter, not a general warehouse/stock system, so it wasn't reused). Designed five new models from scratch — `InventoryCategory`, `InventoryWarehouse`, `InventoryItem`, `InventoryStock` (a per item×warehouse quantity row), and `InventoryMovement` (an audit-trail row for every receipt/issue/adjustment/transfer) — migrated via the established safe `migrate diff` + manual migration folder + `migrate deploy` workflow (confirmed purely additive).

The one function with real logic, `recordMovement()`, runs the stock-quantity update and the audit-trail row inside a single `db.$transaction`: `RECEIPT` adds to one warehouse, `ISSUE` subtracts (rejecting if insufficient), `ADJUSTMENT` applies a signed delta (rejecting if it would go negative), and `TRANSFER` subtracts from a source warehouse and adds to a distinct destination warehouse in the same transaction (rejecting insufficient stock or a same-warehouse transfer). Built all six pages (Items, Warehouses, Stock, Movements, Reports, Settings) plus an overview page and dashboard widget, following the exact pattern established by Fleet/Installment/CRM. Every action file was written with the `revalidatePath()`-before-`redirect()` pattern from the start — no repeat of Phase 8's discovery needed.

**Verified with real arithmetic, not just "no error thrown"**: created a test item (cost price 10.50, reorder point 5) and two warehouses, then ran a full receipt → transfer → issue → adjustment sequence via Playwright, confirming exact quantities at every step — 20 received into Warehouse A, correctly 12/8 after an 8-unit transfer to Warehouse B, correctly 5 in B after a 3-unit issue, correctly 10 in A after a −2 adjustment — and confirmed a subsequent over-large issue (999 units) was rejected with `error=insufficient-stock` and left stock unchanged. Reports page correctly computed total stock value as 157.50 (15 total units × 10.50) and correctly showed zero low-stock items (15 > reorder point of 5). All test fixtures (item, both warehouses, two lead — categories) deleted afterward via a one-off cleanup script.

## Build result (Phase 9 — Inventory Management)

**Passed.** `npm run lint` clean, `npx tsc --noEmit` clean, `npx prisma validate` succeeds, `npm run build` succeeds — 58 routes (up from 51; 7 new Inventory routes). Playwright installed **temporarily** for browser verification, then removed surgically via `npm uninstall playwright` (confirmed via `git diff --stat package.json package-lock.json`, no output). Dev server stopped afterward, confirmed by command-line inspection first.

## Known issues / deliberate gaps (current)

- **Inventory has no data-level scoping** (same shape as CRM's gap) — every item/warehouse/movement is visible to anyone holding the relevant `inventory.*` permission, no per-warehouse or per-owner restriction.
- **Inventory is not yet linked to any other module** — Fleet parts/maintenance and Installment products remain on their own separate stock concepts (`HirePurchaseStaffInventory`) rather than drawing from the new general Inventory module. Integrating them is a deliberate future decision, not an oversight — see `docs/MODULE_BOUNDARIES.md`'s cross-module data rule (any such integration needs to be recorded in `docs/DECISIONS.md`, not silently added).
- **CRM has no data-level scoping** analogous to Installment's field-staff restriction — every contact/lead/deal/activity is visible to anyone holding the relevant `crm.*` permission, with no per-owner restriction. Revisit if a CRM role narrower than "sees everything the org has" is ever needed.
- **No owner-facing maintenance approval portal** (Fleet) — would need a whole new authenticated user type.
- **No file/photo upload for maintenance requests** (Fleet) — needs a storage-provider decision first.
- **No fuzzy duplicate-detection on customer/product/contact/item creation, no hard deletes** for payments/accounts/customers — deliberately deferred.
- **No branch-level access enforcement** — still low-value with one branch platform-wide.
- **No public self-registration** — deliberate for an invite-only B2B platform.
- **`RESEND_API_KEY` is unset** — emails still log via `console.warn` instead of delivering.
- **Organization switcher is real but functionally inert today** — every demo user belongs to exactly one organization.

## Next recommended step

Get explicit direction on which module follows Inventory — candidates per `docs/DEVELOPMENT_ROADMAP.md`'s "Later phases" section are Accounting, HR/Payroll, Procurement, Projects, or Analytics. Billing/Subscriptions remains deliberately scheduled last, per the user's own standing instruction, regardless of which of the others comes next.

---

## Files changed (Phase 8 + revalidatePath fix)

**Created:** `prisma/migrations/20260720140000_add_crm_module/migration.sql`; `src/modules/crm/{service.ts,navigation.tsx,dashboard-widget.tsx}`; `src/app/app/crm/layout.tsx`, `src/app/app/crm/page.tsx`, and six route trees (`contacts`, `leads`, `deals`, `activities`, `reports`, `settings`), each with `page.tsx` + `actions.ts`.

**Modified:** `prisma/schema.prisma` (CRM models + back-relations on `User`/`Organization`/`Branch`); `src/lib/auth/permissions.ts` (6 new `CRM_*` keys); `src/platform/modules/registry.ts` (`crm` flipped from `coming-soon` to `available`); `src/platform/modules/dashboard-widgets.tsx` (CRM widget registered); all 18 mutating action files across Fleet (`vehicles`, `owners`, `drivers`, `maintenance`, `insurance-roadworthy`, `payments`, `work-and-pay`), Installment (`customers`, `products`, `staff`, `accounts`, `payments`, `settings`), and CRM (`contacts`, `leads`, `deals`, `activities`, `settings`) — each gained a `revalidatePath()` call before every `redirect()` to a list page.

**Database (via one-off scripts, not committed):** seeded 6 `Permission` rows for `crm.*`, granted them to Super Admin/Organization Owner, created the "CRM Manager" system role, enabled the `crm` module for the demo organization.

## Files changed (post-Phase-7 gap-fixing pass)

**Created:**
- `prisma/migrations/20260720120000_add_login_lockout/migration.sql` — adds the two `User` columns above.
- `src/lib/auth/verify-password.ts` — `verifyCurrentPassword()`, step-up re-authentication helper (bcrypt-compares a re-entered password against the acting user's own hash).

**Modified:**
- `src/lib/auth/nextauth.ts` — `authorize()` checks `lockedUntil`, increments `failedLoginAttempts` on a wrong password, locks for 15 minutes after 5 failures, resets both on success.
- `src/lib/auth/actions.ts` — added `getAccountLockStatus(email)`, a pre-check the login page calls *before* `signIn()` (see the NextAuth gotcha below).
- `src/app/(auth)/login/page.tsx` — calls the pre-check first; shows "Too many failed attempts" only when it reports locked, otherwise the existing generic invalid-credentials message.
- `src/modules/installment/service.ts` — `getStaffPerformanceReport` now computes `commissionEarned` (from `commissionEnabled`/`commissionPercentage`) and folds it into `netPosition`; `createAccount` now applies `administrationFeePercent` as a one-time fee added to `targetAmount` and enforces `minimumDeposit` via an optional `initialDeposit` (recorded as a real first payment in the same transaction); `getInstallmentSummary` now returns `nextPayrollDate`/`daysUntilPayroll` from `payrollDay`; added `applyCreditToAccount()` (new — GLV has no reference implementation for this) and `MinimumDepositError`/`CreditNotApplicableError`.
- `src/app/app/installment/{products,staff,accounts,payments,reports,settings}/page.tsx` and their `actions.ts` — wired the above into the UI; Settings dropped its "reserved for future use" section since every field is now either wired to a calculation or a genuine UI default (`defaultDailyCollection` was the last one, wired as the new-product daily-amount default). Credit refund/void and account reactivation now go through a password-confirmation `EntityDialog` instead of a single click.

## Summary of what was done (Phase 8 + revalidatePath fix)

User chose "CRM" as the next module (per the previously-agreed "fix the gaps, when done get started with the next module, and lets have billing and subscription done last" instruction). Unlike Fleet/Installment, no CRM-shaped models existed in the schema — designed `CrmLeadSource`/`CrmContact`/`CrmLead`/`CrmDeal`/`CrmActivity` from scratch, migrated via the established safe `migrate diff` + manual migration folder + `migrate deploy` workflow (confirmed purely additive — no DROP statements). Built the full module: org-scoped service layer, six permission keys, a new "CRM Manager" system role, and all six pages (Contacts, Leads, Deals, Activities, Reports, Settings) plus an overview page and dashboard widget, following the exact pattern established by Fleet (Phase 6) and Installment (Phase 7).

**Major bug found during CRM's own browser verification, then found to be systemic**: moving a deal to the next pipeline stage correctly updated the database (confirmed via direct query) but the browser kept showing the pre-move stage after the action's `redirect()` landed on the same `?saved=1` URL a second time — a Next.js Router Cache staleness issue, not a server-side bug. Fixed by adding `revalidatePath()` before the `redirect()` in the affected CRM action. Then audited every other action file in the project (`grep -rL "revalidatePath"`) and found the exact same gap in **all 13 other mutating action files** across Fleet and Installment — meaning this bug had been present, silently, since Phase 6. Fixed all 18 total action files (7 Fleet + 6 Installment + 5 CRM), re-verified with a full Playwright pass: created a contact, created and converted a lead to a deal (confirming the new contact appeared correctly on the Contacts page too), moved the resulting deal through two pipeline stages in a row with a fresh page navigation after each move, logged an activity, and added a lead source — every step showed correct, non-stale data. All Playwright test-artifact records were deleted afterward via a one-off cleanup script.

**Build result at the time:** Passed. `npm run lint` clean, `npx tsc --noEmit` clean, `npx prisma validate` succeeds, `npm run build` succeeds — 51 routes (up from 44; 7 new CRM routes). Playwright installed temporarily for browser verification, then removed surgically. Dev server stopped afterward.

**Known issues at the time:** CRM's lack of data-level scoping (still current, see above), owner-facing maintenance approval portal (Fleet), file/photo upload for maintenance requests (Fleet), fuzzy duplicate-detection on create, hard deletes for financial records, branch-level access enforcement, public self-registration, unset `RESEND_API_KEY`, inert organization switcher — all still current except where superseded above (Inventory's own equivalent gaps are listed in the current "Known issues" section).

**Next recommended step (at the time):** Get explicit direction on which module followed CRM — candidates were Inventory, Accounting, HR/Payroll, Procurement, Projects, or Analytics. The user chose Inventory, leading directly into the Phase 9 work above.

## Summary of what was done (post-Phase-7 gap-fixing pass)

User said "fix the gaps, when done get started with the next module, and lets have billing and subscription done last" after the Phase 7 report.

**Scoped the "gaps" list deliberately rather than attempting literally everything flagged**: fixed the real security gap (login rate limiting — required the session's first schema change since Phase 3) and every Installment feature GLV's own settings fields implied should exist (commission, administration fee, minimum deposit, payroll-day visibility, credit application), plus GLV's step-up re-authentication pattern. Explicitly **not** attempted, and said so rather than silently dropping them: an owner-facing Fleet maintenance-approval portal (would require adding an entirely new authenticated user type — a much bigger initiative than a gap fix), file/photo upload for maintenance requests (needs a storage-provider decision first), fuzzy duplicate-detection on create, hard deletes for financial records, and branch-level access enforcement (still low-value with only one branch in the whole platform).

**Real bug found and fixed while verifying the rate-limiting feature**: NextAuth v4's credentials provider collapses every `authorize()` outcome — including a thrown `Error` with a custom message — to the fixed string `"CredentialsSignin"` (confirmed by reading `node_modules/next-auth/core/routes/callback.js` directly). The original implementation tried to smuggle a `"locked:15"` message through a thrown Error, which silently never reached the client — every failed attempt, locked or not, showed the same generic "Invalid email or password." Fixed by adding a separate pre-check (`getAccountLockStatus`) the login page calls *before* attempting `signIn()` at all, sidestepping NextAuth's fixed error contract entirely rather than fighting it. Re-verified end-to-end: 5 wrong passwords locks the account, and a **6th attempt using the correct password** is still correctly rejected with "Too many failed attempts. Try again in 15 minutes" — proving the lock check runs before password verification, not just after another failure.

**Commission/administration-fee/minimum-deposit verified with real arithmetic, not just "no error thrown"**: set a 10% administration fee and a 500 minimum deposit via Settings, then created a real account for an existing demo customer — a 3-Seater Sofa Set (base price 3680.00) correctly became a 4048.00 target amount (3680 × 1.10), and a 600 initial deposit correctly left a 3448.00 balance (4048 − 600). A second attempt with only a 100 deposit was correctly rejected before any account was created. Settings were reverted to 0/0 afterward and the test account removed, so the org's real configuration is unchanged from before this pass — the fee/deposit mechanism works, but isn't left "on" for the organization without their own decision to enable it.

**Field-staff scoping verified end-to-end for the first time** (flagged as unverified in the Phase 7 report): created a temporary field-staff test user with the "Hire Purchase Staff" role (not Manager) and a `HirePurchaseStaff` row linked via `userId`, assigned to one isolated test customer. Confirmed they saw *only* that one customer on `/app/installment/customers` (not the four real ones) and were correctly denied `/app/installment/reports` (the role has no `hirepurchase.reports.view`). All test fixtures (user, org membership, staff row, customer) were deleted afterward.

**Cleaned up the pre-existing test data flagged in the Phase 7 report**: deleted the 5 "Test Customer Playwright" and 1 "Debug Customer" records (and their cascade-deleted accounts/payments), restoring the staff-inventory units their fake accounts had consumed first so the demo org's stock levels stay accurate. The 4 legitimate demo customers were untouched.

**Verification:** full validation suite (lint, `tsc --noEmit`, `prisma validate`, `prisma migrate status`, `npm run build`) passes clean — still 44 routes (this pass changed logic inside existing routes, not the route tree). Playwright installed **temporarily** for all of the above, then removed surgically via `npm uninstall playwright` (confirmed via `git diff --stat package.json package-lock.json`, no output). Stopped this project's own dev-server processes afterward, confirmed by command-line inspection first.

**Build result at the time:** Passed. `npm run lint` clean, `npx tsc --noEmit` clean, `npx prisma validate` succeeds, `npx prisma migrate status` reports up to date, `npm run build` succeeds — 44 routes (unchanged from Phase 7).

**Known issues at the time:** owner-facing maintenance approval portal (Fleet), file/photo upload for maintenance requests (Fleet), fuzzy duplicate-detection on create, hard deletes for financial records, branch-level access enforcement, public self-registration, unset `RESEND_API_KEY`, inert organization switcher (single-org demo data), administration fee/minimum deposit set to 0 for the demo org — all still current except where superseded above (CRM's own equivalent gaps are listed in the current "Known issues" section).

**Next recommended step (at the time):** Get explicit direction on what came after this pass — candidates were billing/subscriptions or an additional module (CRM, Inventory, Accounting, HR, Payroll, Procurement, Projects, Analytics). The user chose CRM, leading directly into the Phase 8 work above.

---

## Handoff log

### 2026-07-20 — Claude Code — Phase 9 (Inventory Management)

See "Files changed (Phase 9 — Inventory Management)," "Summary of what was done (Phase 9 — Inventory Management)," "Build result (Phase 9 — Inventory Management)," "Known issues / deliberate gaps (current)," and "Next recommended step" above — kept in the current-state sections rather than duplicated here, since this is the most recent entry.

### 2026-07-20 — Claude Code — Phase 8 (CRM) + revalidatePath router-cache fix

See "Files changed (Phase 8 + revalidatePath fix)" and "Summary of what was done (Phase 8 + revalidatePath fix)" above, plus the "at the time" Build result/Known issues/Next recommended step notes appended to that summary.

### 2026-07-20 — Claude Code — Post-Phase-7 gap-fixing pass

See "Files changed," "Summary," "Build result," "Known issues," and "Next recommended step" above — kept in the current-state sections rather than duplicated here, since this is the most recent entry.

### 2026-07-20 — Claude Code — Phase 7 (Installment Management Migration)

**Files changed:** Created `src/modules/installment/service.ts` (the org-scoped service layer — settings, staff/customer/receipt code generation, products, staff, customers, accounts, payments, credits, the lifecycle sweep, procurement, and reports), `src/modules/installment/dashboard-widget.tsx`, and eight route trees under `src/app/app/installment/` (`products`, `staff`, `customers`, `accounts`, `payments`, `collections`, `reports`, `settings`). Rewrote `src/app/app/installment/page.tsx`.

**Summary:** Spawned an Explore agent against the GLV reference implementation (`C:\Users\andre\glv-management-system`) to extract its *actual* behavior before writing any code — the key finding, confirmed by GLV's own operator doc, was that several of its settings fields (commission, payroll day, administration fee, minimum deposit) are stored and editable but never read by any calculation. Migrated only what GLV actually validates: installment scheduling, payment allocation with overpayment credits, a 3-hour payment edit window with full recalculation, code generation, atomic inventory consumption, the lifecycle sweep, closure refunds, reactivation, procurement readiness, and the report aggregates. Deliberately left commission/admin-fee/minimum-deposit/credit-application/step-up-auth unimplemented, matching GLV's own real (non-)behavior — all later revisited and built in the gap-fixing pass above. Discovered real pre-existing Installment demo data with no UI ever built to show it, including some clearly-test-artifact customer records ("Test Customer Playwright" ×5, "Debug Customer" ×1) flagged for the user rather than deleted unilaterally — later cleaned up in the gap-fixing pass once the user confirmed via "fix the gaps."

**Build result:** Passed. Lint/tsc/prisma/build all clean — 44 routes (up from 36).

**Known issues:** Commission/admin-fee/minimum-deposit/credit-apply/step-up-auth all unimplemented (matching GLV), field-staff scoping unverified in browser, pre-existing test customer records not yet cleaned up, no rate limiting. All resolved in the gap-fixing pass entry above.

**Next recommended step (at the time):** Get explicit approval before continuing — which the user then gave ("fix the gaps, when done get started with the next module, and lets have billing and subscription done last"), leading directly into the gap-fixing pass above.

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
