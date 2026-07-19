> **OBSOLETE — ARCHIVED DOCUMENT**
>
> This document describes the previous Rock Frost Business Suite implementation, which was fully retired during the clean rebuild that began 2026-07-19. It is kept for historical reference only.
>
> **Coding agents must NOT follow this document.** It is not authoritative. See the current `docs/` directory and `OPERATOR_HANDOFF.md` at the repository root for the active architecture and roadmap.

# Rock Frost Business Suite - Operator Handoff

## Mandatory Instructions for Every Agent

Before making changes:
1. Read this entire file.
2. Read docs/ARCHITECTURE_BIBLE.md.
3. Read docs/DEVELOPMENT_ROADMAP.md.
4. Check git status.
5. Understand the latest completed work.
6. Do not undo or overwrite another agent's work unless explicitly instructed.

After making changes:
1. Run npm run build.
2. Fix all errors.
3. Update this file with:
   - Date/time
   - Agent/tool used
   - Objective
   - Files changed
   - Summary of work completed
   - Build result
   - Known issues
   - Next recommended step
4. Commit only intentional changes.

## Current Project State

Marketing website status:
- Public marketing pages exist for `/`, `/features`, `/modules`, `/pricing`, `/industries`, `/about`, `/contact`, and `/demo`.
- The marketing website uses the existing Rock Frost branding, shared marketing components, contact/demo/newsletter API routes, SEO helpers, and public assets.
- Do not redesign the public website or change branding unless explicitly instructed.

Dashboard status:
- SaaS dashboard route group exists under `app/(dashboard)`.
- Dashboard shell, sidebar, topbar, and profile menu components exist.
- Dashboard routes are protected through the current auth-protection foundation, which now also enforces organization membership (see Tenancy status below) — a signed-in user with no `OrganizationMember` row sees a "No organization access" message instead of the dashboard.
- The Topbar and profile page now show the user's real organization name and branch (via `lib/tenant/`) instead of the raw `organizationId`.
- There is still only one dashboard view (`/dashboard`) shared by every role — it always renders the Fleet module's mock metrics regardless of who's logged in. A platform-level `/admin` view for the SaaS owner (organization list, module enablement, billing) does not exist yet; it's listed as planned in Key Routes below but not started.
- Existing dashboard UI should remain stable while platform foundations are added.

Tenancy status:
- `lib/tenant/index.ts` exists (`getCurrentTenant()` / `requireCurrentTenant()`) — resolves the signed-in user's `Organization`, `Branch` (if assigned), `roleId`, and resolved `permissions` (string keys) from their `OrganizationMember` row. This is Phase 3 of `docs/DEVELOPMENT_ROADMAP.md`.
- As of Phase 6, this tenant context is now the real scoping mechanism for Fleet data — every `lib/fleet/service.ts` query filters by `tenant.organizationId`.

RBAC / permissions status (Phase 4):
- `lib/permissions/constants.ts` defines the `PERMISSIONS` key catalog (plain data, no "server-only" import, so it can be imported from standalone scripts). `lib/permissions/index.ts` re-exports it plus `hasPermission()` and `requirePermission()` (redirects to `/dashboard` if the current user lacks the permission).
- `prisma/seed-rbac.ts` is a committed, idempotent seed script (`npx tsx prisma/seed-rbac.ts`) that populates real `Permission` and `RolePermission` rows in the live database for the 6 existing system roles (Super Admin, Organization Owner, Fleet Manager, Driver, Mechanic, Investor). It has already been run against the live Neon database — the tables are populated, not just conceptual.
- `Sidebar` now filters nav items by permission (each nav item maps to a `PermissionKey`). **All 11 Fleet pages** (not just Settings and Investor Dashboard) now call `requirePermission()` server-side — a user without the permission is redirected to `/dashboard` even via direct URL, not just hidden from nav. This was closed out on 2026-07-19 (see handoff entry below) — there is no longer a gap between nav visibility and route enforcement.
- Verified end-to-end in a real browser: logged in as Super Admin (`admin@rockfrostgroup.com`) — every Fleet route accessible. Logged in as Driver (`driver@demo.com`) — direct navigation to `/fleet/vehicles`, `/fleet/payments`, `/fleet/reports`, `/fleet/vehicle-owners`, and `/fleet/work-and-pay` all redirected to `/dashboard`, while `/fleet` and `/fleet/maintenance` (permissions Driver actually has) remained accessible.

Fleet module status (Phase 6 — real backend, no longer mock data):
- **Fleet pages now consume real, tenant-scoped database data.** `lib/fleet/service.ts` has one function per data need (`getDashboardMetrics`, `getVehicles`, `getOwners`, `getDrivers`, `getVehicleDocuments`, `getMaintenanceRequests`, `getWorkAndPayContracts`, `getPayments`, `getReportSummary`, `getInvestorSummary`), each taking `organizationId` and querying Prisma directly — no mock arrays remain. `lib/fleet/types.ts` holds the display-shape interfaces (unchanged from the old mock module, so the UI components didn't need to change). All 11 Fleet pages + `/dashboard` were updated to `await` these functions using `requireCurrentTenant()` (or the tenant returned by `requirePermission()` on the two guarded pages).
- **The live database already had rich, real seed data** from the original 2026-07-04 setup (3 owners, 3 drivers, 4 vehicles, 3 maintenance requests, 4 payments, 3 work-and-pay contracts, all Ghana-flavored: Kwaku Transport Services, Kojo Addai, plate "GR 4216-26", "Accra Fleet Yard", etc.) — this was discovered mid-implementation and used as-is rather than overwritten with fabricated mock-replica data. Only `FleetVehicleDocument` (see below) had zero rows, since that model didn't exist before this phase.
- **Schema addition**: `FleetVehicleDocument` model (provider, policyNumber, insuranceExpiresAt, roadworthyExpiresAt, renewalStatus, alerts) plus `FleetVehicle.nextServiceDueAt`/`serviceNotes` fields were added via migration `20260719070000_add_fleet_vehicle_documents`, because the Insurance & Roadworthy page's data (separate insurer/policy-number/expiry-date fields) had no backing model at all — only a generic `documentStatus` enum existed on `FleetVehicle`. Seeded via `prisma/seed-fleet-documents.ts` (committed, idempotent) for the 4 existing real vehicles.
- **Currency is GHS, not USD.** The real seed data (`Organization.currency`, owner `history.revenueLabel`, etc.) is in Ghanaian Cedis, so `formatMoney()` in the service layer prefixes `GHS` rather than the mock module's `$`. This is a deliberate correction, not an oversight — using `$` on real Cedi figures would be wrong, not just a cosmetic mismatch.
- **Investor/report metrics were adjusted, not fabricated.** The old mock had invented percentage deltas ("+12.8%", "+3.9%") and a made-up "$9.2M fleet value" with no real underlying data source. Since there's no historical/time-series data to compute real trends from, the real `getReportSummary`/`getInvestorSummary` use `"Live"` instead of a fake delta, and "Fleet value" was replaced with "Fleet size" (a real vehicle count) rather than inventing an asset valuation number.
- Do not replace this real backend with mock data again. Fleet pages are fully DB-backed as of 2026-07-19.

Notifications & audit status (Phase 8):
- `lib/audit/index.ts` (`logAuditEvent()`, `getAuditLog()`) and `lib/notifications/index.ts` (`createNotification()`, `getNotificationsForUser()`, `getUnreadNotificationCount()`, `markNotificationRead()`) are real, tenant-scoped services backed by the existing `AuditLog`/`Notification` models (both already existed in the schema from the Phase 1 foundation but had zero rows/consumers until now).
- The only real event currently in the app is login — `lib/auth/nextauth.ts` now logs a `login_succeeded`/`login_failed` audit entry and creates a "Welcome back" IN_APP notification on successful sign-in. There are no other mutation actions anywhere in the app yet (Fleet pages are still read-only displays), so no other hooks were added — adding audit/notification calls to actions that don't exist yet would be dead code.
- `/notifications` (a real dashboard route, listed as "planned" in Key Routes before now) lists the current user's notifications with a "Mark as read" button; `app/api/notifications/[id]/read/route.ts` handles the mutation (ownership-checked — a user can only mark their own notifications read). Sidebar shows an unread-count badge next to the Notifications nav item.
- **Only the `IN_APP` channel is actually delivered** (stored + immediately marked `SENT`). `EMAIL`/`SMS`/`PUSH` notifications would be created with `status: QUEUED` and never actually sent — there's no delivery integration wired up for them yet (Resend exists for the marketing contact form but isn't connected to the Notification model). Nothing currently creates non-IN_APP notifications, so this gap isn't exposed yet, but it would need addressing before those channels are used for anything real.

AI Assistant status (Phase 9):
- `lib/ai/client.ts` (`getAnthropicClient()`) and `lib/ai/index.ts` (`getAssistantResponse()`) — same graceful-degradation pattern as `lib/resend.ts`: returns `{ ok: false, error }` if `ANTHROPIC_API_KEY` is unset rather than throwing. **`ANTHROPIC_API_KEY` is currently empty in `.env`** — the assistant is scaffolded but not live. Set a real key to enable it; nothing else needs to change.
- Uses `claude-opus-4-8` with adaptive thinking, non-streaming (responses are short business Q&A, well under the token range that needs streaming). System prompt is built from `TenantContext` (organization name, tenant code, branch, role) — this satisfies the roadmap's "context-aware prompt construction using tenant and module data" criterion.
- **Deliberately not wired to live Fleet data.** The roadmap's Phase 9 acceptance criteria calls for the assistant to "remain decoupled from core business logic" — it currently answers general fleet-operations questions and explains where to find things in the dashboard, but does not query `lib/fleet/service.ts` or any real records. If asked for specific figures, it says so rather than guessing. Wiring it to real data (a proper RAG/tool-use layer) would be a deliberate follow-up decision, not something to slip in unannounced.
- New permission `ai.assistant.use` was added and seeded for all 6 roles (everyone gets assistant access, same tier as `dashboard.view`) — see `prisma/seed-rbac.ts`.
- `/assistant` (new dashboard route) has a simple single-question chat box; `app/api/ai/route.ts` handles the request (session + permission + tenant-checked) and logs an `ai_assistant_query` audit event on success via the Phase 8 audit service.
- Verified end-to-end in a real browser with the key unset: submitting a question correctly shows "The AI assistant is not configured yet. Set ANTHROPIC_API_KEY to enable it." rather than an error page or silent failure. Not yet tested against a real API call — do that once a key is added.

Auth foundation status:
- **Auth is now real, not a demo stub.** `lib/auth/nextauth.ts`'s `authorize()` queries the `User` table, checks `status === 'ACTIVE'`, and verifies the password with `bcrypt.compare()` against `passwordHash`. It no longer accepts any email/password combination.
- The session now carries the real `id`, `name`, `email`, `organizationId` (from the user's first `OrganizationMember` row), and `role` (from that membership's `Role.name`). `lastLoginAt` is updated on successful login.
- The owner/Super Admin account is `admin@rockfrostgroup.com` — a real password was generated and set directly in the database (bcrypt-hashed); it was given to the user out-of-band and is not stored anywhere in this repo.
- Auth API route exists at `app/api/auth/[...nextauth]/route.ts`.
- Auth helpers and type augmentation exist under `lib/auth/`.
- Login, forgot-password, reset-password, invite, and profile pages exist. The login page (`app/(auth)/login/page.tsx`) is now a client component using `signIn()` from `next-auth/react` (see the later 2026-07-19 handoff entry for why the earlier plain-HTML-form version didn't work).
- Still missing for full production auth: forgot-password/reset-password flows are UI-only (no backing API), invite flow is UI-only, and there is no rate limiting or account lockout on failed login attempts.

Prisma/database status:
- Prisma and Prisma Client are installed.
- `prisma/schema.prisma` exists with initial multi-tenant platform, NextAuth-compatible, RBAC, module, audit, notification, file, and fleet models.
- `lib/db.ts` exists as a server-only Prisma Client singleton.
- `.env` (not `.env.example`) has database and NextAuth environment variables populated, including a real Neon Postgres `DATABASE_URL`.
- **The Neon database is NOT empty.** It already has the full schema (22 tables) applied and contains real seeded data: 1 `Organization` ("Rock Frost Demo Fleet") and 6 `User` rows. Do not assume the database is empty — always run `npx prisma migrate status` before making any migration decisions.
- `prisma/migrations/20260704162000_baseline_production_schema/migration.sql` is a baseline migration reconstructing the schema that was already live in Neon (see the 2026-07-19 handoff entry for the full history of how it got there). It is marked `--applied` in the database and does not need to be (and must not be) re-run.
- Migration history is now reconciled and clean: `npx prisma migrate status` reports "Database schema is up to date!".
- Database pages are not connected yet, and no mock data has been removed.

Hire Purchase module status (Phase 10 — ported from `C:\Users\andre\glv-management-system`, renamed from "GLV Layaway" per the user's explicit choice):
- **Full CRUD, tenant-scoped, real database backend** — not a read-only display like Fleet was before Phase 6. 11 new Prisma models (`HirePurchaseStaff`, `HirePurchaseStaffSalaryPayment`, `HirePurchaseStaffSalaryHistory`, `HirePurchaseProductCategory`, `HirePurchaseProduct`, `HirePurchaseStaffInventory`, `HirePurchaseCustomer`, `HirePurchaseAccount`, `HirePurchasePayment`, `HirePurchaseCredit`, `HirePurchaseSettings`) and 4 enums, all with `organizationId` (added via migration `20260719080000_add_hire_purchase_module`, purely additive — confirmed via `prisma migrate diff` before applying, no drops).
- **Architectural decisions locked in with the user before implementation** (via AskUserQuestion): module name "Hire Purchase" (routes under `/hire-purchase/*`); reuse Rock Frost's existing auth/RBAC rather than port GLV's own User/Staff/2FA system; extend the existing `lib/ai/` assistant's system prompt rather than port GLV's separate OpenAI chat; defer 2FA entirely (not ported — flagged as a known platform-wide gap, same as before).
- `HirePurchaseStaff` links to Rock Frost's real `User`/`OrganizationMember` via an optional `userId` (same pattern as `FleetDriver.userId`) — GLV's own separate User/Staff/password-reset system was **not** ported. Two new system roles were added (`Hire Purchase Manager` — full module access; `Hire Purchase Staff` — customers/accounts/payments only, mirroring GLV's ADMIN/STAFF split) via an extended `prisma/seed-rbac.ts` that now also upserts the `Role` rows themselves (previously it only assigned permissions to pre-existing roles).
- 9 new permissions added (`hirepurchase.view`, `.customers.manage`, `.accounts.manage`, `.payments.manage`, `.products.manage`, `.staff.manage`, `.credits.manage`, `.reports.view`, `.settings.manage`) in `lib/permissions/constants.ts`, seeded per role in `prisma/seed-rbac.ts`.
- `lib/hire-purchase/` follows the Fleet `service.ts`/`types.ts`/`index.ts` pattern plus additional files the GLV port needed: `settings.ts` (per-org settings row, get-or-create), `lifecycle.ts` (account status state machine — ACTIVE → DORMANT (21d) → PROBATION (4mo) → CLOSED (6mo, auto-creates a refund credit) → ARCHIVED (after delivery), reactivation with a service-fee deduction), `ids.ts` (sequential customer-code/receipt-number/staff-code generation), `inventory.ts` (atomic per-staff stock consume/restore for account creation/deletion), and `actions/*.ts` (7 files of `"use server"` mutations — this is the platform's **first** module with real Server Action mutations; Fleet is still read-only).
- **Two real logic gaps in the source GLV app were fixed during the port, not replicated**: (1) GLV's account-lifecycle refund/reactivation service fee was a hardcoded `0.32` literal despite a `refundDeductionPercent` *setting* existing for it — the port actually wires `HirePurchaseSettings.refundDeductionPercent` into the calculation. (2) Same issue for the archive-after-delivery window — GLV hardcoded `2` days despite `deliveryTimeAfterCompletionDays` existing as a configurable setting; the port wires it through. Everything else (receipt numbering, credit/overpayment handling, staff-inventory atomicity, procurement threshold math, product margin validation using landed cost) was ported faithfully.
- **Deliberately not ported / deferred, by explicit decision or scope**: 2FA; GLV's own OpenAI-based AI chat (the existing Anthropic-based `lib/ai/` assistant's system prompt was extended instead — see `lib/ai/index.ts`); file/photo upload for customer/staff/product images (Rock Frost's `FileAsset` model has no working storage backend wired up anywhere in the codebase, Fleet included — `photoUrl`/`imageUrl` fields exist as plain nullable strings with no upload UI, a known gap, not new to this phase); `StaffApplication` (job-application workflow), `ProfileChangeRequest` (email/photo change approval), `UserAppearancePreference` (per-user theme) — all tangential to the installment business logic and superseded by Rock Frost's own platform-wide equivalents (or simply out of scope); Excel exports for reports/procurement (GLV's `exceljs`-based weekly/procurement export routes were not ported — the Reports page shows the same underlying numbers on-screen instead).
- Audit logging and notifications reuse the existing Phase 8 services (`logAuditEvent`, tenant-scoped `AuditLog`) rather than building parallel systems — every mutation in `lib/hire-purchase/actions/*.ts` logs an audit entry.
- **Real bug found and fixed during verification**: every `db.$transaction()` call in `lib/hire-purchase/actions/*.ts` (10 call sites) needed an explicit `{ timeout: 15000 }` option. Prisma's default interactive-transaction timeout is 5 seconds, and this Neon connection's round-trip latency in this dev environment is high enough that a payment-recording transaction (which does several sequential queries: receipt-number lookup, payment insert, account update, optional credit insert, audit log insert) blew past it, producing `Transaction API error: Transaction not found` and a rolled-back payment. Fixed by adding the timeout option to all 10 `$transaction` calls (staff.ts ×2, accounts.ts ×3, payments.ts ×3, products.ts ×2). This would likely also affect Fleet if it ever grows multi-query transactional mutations — worth checking if Fleet gains real mutations later.
- Demo data seeded via `prisma/seed-hire-purchase.ts` (committed, idempotent) against the existing "Rock Frost Demo Fleet" organization: a new real login `hirepurchase@demo.com` / `HirePurchase@2026` (role: Hire Purchase Manager) linked to staff member "Efua Darko" (code `EFU`), 3 product categories, 3 products (TV, sofa set, fridge), 4 customers, and 3 demo accounts (one nearly-complete with 6 payments, one just-started, one completed with an open overpayment credit) — gives the module realistic, non-empty data to explore immediately.
- Verified end-to-end in a real browser (Playwright, installed temporarily then reverted — same pattern as every prior phase): logged in as the new Hire Purchase Manager demo user, created a real customer (staff-assignment dropdown shown since Manager-tier), created a real installment account against a real product, recorded a real payment (confirmed the receipt-number confirmation banner and the `RCPT/26/000009`-style sequential receipt number), and loaded Products/Staff/Credits/Reports/Settings pages — all rendered real data with no errors.
- **Incidental fix, unrelated to this phase**: the dev server's Turbopack cache (`.next/`) had gone stale after an earlier `taskkill /F` on a leftover process from a previous session, causing the entire `/api/auth/[...nextauth]` route to 404 regardless of which user tried to log in. Cleared `.next/` and restarted — not a Hire Purchase bug, but worth knowing if `/api/auth/*` ever 404s unexpectedly after a forced process kill.

Documentation status:
- `docs/ARCHITECTURE_BIBLE.md` exists and is the primary architecture source.
- `docs/DEVELOPMENT_ROADMAP.md` exists and is the implementation sequencing source.
- `docs/AUTHENTICATION_PLAN.md` exists for auth planning.
- `docs/DATABASE_SCHEMA_PLAN.md` is not currently present in the repository.
- `OPERATOR_HANDOFF.md` is the shared operational handoff log for all coding agents.

Working tree status at creation:
- The repository had uncommitted auth/dashboard changes before this file was created.
- The Prisma foundation files are also present in the working tree and should be committed intentionally with their related package changes.
- Future agents must inspect `git status` before editing and avoid reverting unrelated pending work.

## Current Active Branch

main

## Project Rules

- Do not redesign the public website unless explicitly instructed.
- Do not change the Rock Frost branding unless explicitly instructed.
- Do not remove existing routes without approval.
- Fleet mock data has been replaced with real database data (Phase 6, approved and completed 2026-07-19) — this rule no longer applies going forward; new business modules should be built database-backed from the start rather than mocked first.
- Do not implement payment gateways yet.
- Keep the SaaS dashboard and marketing website separated by route groups.
- Every business feature must support future multi-tenancy.
- Every business model must be designed around organizationId.
- Use reusable components.
- Keep TypeScript clean.
- Keep npm run build passing.

## Key Routes

- `/`
- `/features`
- `/modules`
- `/pricing`
- `/industries`
- `/about`
- `/contact`
- `/login`
- `/dashboard`
- `/fleet`
- `/fleet/vehicles`
- `/fleet/vehicle-owners`
- `/fleet/drivers`
- `/fleet/insurance-roadworthy`
- `/fleet/maintenance`
- `/fleet/work-and-pay`
- `/fleet/payments`
- `/fleet/reports`
- `/fleet/investor-dashboard`
- `/hire-purchase`
- `/hire-purchase/customers`, `/hire-purchase/customers/new`, `/hire-purchase/customers/[id]`
- `/hire-purchase/accounts`, `/hire-purchase/accounts/new`, `/hire-purchase/accounts/[id]`
- `/hire-purchase/payments`
- `/hire-purchase/products`, `/hire-purchase/products/new`, `/hire-purchase/products/[id]`
- `/hire-purchase/staff`, `/hire-purchase/staff/new`, `/hire-purchase/staff/[id]`
- `/hire-purchase/credits`
- `/hire-purchase/reports`
- `/hire-purchase/settings`
- `/settings` (planned; not currently present as a root route)
- `/profile`
- `/notifications` (planned; not currently present)
- `/admin` (planned; not currently present)
- `/organizations` (planned; not currently present)

## Latest Handoff Log

### 2026-07-19 (Phase 10 — Hire Purchase module) - Claude Code

**Objective:**
Port `C:\Users\andre\glv-management-system` (a separate, already-built production Next.js app — a customer layaway/installment-purchase management system for "God's Love Ventures") into Rock Frost Business Suite as a new business module, per the user's explicit request: "so with phase 10 we need to copy this production ready app ... then instead of calling it GLV Layaway module, we can call it hire purchase or installment module. so implement everything from this directory." This is `docs/DEVELOPMENT_ROADMAP.md` Phase 10, originally scoped as "GLV Layaway Module."

**Files changed:**
- `prisma/schema.prisma` (11 new models, 4 new enums, relation arrays on `User`/`Organization`/`Branch`)
- `prisma/migrations/20260719080000_add_hire_purchase_module/migration.sql` (new)
- `prisma/seed-rbac.ts` (now also upserts `Role` rows, not just permissions; added `Hire Purchase Manager`/`Hire Purchase Staff` roles + their permission sets)
- `prisma/seed-hire-purchase.ts` (new, committed, idempotent demo-data seed)
- `lib/permissions/constants.ts` (9 new `HIREPURCHASE_*` permission keys)
- `lib/hire-purchase/` (new — `types.ts`, `service.ts`, `settings.ts`, `lifecycle.ts`, `ids.ts`, `inventory.ts`, `index.ts`, `actions/{customers,accounts,payments,payments-core,products,staff,staff-inventory,credits,settings}.ts`)
- `app/(dashboard)/hire-purchase/` (new — 16 pages: overview, customers ×3, accounts ×3, payments, products ×3, staff ×3, credits, reports, settings)
- `components/dashboard/Sidebar.tsx` (9 new nav items)
- `lib/ai/index.ts` (system prompt now mentions both Fleet and Hire Purchase modules)

**Summary:**
Given the scale (33 pages, 9 API routes, 15 server-action files, its own auth/2FA/AI-chat/file-storage systems in the source app), paused before writing code to get the user's sign-off on four architectural decisions via AskUserQuestion — all confirmed: module name "Hire Purchase"; reuse Rock Frost's auth/RBAC instead of porting GLV's own; extend the existing Anthropic-based assistant instead of porting GLV's separate OpenAI chat; defer 2FA. Then read the source app's full `prisma/schema.prisma` and delegated a structured extraction of the remaining business logic (staff code generation, salary history point-in-time lookups, product margin validation, procurement threshold math, settings fields actually wired vs. merely stored, activity-feed computation) to a background research agent, while personally reading the money-critical files (`actions/accounts.ts`, `actions/payments.ts`, `actions/customers.ts`, `lib/customer-account-creation.ts`, `lib/payment-recording.ts`, `lib/staff-inventory.ts`, `lib/account-lifecycle.ts`) to ensure the core installment-contract lifecycle was understood precisely, not paraphrased.

Designed the schema by translating each GLV model 1:1 into an `organizationId`-scoped `HirePurchase*`-prefixed model, following the exact `FleetOwner`/`FleetDriver` convention already established (optional `branchId`, `Decimal(12,2)` for money fields matching Fleet rather than GLV's plain `Float`, enums prefixed to avoid collision). Dropped GLV's own `User`/`Staff`/`Setting`(global)/`AuditLog`/2FA/appearance/job-application/profile-change-request concepts entirely, reusing Rock Frost's equivalents instead (`Organization` already has company-identity fields GLV's global `Setting` duplicated; the existing `AuditLog`/`Notification` services from Phase 8 needed zero changes to support this module). Generated the migration via `prisma migrate diff` against the live DB (confirmed purely additive — 4 `CREATE TYPE`, 11 `CREATE TABLE`, indexes, foreign keys, no drops) rather than `prisma migrate dev`, because the DB's migration history contains old already-resolved bookkeeping noise (a rolled-back `init_glv_v1` migration record from the earlier-session DB reconciliation — confirmed via `_prisma_migrations` query that it left no actual GLV tables behind, just a stale history row) that makes `migrate dev`'s drift check refuse to proceed; applied the SQL directly via `prisma db execute` and recorded it with `prisma migrate resolve --applied`.

Built the full service/action layer following the Fleet `service.ts`/`types.ts`/`index.ts` template, extended with `lifecycle.ts` (the DORMANT/PROBATION/CLOSED state machine, called opportunistically from account/dashboard reads since there's no cron infrastructure — matching how Fleet's own aggregates are computed live on each page load), `ids.ts` (sequential customer-code and receipt-number generation, per-org/per-staff-scoped), and `inventory.ts` (atomic staff-inventory consume/restore using a conditional `updateMany` + row-count check, exactly matching GLV's original concurrency-safe approach). This is the platform's **first module with real Server Action mutations** — Fleet has been a read-only display since Phase 6, so `requirePermission()`-guarded `"use server"` action files calling `db.$transaction()` are new here, not an established pattern to copy.

Two real logic gaps in the source app were identified during the extraction pass and fixed rather than replicated: GLV's `CLOSURE_SERVICE_FEE_RATE = 0.32` and `ARCHIVE_AFTER_DELIVERY_DAYS = 2` were hardcoded literals in `lib/account-lifecycle.ts` despite `refundDeductionPercent` and `deliveryTimeAfterCompletionDays` existing as configurable settings meant to drive them — the port wires both through `HirePurchaseSettings` properly.

Added two new system roles (`Hire Purchase Manager`, `Hire Purchase Staff`) rather than only granting the new permissions to Super Admin/Organization Owner, since GLV's real ADMIN/STAFF distinction (staff only manage their own assigned customers) is meaningful business behavior, not just cosmetic — `prisma/seed-rbac.ts` was extended to upsert `Role` rows itself (previously it assumed roles already existed), a strict improvement in self-sufficiency.

Seeded realistic demo data (`prisma/seed-hire-purchase.ts`) including a brand-new real login (`hirepurchase@demo.com`, Hire Purchase Manager role) so the module isn't empty on first look, matching the existing `*@demo.com` persona convention already used for Fleet.

**Two real bugs found and fixed during verification** (both caught by driving the actual app in a browser, not by reading code):
1. Every `db.$transaction()` call (10 sites across `staff.ts`, `accounts.ts`, `payments.ts`, `products.ts`) needed an explicit `{ timeout: 15000 }` — Prisma's 5-second default was too short for this Neon connection's latency once a transaction did several sequential queries (receipt-number lookup + payment insert + account update + audit log), producing `Transaction API error: Transaction not found` and silently rolling back a real payment attempt.
2. Unrelated to this module: the dev server's Turbopack cache had gone stale after an earlier `taskkill /F` (killing a leftover process from prior-phase testing so `prisma generate` could write the engine DLL), causing `/api/auth/[...nextauth]` to 404 for every user regardless of credentials. Cleared `.next/` and restarted — recorded here in case it recurs.

Verified end-to-end in a real browser (Playwright, installed temporarily then reverted via `git checkout -- package.json package-lock.json`, confirmed clean via `git diff --stat` afterward — no repeat of the earlier-session accidental-revert incident since no other dependency changed this time): logged in as the new demo Manager user, created a real customer, opened a real installment account (consuming one unit of staff inventory), recorded a real payment (confirmed the sequential receipt number `RCPT/26/000009` and the on-page confirmation banner), and loaded Products/Staff/Credits/Reports/Settings — all real, tenant-scoped data, no mock arrays anywhere in this module.

**Build result:**
Passed. `npm run build` completed successfully, 16 new `/hire-purchase/*` routes generated alongside all existing routes, TypeScript clean (`tsc --noEmit` also clean).

**Known issues:**
- No file/photo upload for customer/staff/product images — `photoUrl`/`imageUrl` are plain nullable string fields with no upload UI, since Rock Frost has no working file-storage backend wired up anywhere yet (`FileAsset` exists in the schema but nothing populates `storagePath`, Fleet included). A future decision on Vercel Blob (or similar) vs. a self-hosted alternative is needed before this can be closed.
- 2FA was explicitly deferred per the user's decision — not a gap to silently fix, a known deferred scope item.
- Excel exports (weekly report, procurement list) from the source app were not ported — the Reports page shows the same underlying figures on-screen only.
- `StaffApplication` (job-application intake), `ProfileChangeRequest` (email/photo change approval), and `UserAppearancePreference` (per-user theme) were not ported — judged tangential to the installment business logic and/or superseded by Rock Frost's own platform-level equivalents; flag if a future request specifically needs them.
- Only one demo login exists for this module (`hirepurchase@demo.com`, Manager tier) — no `Hire Purchase Staff`-tier demo account has been created/tested yet, so the "staff only sees their own assigned customers" restriction (enforced in `createCustomer`'s `resolveStaffId()`) has not been verified end-to-end in a browser, only read-verified in the code.
- The `$transaction` timeout fix (10 call sites) was applied to this module only — if Fleet ever grows multi-query transactional mutations, the same Neon-latency risk would apply there too and hasn't been checked.

**Next recommended step:**
Consider testing the `Hire Purchase Staff` role end-to-end (create a second demo user with that role, confirm they can only manage their own assigned customers). Beyond that, remaining roadmap items are Phase 7 (Billing & Subscriptions, still deferred pending explicit approval and gated by the no-payment-gateways rule) and Phase 11 (Production Hardening) — worth checking with the user on priority order. The file-storage decision (Vercel Blob vs. alternative) is also worth raising explicitly rather than leaving implicit, since it blocks photo/image features across both Fleet and Hire Purchase.

### 2026-07-19 (Phase 9) - Claude Code

**Objective:**
Implement Phase 9 (AI Assistant) per `docs/DEVELOPMENT_ROADMAP.md`, per the user's request to continue after closing the Fleet permission gap. The roadmap's own framing for this phase is scaffolding, not a full feature: "AI assistant service boundaries," "context-aware prompt construction," "keep first AI feature minimal and extensible."

**Files changed:**
- `lib/ai/client.ts`, `lib/ai/index.ts` (new)
- `lib/permissions/constants.ts` (new `AI_ASSISTANT_USE` permission)
- `prisma/seed-rbac.ts` (grants the new permission to all 6 roles)
- `app/api/ai/route.ts` (new)
- `app/(dashboard)/assistant/page.tsx`, `app/(dashboard)/assistant/AssistantChat.tsx` (new)
- `components/dashboard/Sidebar.tsx` (new nav item)
- `.env` (added empty `ANTHROPIC_API_KEY=""` placeholder, matching the existing `RESEND_API_KEY=""` pattern)
- `package.json` (added `@anthropic-ai/sdk`)

**Summary:**
Before writing any code, loaded the `claude-api` skill per its own trigger rules (the task is LLM-shaped with the provider unstated) rather than relying on training data, since Claude API specifics drift release to release. Built `lib/ai/client.ts` + `lib/ai/index.ts` following the exact graceful-degradation pattern already established by `lib/resend.ts` — `getAnthropicClient()` returns `null` if `ANTHROPIC_API_KEY` is unset, and `getAssistantResponse()` returns a `{ ok: false, error }` result rather than throwing, so the feature degrades cleanly instead of crashing when unconfigured (which it currently is — the key is empty).

The system prompt is built from `TenantContext` (organization name, tenant code, branch, role) via a `buildSystemPrompt()` helper, satisfying the roadmap's "prompts are built with tenant context and module boundaries" criterion. Used `claude-opus-4-8` with adaptive thinking; kept it non-streaming since responses are short business Q&A, not long-form generation. Deliberately did **not** wire the assistant into `lib/fleet/service.ts` or any real Fleet queries — the roadmap explicitly calls for the assistant to "remain decoupled from core business logic" at this stage, and building a real RAG/tool-use layer over live data is a substantial follow-up decision that shouldn't be bundled into scaffolding work without a separate discussion.

Added a new permission (`ai.assistant.use`) rather than reusing an existing one, and granted it to all 6 roles (same tier as `dashboard.view` — every user gets assistant access) via `prisma/seed-rbac.ts`, then re-ran the seed script against the live database (idempotent; counts increased by exactly 1 per role as expected). Built `/assistant` as a real dashboard route with a minimal single-question chat box, backed by `app/api/ai/route.ts`, which checks session + tenant + permission before calling the assistant and logs an `ai_assistant_query` audit event on success (reusing the Phase 8 audit service — a nice small integration between the two most recent phases).

Hit one process error mid-task worth flagging: after testing, ran `git checkout -- package.json package-lock.json` intending to revert the *temporary* Playwright test dependency, but that also silently reverted the *real* `@anthropic-ai/sdk` dependency added earlier in the same session, since `git checkout` reverts the whole file regardless of which lines were meant to stay. Caught it before committing by grepping `package.json` for `anthropic` post-revert, found it missing, and reinstalled it properly. Worth remembering for future sessions: a blanket file-level `git checkout` is not safe once a file has accumulated more than one intentional change in the same session — check the diff first, or revert by editing back to the desired state rather than discarding the whole file.

Verified end-to-end in a real browser: logged in as Super Admin, navigated to `/assistant`, submitted a question, and confirmed the exact "not configured" message renders in the UI (rather than an error page or a hang) — this is the only path testable right now since `ANTHROPIC_API_KEY` is empty. Did not test an actual live API call.

**Build result:**
Passed. `npm run build` completed successfully, 34 routes generated (added `/api/ai` and `/assistant`).

**Known issues:**
- `ANTHROPIC_API_KEY` is unset — the assistant is fully scaffolded but inert until a real key is added to `.env`. No code changes needed once a key exists.
- The assistant cannot answer questions about the organization's actual fleet data (real vehicle counts, specific maintenance records, etc.) — it explains this limitation to the user rather than guessing, by design (see "decoupled from core business logic" above).
- No conversation history/persistence — each question is a single, independent request with no memory of prior turns in the same session.
- Live API call behavior (real Claude response quality, latency, error handling for actual rate limits/auth failures) is untested — only the "key missing" path has been verified.

**Next recommended step:**
Add a real `ANTHROPIC_API_KEY` and verify a live round-trip before considering this phase fully done. Beyond that, remaining roadmap phases are Phase 7 (Billing, still deferred pending explicit approval), Phase 10 (GLV Layaway Module), and Phase 11 (Production Hardening) — worth checking with the user on priority order.

### 2026-07-19 (Fleet permission gap closed) - Claude Code

**Objective:**
Close the remaining Fleet RBAC gap flagged in the Phase 4 and Phase 6 entries — 9 Fleet pages had their nav links hidden by permission but no server-side enforcement, so a user could still reach them by typing the URL directly.

**Files changed:**
- `app/(dashboard)/fleet/page.tsx`, `vehicles/page.tsx`, `vehicle-owners/page.tsx`, `drivers/page.tsx`, `insurance-roadworthy/page.tsx`, `maintenance/page.tsx`, `work-and-pay/page.tsx`, `payments/page.tsx`, `reports/page.tsx`

**Summary:**
Mechanical but important fix: each page's `const tenant = await requireCurrentTenant();` (from `@/lib/tenant`) was swapped for `const tenant = await requirePermission(PERMISSIONS.<matching key>);` (from `@/lib/permissions`) — the same one-line pattern already used on `/fleet/settings` and `/fleet/investor-dashboard` since Phase 4. Each page now maps to the same permission its Sidebar nav entry already used for visibility, so nav-hiding and route-enforcement are finally backed by the same check instead of two separate, driftable ones.

Verified with a real browser test: logged in as Driver (`driver@demo.com`), confirmed direct navigation to `/fleet/vehicles`, `/fleet/payments`, `/fleet/reports`, `/fleet/vehicle-owners`, and `/fleet/work-and-pay` all now redirect to `/dashboard` (Driver's role only has `dashboard.view`, `fleet.view`, and `fleet.maintenance.manage`), while `/fleet` and `/fleet/maintenance` remain reachable. Logged in as Super Admin and confirmed every route stays accessible. All checks passed exactly as expected on the first try.

**Build result:**
Passed. `npm run build` completed successfully, 32 routes generated.

**Known issues:**
None new — this closes the specific gap noted in the two prior handoff entries.

**Next recommended step:**
Phase 9 (AI Assistant) per `docs/DEVELOPMENT_ROADMAP.md`.

### 2026-07-19 (Phase 8) - Claude Code

**Objective:**
Implement Phase 8 (Notifications & Audit Logs) per `docs/DEVELOPMENT_ROADMAP.md`, after the user deferred Phase 7 (Billing & Subscriptions, still gated by the payment-gateway rule) and said to proceed with what's next.

**Files changed:**
- `lib/audit/index.ts` (new)
- `lib/notifications/index.ts` (new)
- `lib/auth/nextauth.ts` (login success/failure now logs audit events + a login notification)
- `app/(dashboard)/notifications/page.tsx`, `app/(dashboard)/notifications/MarkNotificationReadButton.tsx` (new)
- `app/api/notifications/[id]/read/route.ts` (new)
- `components/dashboard/Sidebar.tsx` (Notifications nav item + unread badge)

**Summary:**
`AuditLog` and `Notification` models already existed in the schema from the Phase 1 foundation work but had zero rows and nothing writing to them. Built the two service modules the roadmap calls for: `lib/audit/` (`logAuditEvent`, append-only, `getAuditLog` for retrieval) and `lib/notifications/` (`createNotification`, `getNotificationsForUser`, `getUnreadNotificationCount`, `markNotificationRead` — the latter has the ownership check baked into its `where` clause so a user can't mark someone else's notification read).

For "event generation hooks," the honest scope check first: the app currently has exactly one real user-triggered event anywhere — signing in. Fleet pages are still 100% read-only displays (Phase 6 built read queries, not mutations), and there's no signup/invite-acceptance flow wired up yet either. Rather than inventing artificial events to hook into, wired audit logging and a notification into the one real event that exists: `lib/auth/nextauth.ts`'s `authorize()` now logs `login_succeeded`/`login_failed` audit entries (skipped if the account has no organization, since `organizationId` is required on `AuditLog`) and creates a "Welcome back" `IN_APP` notification on success.

Built `/notifications` as a real dashboard page (previously listed as "planned" in Key Routes) showing the signed-in user's notifications with a "Mark as read" button, backed by `app/api/notifications/[id]/read/route.ts`. Added an unread-count badge to the Sidebar's Notifications nav item so there's a visible signal without having to open the page.

Deliberately did not build real delivery for `EMAIL`/`SMS`/`PUSH` channels — `createNotification()` marks `IN_APP` notifications `SENT` immediately (there's nothing further to deliver) but leaves other channels `QUEUED`, since there's no delivery integration wired to the `Notification` model yet (Resend exists but is only used by the marketing contact form). Nothing currently creates non-IN_APP notifications, so this is an honest gap, not a hidden bug — flagged for whoever adds the next channel-consuming feature.

Verified end-to-end in a real browser (Playwright, installed temporarily then reverted, same pattern as prior phases): logged in as Super Admin, confirmed the Sidebar showed a "1" unread badge, `/notifications` displayed the real "Welcome back" notification with correct timestamp, clicking "Mark as read" removed the button and the badge cleared — screenshot confirmed all three.

**Build result:**
Passed. `npm run build` completed successfully, 32 routes generated (added `/notifications` and `/api/notifications/[id]/read`).

**Known issues:**
- Only login generates audit/notification events — there's nothing else in the app yet that would. This will need revisiting once Fleet gets real mutations (Phase 6 follow-up) or other features add real user actions.
- No delivery integration for EMAIL/SMS/PUSH notification channels (see Notifications & audit status above).
- No audit log viewer UI yet — `getAuditLog()` exists and works but nothing in the dashboard surfaces it. Would be a natural fit for a future `/admin` or settings page.

**Next recommended step:**
Phase 7 (Billing & Subscriptions) remains deferred pending explicit approval (payment gateway rule). Phase 9 (AI Assistant) or closing the remaining per-route Fleet permission guards (noted in the Phase 4 entry) are both reasonable next candidates — worth checking with the user.

### 2026-07-19 (Phase 6) - Claude Code

**Objective:**
Implement Phase 6 (Fleet Module Backend) per `docs/DEVELOPMENT_ROADMAP.md`, after the user explicitly approved proceeding past the mock-data gate ("proceed into Phase 6").

**Files changed:**
- `prisma/schema.prisma` (new `FleetVehicleDocument` model, `FleetDocumentRenewalStatus` enum, `FleetVehicle.nextServiceDueAt`/`serviceNotes` fields)
- `prisma/migrations/20260719070000_add_fleet_vehicle_documents/migration.sql` (new)
- `prisma/seed-fleet-documents.ts` (new, committed idempotent seed script)
- `lib/fleet/types.ts` (new — display-shape interfaces, extracted from the old mock module)
- `lib/fleet/service.ts` (new — real Prisma-backed data functions)
- `lib/fleet/index.ts` (now just re-exports types + service; mock arrays deleted)
- All 11 Fleet pages under `app/(dashboard)/fleet/` + `app/(dashboard)/dashboard/page.tsx`

**Summary:**
Read through all 11 Fleet pages first to catalog the exact display shapes (`VehicleRecord`, `OwnerRecord`, etc.) they depend on, since the roadmap's acceptance criterion is "existing fleet UI appearance does not change" — the goal was swapping the data source, not redesigning anything. Found one real gap: the Insurance & Roadworthy page displays per-vehicle insurer/policy-number/separate-expiry-date data that had no backing Prisma model at all — only a generic `documentStatus` enum existed on `FleetVehicle`. Added `FleetVehicleDocument` (plus two small `FleetVehicle` fields the vehicle cards needed: `nextServiceDueAt`, `serviceNotes`) via a new migration, generated and applied the same way as the earlier baseline migration (`prisma migrate diff --from-url` against live Neon, written into a proper migration folder, applied with `prisma migrate deploy`).

Built `lib/fleet/service.ts` with one function per data need (`getDashboardMetrics`, `getVehicles`, `getOwners`, `getDrivers`, `getVehicleDocuments`, `getMaintenanceRequests`, `getWorkAndPayContracts`, `getPayments`, `getReportSummary`, `getInvestorSummary`), each scoped by `organizationId` and mapping real Prisma records into the exact same display shapes the pages already expect, with enum→label mapping tables (e.g. `FleetVehicleStatus.AVAILABLE` → `"Active"`) and currency/date formatting helpers.

**Important discovery mid-implementation**: assumed the database was empty of Fleet data and wrote a seed script to replicate the mock dataset (Avalon Transport, Helix Fleet, etc.) — but `prisma/seed-fleet-demo.ts`'s own idempotency check correctly refused to run, because the live database already had real, richer seed data from the original 2026-07-04 setup (3 owners, 3 drivers, 4 vehicles, 3 maintenance requests, 4 payments, 3 work-and-pay contracts — all authentically Ghana-flavored: Kwaku Transport Services, driver Kojo Addai, plate "GR 4216-26", "Accra Fleet Yard", etc., including `Json` fields like `owner.history: { summary, revenueLabel }` and `driver.performanceMetrics: { onTimeRate, completedTrips }` that the service layer had to be adjusted to parse, since the initial implementation assumed plain strings). Deleted the fabricated seed script rather than run it — only `FleetVehicleDocument` genuinely had zero rows (new model), so wrote a small, real, committed seed script for just that (`prisma/seed-fleet-documents.ts`), matching realistic Ghanaian insurers to the 4 real existing vehicles.

Also corrected currency handling: the real data is in Ghanaian Cedis (`Organization.currency`, `owner.history.revenueLabel` like `"GHS 482,000"`), so `formatMoney()` now prefixes `GHS` instead of the mock module's `$` — using dollar signs on real Cedi figures would have been actively wrong, not just cosmetically different. Similarly, the mock's fabricated percentage deltas ("+12.8%") and invented "$9.2M fleet value" had no real data to back them, so the real report/investor summaries use `"Live"` as the trend label and "Fleet size" (a real count) instead of an invented valuation.

Verified all 12 pages (11 Fleet + `/dashboard`) end-to-end in a real browser logged in as Super Admin: confirmed real seeded data renders correctly (screenshots of `/dashboard`, `/fleet`, and `/fleet/vehicles` showed real vehicle/owner/driver names, correct counts, GHS-formatted amounts). An automated test flagged 3 pages as "errored" but this was a bug in the test's own regex (`/500/i` matching the substring "500" inside a real mileage figure "121,500 km"), not a real application error — confirmed by direct visual inspection and a follow-up `curl` fetch showing HTTP 200 and real owner names present with no error markers.

**Build result:**
Passed. `npm run build` completed successfully, 31 routes generated, TypeScript clean.

**Known issues:**
- Only `/fleet/settings` and `/fleet/investor-dashboard` have server-side permission guards (from the Phase 4 entry); the other 9 Fleet pages still only filter nav visibility, not route access.
- `getCurrentTenant()` is still called independently per page/component rather than cached per-request — noted in earlier entries too, now more relevant since every Fleet page also does its own data queries on top.
- Report/investor "trend" metrics show `"Live"` rather than a real percentage change, since there's no historical/time-series data yet to compute a real delta from.
- Two of the four seeded vehicles are missing `nextServiceDueAt`/`serviceNotes` values (they were `null` in the pre-existing 2026-07-04 seed data, added before those fields existed) — the UI correctly shows "—" / "No service history recorded" for these rather than fabricating values, but a real fleet manager would want these filled in.

**Next recommended step:**
Consider Phase 7 (Billing & Subscriptions) next per the roadmap, or close the remaining per-route permission gaps on the other 9 Fleet pages first. Either is reasonable — worth checking with the user which matters more before starting.

### 2026-07-19 (Phase 4) - Claude Code

**Objective:**
Continue following `docs/DEVELOPMENT_ROADMAP.md` per the user's request ("continue with the next, when done continue") — implement Phase 4 (Roles & Permissions), the next unbuilt phase after Phase 3.

**Files changed:**
- `lib/permissions/constants.ts` (new)
- `lib/permissions/index.ts` (new)
- `prisma/seed-rbac.ts` (new)
- `lib/tenant/index.ts` (extended `TenantContext` with `roleId` and `permissions`)
- `components/dashboard/Sidebar.tsx` (now an async Server Component, filters nav by permission)
- `app/(dashboard)/fleet/settings/page.tsx` (guarded with `requirePermission`)
- `app/(dashboard)/fleet/investor-dashboard/page.tsx` (guarded with `requirePermission`)

**Summary:**
The `Permission`/`RolePermission` tables existed in the schema since the Phase 1 foundation work but were completely empty — `SELECT * FROM "Permission"` returned `[]`. Designed a permission key catalog (`dashboard.view`, `fleet.view`, `fleet.vehicles.manage`, ... `org.settings.manage` — 12 keys total, one per sidebar nav item) and a role→permission mapping matching the 6 existing seeded roles: Super Admin and Organization Owner get everything; Fleet Manager gets all Fleet operational permissions but not investor/settings; Driver and Mechanic get a minimal set (dashboard, fleet view, maintenance); Investor gets dashboard, investor view, and reports only. Wrote this as a committed, idempotent seed script (`prisma/seed-rbac.ts`, run via `npx tsx`) rather than a one-off scratch script, since role/permission assignments are real application configuration that should be reproducible on a fresh database, not throwaway diagnostic data. Ran it against the live Neon database — output confirmed 12/12/10/3/3/3 permissions seeded per role respectively.

Split `lib/permissions/` into `constants.ts` (no `"server-only"` import — just the plain `PERMISSIONS` object) and `index.ts` (the real module, with `"server-only"` plus `hasPermission()`/`requirePermission()` helpers). This split was necessary because the seed script needs to import the permission keys but runs as a plain Node/tsx script outside Next.js, and importing something that pulls in `"server-only"` fails there (`Cannot find module 'server-only'` — that package relies on bundler-specific resolution that plain Node/tsx doesn't do). Extended `lib/tenant/`'s `getCurrentTenant()` to also include the membership's `roleId` and a flattened `permissions: string[]` (via `role.rolePermissions.permission.key`), computed in the same DB query that already resolves organization/branch — avoids a second round-trip per page.

Applied enforcement in two places: (1) `Sidebar` is now `async` and filters the nav array by `hasPermission(tenant, item.permission)` — a Driver literally cannot see links to Vehicles, Payments, Settings, etc. (2) The two most clearly role-restricted pages, Settings (`org.settings.manage`) and Investor Dashboard (`fleet.investor.view`), call `requirePermission()` at the top of the page component, which redirects to `/dashboard` if the check fails — this is real server-side enforcement, not just hidden UI, so a user can't bypass it by typing the URL directly. Deliberately did **not** add per-route guards to the other 9 Fleet pages yet (see Known Issues) to avoid duplicating near-identical guard boilerplate across mock-data pages that Phase 6 will rewrite anyway.

Verified end-to-end with a real headless-browser test (Playwright, installed temporarily then reverted, same pattern as prior entries): logged in as Super Admin — all 12 nav items shown, `/fleet/settings` reachable. Logged in as Driver (a temporary real password was set for `driver@demo.com` the same way the Super Admin's was set in an earlier entry, using the same one-off bcrypt script pattern, not committed) — nav showed exactly 3 items (Dashboard, Fleet Overview, Maintenance), and navigating directly to `/fleet/settings` by URL redirected to `/dashboard`, confirmed by screenshot.

**Build result:**
Passed. `npm run build` completed successfully, 31 routes generated.

**Known issues:**
- Only Settings and Investor Dashboard have server-side route guards; the other 9 Fleet pages only have nav-level (visibility) filtering, not enforcement — a Driver who guesses the URL for `/fleet/payments` today would still be able to view it (with mock data) even though they can't see it in nav. Not a real data-exposure risk yet since it's all shared mock data, but should be closed before Phase 6 wires in real per-organization data.
- `driver@demo.com` now has a known password (set during testing, not written anywhere in this repo) — same caveat as before: the other demo accounts (`owner@demo.com`, `fleet@demo.com`, `mechanic@demo.com`, `investor@demo.com`) still have unknown passwords.
- `getCurrentTenant()` runs its DB query independently in `Sidebar`, `Topbar`, and the profile page (three separate calls per dashboard page load) — fine for now, flagged as a caching opportunity in the previous entry too.

**Next recommended step:**
Either (a) extend `requirePermission()` guards to the remaining 9 Fleet pages for consistency, or (b) move on to Phase 5/6 groundwork (Fleet Module Backend) now that both tenancy and RBAC exist — but Phase 6 remains gated behind explicit user approval per the project rules above.

### 2026-07-19 (Phase 3) - Claude Code

**Objective:**
Follow `docs/DEVELOPMENT_ROADMAP.md` and implement Phase 3 (Multi-Tenancy), per the user's request to "follow the roadmap and do what's next" — this was already flagged as the recommended next step in the two prior handoff entries.

**Files changed:**
- `lib/tenant/index.ts` (new)
- `app/(dashboard)/auth-protection.tsx`
- `components/dashboard/Topbar.tsx`
- `app/profile/page.tsx`

**Summary:**
Added `lib/tenant/index.ts` with `getCurrentTenant()`/`requireCurrentTenant()`, which resolves the signed-in user's `Organization` and `Branch` (if any) by looking up their `OrganizationMember` row for the `organizationId` already on their session. This satisfies the Phase 3 acceptance criteria of "organization context available for authenticated users" and "branch support defined for fine-grained segmentation" — Organization and Branch models already existed in the schema from earlier work, so this phase was purely about the resolver layer, not new data models.

Wired it into three places: `DashboardAuthProtection` now calls `getCurrentTenant()` after the session check and shows a "No organization access" message (instead of the dashboard) if a signed-in user has no `OrganizationMember` row — enforcing tenant scoping at the platform level rather than leaving it optional. `Topbar` and the profile page now show `tenant.organization.name` (and branch name, if assigned) instead of the raw `organizationId` cuid that was being displayed literally before (e.g. "cmr6kkdre000ec41oevqxvls9") — this was a visible, concrete bug the user noticed from a screenshot during an earlier conversation.

Deliberately did **not** touch Fleet pages or wire any real data queries through this — Fleet backend (scoping actual business data by `organizationId`) is Phase 6 and is still explicitly gated by the project rule "Do not replace mock data with database data until the database integration phase is explicitly approved." This phase only builds the resolver capability; nothing consumes it for data scoping yet.

Verified with a headless-browser test (Playwright, installed temporarily then reverted — same as the previous entry, not a permanent dependency): logged in as `admin@rockfrostgroup.com`, confirmed via screenshot that the Topbar now reads "Tenant: Rock Frost Demo Fleet" / "Accra Fleet Yard · Role: Super Admin" instead of the raw ID.

**Build result:**
Passed. `npm run build` completed successfully, 31 routes generated. Note: the local dev server in this environment is currently very slow to compile on first interaction after a restart (Turbopack "Fast Refresh" took 15-25s in several test runs) — this is an environment/performance quirk, not a code issue; be patient with dev-server-based testing here rather than assuming a hang means a bug.

**Known issues:**
- Still only one dashboard view, shared by every role (see Dashboard status above). Building a real platform/`/admin` view for the SaaS owner is a separate, not-yet-started piece of work the user asked about but hasn't approved building yet.
- `getCurrentTenant()` does a fresh DB query on every call (Topbar, profile page, auth-protection all call it independently per request) — fine for now, but worth caching per-request (e.g. React `cache()`) if it becomes a hot path once more pages consume it.
- Phase 4 (Roles & Permissions enforcement) is still not built — `role` is available on the session and now used for display, but nothing actually restricts access based on it.

**Next recommended step:**
Phase 4 (Roles & Permissions) is the natural next roadmap item — enforce role-based authorization in the UI/backend now that role is reliably available via session + tenant context. Alternatively, revisit the `/admin` platform dashboard question with the user now that tenant context exists to build it on top of.

### 2026-07-19 (later still) - Claude Code

**Objective:**
Fix a bug reported by the user immediately after the previous entry: logging in with the correct credentials just returned to `/login` instead of reaching `/dashboard`.

**Files changed:**
- `app/(auth)/login/page.tsx`

**Summary:**
The login page was a plain HTML `<form action="/api/auth/callback/credentials" method="post">` with no CSRF token field. NextAuth v4's credentials callback requires a `csrfToken` submitted with the POST (bound to a `next-auth.csrf-token` cookie) — without it, every submission was silently rejected and NextAuth redirected back to `pages.error: "/login"`, which looks identical to the plain login page with no visible error. This is why the "any password works" stub from the earlier handoff entry appeared to work when tested via `curl` (I manually fetched and attached a CSRF token there) but never worked from the actual browser form, which never sent one.

Rather than hand-plumbing CSRF cookie forwarding through a Server Component (which has its own gotchas — an internal server-side `fetch` to `/api/auth/csrf` can't propagate its `Set-Cookie` into the page's own response), converted the login page to a `"use client"` component that calls `signIn("credentials", { email, password, callbackUrl: "/dashboard", redirect: false })` from `next-auth/react` on submit. This is the standard, well-supported approach and handles CSRF token fetching/submission internally via the browser's own fetch + cookie jar. Also added a visible error message ("Invalid email or password.") on failed login and a disabled/"Signing in..." state on the submit button, since silently doing nothing on failure was part of what made the original bug confusing.

Verified with a real headless-browser test (Playwright, installed temporarily for this one test then reverted from `package.json`/`package-lock.json` — not a permanent project dependency): wrong password stays on `/login` and shows the error message; correct password (`admin@rockfrostgroup.com` / the password set in the previous entry) reaches `/dashboard` and renders the real Fleet dashboard with "Rock Frost Super Admin" / "Super Admin" in the topbar, confirmed via screenshot.

**Build result:**
Passed. `npm run build` completed successfully, 31 routes generated.

**Known issues:**
- None new. Same outstanding items as the previous entry (forgot-password/reset-password/invite are UI-only, no rate limiting on login attempts).

**Next recommended step:**
Same as previous entry — build password reset before onboarding other real users, and decide on `getMockSession()` cleanup in `lib/auth/session.ts`.

### 2026-07-19 (later) - Claude Code

**Objective:**
Replace the stubbed NextAuth `authorize()` (which accepted any email/password) with real credential verification, and issue the business owner a working login to their own dashboard, at the user's explicit request to move toward production auth now that the database is reconciled.

**Files changed:**
- `lib/auth/nextauth.ts` (real `authorize()` against `User`/`OrganizationMember`/`Role`)
- `package.json` / `package-lock.json` (added `bcryptjs`, `@types/bcryptjs`)
- Live Neon database: set a real bcrypt password hash on `admin@rockfrostgroup.com` (no schema change)
- `OPERATOR_HANDOFF.md`

**Summary:**
`authorize()` previously returned a hardcoded `{ id: "demo-user", ... }` for any non-empty email/password. Rewrote it to look up the user by email, require `status === 'ACTIVE'` and a non-null `passwordHash`, verify the submitted password with `bcrypt.compare`, and populate the session from the user's actual first `OrganizationMember`/`Role` row rather than hardcoded `"demo-organization"`/`"Administrator"`. `lastLoginAt` is updated on success. Chose `admin@rockfrostgroup.com` (role: Super Admin, seeded already, real company domain) as the owner's login rather than one of the `*@demo.com` persona accounts, since the user asked for their own owner credentials to the business suite as a whole. Generated a secure random password, hashed it, and wrote it directly to the `User.passwordHash` column via a one-off script (not committed) — the plaintext password was given to the user directly in chat, not stored in the repo.

Verified end-to-end against the real dev server (no browser automation tooling was installed, so this was driven directly through NextAuth's HTTP API, which exercises the exact same `authorize()` code path a browser form submission would): CSRF token fetched, POST to `/api/auth/callback/credentials` with the correct password returned a `200` with a session cookie, and `/api/auth/session` showed the real user (`Rock Frost Super Admin`, correct `organizationId`, `role: "Super Admin"`) — not the old hardcoded demo user. A second test with a deliberately wrong password correctly returned `401 Unauthorized` with no session created, confirming the previous "any password works" behavior is gone.

**Build result:**
Passed. `npm run build` completed successfully, 31 routes generated.

**Known issues:**
- Only `admin@rockfrostgroup.com` has a real, known password. The other 5 seeded demo accounts (`owner@demo.com`, `fleet@demo.com`, `driver@demo.com`, `mechanic@demo.com`, `investor@demo.com`) still have whatever `passwordHash` was set when they were originally seeded (by the untracked `scripts/apply-neon-migrations.ts`) — nobody currently knows those passwords. They'll need new passwords set the same way if those personas need to log in.
- Forgot-password, reset-password, and invite flows are still UI-only placeholders with no backing logic — a user who forgets their password currently has no self-service way to recover it.
- No rate limiting/lockout on repeated failed login attempts yet.
- `getMockSession()` in `lib/auth/session.ts` still exists but is unused by the real auth path now in place — worth removing once confirmed nothing references it.

**Next recommended step:**
Decide whether to keep `admin@rockfrostgroup.com` as the primary login going forward or migrate the owner identity to a personal email; then build out password reset (needed for real production use) before inviting any other real users.

### 2026-07-19 (Claude Code)

**Objective:**
Apply the pending Prisma migration to the live Neon database, following up on the 2026-07-18 handoff entry.

**Files changed:**
- `prisma/schema.prisma` (added 11 `Organization` fields and 2 indexes that were already live in production but missing locally)
- `prisma/migrations/20260718054200_init/` (deleted — generated against a false "empty database" assumption)
- `prisma/migrations/20260704162000_baseline_production_schema/migration.sql` (new baseline migration)
- `OPERATOR_HANDOFF.md`

**Summary:**
The P1001 connection timeout from 2026-07-18 was diagnosed and it was NOT a Neon or credentials issue. Proton VPN was active on the machine and was silently mangling the Postgres wire protocol after the TCP handshake completed (confirmed via raw TCP test, `openssl s_client -starttls postgres`, and by disabling the VPN adapter). Once connectivity was restored, `npx prisma migrate status` revealed the Neon database was **not empty** — it already had all 22 tables built out, with real seeded data (1 Organization, 6 Users), applied via 3 migrations (`20260616060114_init_glv_v1`, `20260703051200_initial_infrastructure_foundation`, `20260703070000_add_organization_core_fields`) that exist in the DB's `_prisma_migrations` table but were **never committed to this git repository**. Those migrations were originally run by a local script, `scripts/apply-neon-migrations.ts`, that also does not exist anywhere in this repo's history — it only ever existed on whichever machine ran it on 2026-07-04. A second run of that script on 2026-07-17 failed (`relation "User" already exists`), leaving a broken `_prisma_migrations` row with `finished_at: null`.

Introspecting the live database (`prisma db pull`) showed the `Organization` table has 11 real columns (`country`, `city`, `taxNumber`, `phone`, `email`, `website`, `logoUrl`, `businessRegistrationNumber`, `region`, `currency`, `defaultLanguage`) plus 2 indexes that were **not** present in this repo's `prisma/schema.prisma` — the auto-generated diff would have `DROP COLUMN`ed all of them. Confirmed with the user before proceeding (real data was at stake), then: added those fields back to `schema.prisma` (diff against live DB is now empty); deleted the stale untracked `20260718054200_init` migration (it assumed an empty DB and would have failed/conflicted); created a new migration `20260704162000_baseline_production_schema` containing the full current schema and marked it applied via `prisma migrate resolve --applied` (does not execute against the live DB, only records history); resolved the broken migration record via `prisma migrate resolve --rolled-back 20260616060114_init_glv_v1`. `npx prisma migrate status` now reports "Database schema is up to date!". No application code, mock data, or live data was touched.

**Build result:**
Passed. `npm run build` completed successfully, 31 routes generated.

**Known issues:**
- `scripts/apply-neon-migrations.ts` (the script that originally built the live schema) is not in this repository. If it still exists on another machine, it should be recovered and committed, or retired in favor of the standard `prisma migrate` workflow now that history is baselined.
- Proton VPN interfering with Postgres (port 5432) connections is a known trap in this environment — if `P1001` errors recur, check whether the VPN tunnel adapter is up before assuming a Neon/credentials problem.
- `DIRECT_URL` is still set to the same pooled endpoint as `DATABASE_URL` (carried over from the 2026-07-18 entry) — should be pointed at the real non-pooled endpoint once confirmed reachable.
- No application code was wired to the database in this session; Fleet pages still use mock data.

**Next recommended step:**
Build `lib/tenant/` (Phase 3) — the tenancy models already exist in the schema and the database is now in a known-good, git-tracked state. Before any future migration work, always check `npx prisma migrate status` first rather than assuming the database's state from documentation alone.

### 2026-07-18 05:42 +00:00 - Claude Code

**Objective:**
Begin Phase 5 (Database & Prisma Setup) by connecting the existing Prisma schema to a real PostgreSQL database (Neon) and producing an initial tracked migration.

**Files changed:**
- `.env` (DATABASE_URL / DIRECT_URL set to a Neon Postgres instance; not committed, gitignored)
- `prisma/migrations/20260718054200_init/migration.sql` (generated offline via `prisma migrate diff --from-empty`, not yet applied to the live database)
- `prisma/migrations/migration_lock.toml`
- `OPERATOR_HANDOFF.md`

**Summary:**
User supplied a Neon `DATABASE_URL`. `.env` already existed in the working tree with `NEXTAUTH_SECRET`/`NEXTAUTH_URL`/Resend vars pre-populated; only `DATABASE_URL`/`DIRECT_URL` needed reconciling. `npx prisma validate` and `npx prisma generate` both succeeded — the schema is valid and the client builds. However, `npx prisma migrate dev` could not complete: the schema/query engine reaches TCP-level connectivity to the Neon host (confirmed via raw TCP test and `Test-NetConnection`, both succeed) but the Postgres/TLS handshake itself never completes, timing out with `P1001`. This reproduced identically against both the pooled and direct-compute hostnames, with and without `channel_binding`, so it is not a credentials or schema issue — it looks like this sandboxed shell's network path (routed through a VPN/tunnel interface) allows the TCP handshake but blocks/mangles the actual Postgres wire protocol. Worked around this by generating the init migration SQL offline (`prisma migrate diff --from-empty --to-schema-datamodel`), which does not require a live DB connection, and committing it as a proper tracked migration folder. **The migration has NOT been applied to the live Neon database yet** — no tables exist there. `lib/db.ts` and all Fleet pages still use mock data; nothing was wired to the database in application code.

**Build result:**
Passed. `npm run build` completed successfully, 30 routes generated, unchanged from baseline.

**Known issues:**
- The initial migration is generated but unapplied — the Neon database currently has no tables.
- This execution environment appears unable to complete outbound Postgres/TLS handshakes (TCP opens, protocol handshake hangs) — needs to be applied from an environment with real DB egress (the user's own machine, a CI runner, or Neon's SQL editor/console using the contents of `prisma/migrations/20260718054200_init/migration.sql`).
- `DIRECT_URL` is currently set to the same pooled endpoint as `DATABASE_URL` since the derived non-pooler hostname (`ep-crimson-star-ah27j3if.c-3.us-east-1.aws.neon.tech`) was unreachable from this environment too — this should be re-verified once a working connection path is confirmed.

**Next recommended step:**
Apply `prisma/migrations/20260718054200_init/migration.sql` to the Neon database from an environment with working egress (`npx prisma migrate deploy`, or paste the SQL into Neon's SQL editor). Once applied, verify with `npx prisma migrate status`, then proceed to building `lib/tenant/` (Phase 3) — the tenancy models already exist in the schema.

### 2026-07-03 04:43 +00:00 - Codex

**Objective:**
Create the Engineering Operating System documentation for Rock Frost Technologies without modifying application code or UI.

**Files changed:**
- `ai/AGENT_RULES.md`
- `ai/PROJECT_CONTEXT.md`
- `ai/DECISION_LOG.md`
- `ai/CODING_STANDARDS.md`
- `ai/PROMPT_LIBRARY.md`
- `ai/VISION.md`
- `ai/RELEASE_PROCESS.md`
- `ai/MODULE_GUIDELINES.md`
- `ai/UI_GUIDELINES.md`
- `ai/AI_COLLABORATION.md`
- `OPERATOR_HANDOFF.md`

**Summary:**
Added a root-level `/ai` documentation system covering agent rules, project context, architectural decision logging, coding standards, reusable prompts, company/product vision, release process, module guidelines, UI guidelines, and multi-agent collaboration. No application code, UI, or routes were modified.

**Build result:**
Passed. `npm run build` completed successfully with Next.js 16.2.9 and generated 30 app routes.

**Known issues:**
- The working tree still contains pre-existing uncommitted auth/dashboard changes and Prisma foundation changes unrelated to this documentation-only session.
- `docs/DATABASE_SCHEMA_PLAN.md` is still not present.
- Planned routes `/settings`, `/notifications`, `/admin`, and `/organizations` are still not implemented as root routes.

**Next recommended step:**
Commit the `/ai` operating-system documentation and handoff update as a focused documentation commit, then separately review and commit the existing auth/dashboard/Prisma work.

### 2026-07-03 04:28 +00:00 - Codex

**Objective:**
Create the first shared operator handoff file for all AI coding agents and record the current repository state.

**Files changed:**
- `OPERATOR_HANDOFF.md`

**Summary:**
Documented mandatory agent workflow, project rules, current project state, key routes, and reusable handoff template. The first handoff summarizes the project history so far: public Rock Frost website created, GitHub repository connected, domain and email configured, Fleet SaaS module UI created, Architecture Bible created, Development Roadmap created, Platform Core UI created, authentication foundation started, dashboard route protection added, profile menu/page added, and Prisma/database foundation started in the current working tree. Prisma/database is the current foundation area and should remain separate from UI data wiring until approved.

**Build result:**
Passed. `npm run build` completed successfully with Next.js 16.2.9 and generated 30 app routes.

**Known issues:**
- `docs/DATABASE_SCHEMA_PLAN.md` is referenced by prior planning but does not currently exist.
- Several planned routes are listed for roadmap visibility but do not currently exist: `/settings`, `/notifications`, `/admin`, and `/organizations`.
- The working tree includes pre-existing uncommitted auth/dashboard changes and Prisma foundation changes.

**Next recommended step:**
Commit the operator handoff file intentionally, then commit the Prisma/database foundation separately or together with the relevant package changes after reviewing the full working tree.

## Handoff Log Template

### YYYY-MM-DD HH:mm - Agent Name

**Objective:**

**Files changed:**

**Summary:**

**Build result:**

**Known issues:**

**Next recommended step:**
