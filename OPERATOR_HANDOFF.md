# Rock Frost Business Suite — Operator Handoff

## 2026-07-26 — RF favicon and installed-app icons

Replaced the generic geometric SVG favicon with the supplied `public/rf logo.png`. The source remains unchanged; its alpha bounds were tightly cropped and the full RF mark was centered on a brand-navy rounded square. Added Next.js file-convention assets at `src/app/favicon.ico` (16/32/48), `src/app/icon.png` (32), and `src/app/apple-icon.png` (180), plus manifest icons at `public/icon-192.png` and `public/icon-512.png`. Removed the explicit root metadata icon override and the obsolete SVG assets so Next.js emits the correct size/type metadata automatically. Updated `public/manifest.webmanifest` and `docs/DESIGN_SYSTEM.md`.

Validation passed: generated dimensions and all three embedded ICO sizes verified, manifest JSON parsed successfully, ESLint, TypeScript, all 200 tests across 29 files, and the Next.js production build (133 generated routes, including `/icon.png` and `/apple-icon.png`).

## 2026-07-26 — Concurrent owner and tenant sessions by subdomain

Implemented host-separated authentication so the same browser profile can remain signed in as a platform owner and tenant simultaneously. `admin.rockfrostgroup.com` is the platform control plane, `app.rockfrostgroup.com` is the tenant workspace, and `www.rockfrostgroup.com` remains public. NextAuth's session-token cookie is explicitly host-only, credential login rejects identities on the wrong surface, and the authenticated app layout independently repeats the host/role check. `src/proxy.ts` routes legacy and cross-surface URLs but is not relied on as the sole authorization gate.

Invitation links and payment callbacks now target `app.*`; password-reset links preserve the requesting surface; sign-out callbacks preserve the current origin; and authentication redirects allow only the three trusted origins (plus local development). Vercel project domains `admin.rockfrostgroup.com` and `app.rockfrostgroup.com` were attached. Cloudflare has unproxied `admin` and `app` CNAME records pointing to `a39ecc209697275a.vercel-dns-017.com`; Vercel reports both domains verified and configured correctly.

Validation passed: ESLint, TypeScript, Prisma schema validation, all 197 tests across 28 files, and the Next.js production build (116 routes plus Proxy).

Commit `5d346fb` was pushed to `main` and deployed successfully as production deployment `dpl_HTfRzYVUvvQALvtgsfxs1tmxe3fa` (`READY`). All three aliases resolve to that deployment. Live HTTP verification passed: `www/login` redirects to `app/login`, legacy `www/app/platform/*` redirects to `admin/app/platform/*`, both subdomain roots redirect to their own `/login`, and both login pages return HTTP 200. The one-hour post-deploy error scan was clean.

## 2026-07-26 — Immutable platform-owner/tenant identity boundary

Root cause of the reported owner-to-tenant workspace jump was a three-part identity-resolution conflict: tenant creation could attach the platform owner's existing `User` to an `Organization Owner` membership; NextAuth selected the earliest membership; and `getCurrentTenant()` preferred the `active_org` cookie. The fix establishes the active global system `Super Admin` membership as the immutable platform identity in `src/lib/auth/platform-identity.ts`. NextAuth and tenant resolution now canonicalize that identity to the internal platform anchor before any cookie/JWT fallback, tenant context hides all non-anchor memberships, and the switch action clears the organization cookie and returns the owner to the platform dashboard.

Tenant creation and invitation now reject a platform identity's email, including transaction-time rechecks. Migration `20260726050000_enforce_platform_owner_isolation` idempotently marks historical tenant memberships `REMOVED`, revokes associated pending invitations, and increments affected users' `sessionVersion`. `scripts/repair-platform-owner-isolation.ts` and `npm run db:repair-platform-owner-isolation` provide the equivalent operator repair/check.

Verification passed: the focused identity suite (31 tests), ESLint, TypeScript, Prisma schema validation, all 186 tests across 26 files, and the Next.js production build (116 generated routes). The direct local repair command could not connect to the configured Neon endpoint (`ep-crimson-star-ah27j3if-pooler.c-3.us-east-1.aws.neon.tech:5432`), so live data cleanup was delegated to the deployment migration.

Commit `5525750` was pushed to `main` and deployed successfully to production as Vercel deployment `dpl_GPDCZuk7x6bCxs4x4NDKNt3Lya9d`, aliased to `https://www.rockfrostgroup.com`. The production build connected to Neon and reported no pending migrations, confirming the cleanup migration had already been applied by the Git-triggered deployment. The deployment is `READY`; the one-hour post-deploy error-log scan was clean. Direct row-by-row verification from the local machine remains unavailable because its Neon pooler endpoint cannot be reached.

## 2026-07-26 — UI/UX and profile-thumbnail quality pass

Vetted the platform-owner and profile experience after the identity-boundary work. The small tiled control beside the account avatar was the tenant Module Launcher, which `AppShell` rendered unconditionally; platform layout now disables it. `UserMenu` previously rendered only `AvatarFallback`, so uploaded images could never appear there. It now renders `AvatarImage` when present and a clean initials fallback otherwise.

Replaced the raw profile file input with a responsive photo editor including preview, accessible picker, format/size guidance, selected filename, pending state, inline errors, and success feedback. Added authenticated `/api/account/profile` retrieval with `private, no-store` caching plus immediate refresh after upload. The image remains out of JWT cookies to avoid exceeding cookie-size limits. Added app-wide loading skeletons and a recoverable runtime error boundary. Full findings are in `docs/UI_UX_QUALITY_AUDIT_2026-07-26.md`.

Verification passed: ESLint, TypeScript, all 182 unit tests across 25 files, and the Next.js production build (116 routes). Browser-control backends were unavailable during this pass, so no claim of an automated authenticated screenshot walkthrough is made.

## 2026-07-26 — Platform-owner and tenant-workspace boundary

Fixed the underlying route/context conflict reported by the user. The shared account dropdown previously hardcoded `/app/account` and `/app/administration`, placing a platform Super Admin inside the tenant `(overview)` shell. Platform operators now use `/app/platform/account` and `/app/platform/settings`; account mutations preserve the originating account route. The tenant overview layout rejects platform operators server-side, and business-module access sends them back to `/app/platform/dashboard`.

The platform `AppShell` no longer receives the internal anchor as organization-switcher data, and its desktop/mobile logo links to the platform dashboard rather than the tenant dashboard. Tenant behavior remains unchanged for future customer users. The authoritative boundary is documented in `docs/PLATFORM_IDENTITY_BOUNDARY.md`.

## 2026-07-26 — Internal platform anchor excluded from tenant surfaces

Corrected the platform UI after the user rightly observed that the required internal authorization anchor was displayed as a tenant. Organizations carrying an active system Super Admin membership are now excluded centrally from platform tenant counts, active-member/module-adoption totals, organization lists, request/subscription selectors, and direct tenant detail/configuration routes. The clean bootstrap also marks the anchor with `metadata.isPlatformAnchor = true`. With the current clean database, every customer-tenant surface reports zero organizations while the single platform owner can still authenticate.

## 2026-07-26 — Single platform-owner identity

Superseding the two-identity bootstrap below at the user's direction, the live database was reset again and now contains exactly one user and one membership: `owner@rockfrostgroup.com`, named Rock Frost Platform Owner, with the system `Super Admin` role. There is no Organization Owner or customer-tenant login. The one remaining organization is the protected internal platform anchor required by the current membership-based authorization model, not a customer tenant.

The default login callback now targets `/app`; that server route sends platform operators to `/app/platform/dashboard` and tenant users (when real customer tenants are later onboarded) to `/app/dashboard`. Post-reset counts: 1 user, 1 internal platform organization, 1 membership, 17 roles, 78 permissions, and 11 module definitions. The new plaintext password was returned only to the user and is not recorded here.

## 2026-07-26 — Clean production platform reset

At the user's explicit request, the configured `neondb.public` database was reset with `scripts/reset-platform.ts`. All 77 application tables were truncated while `_prisma_migrations` was preserved. The canonical platform catalog was reseeded and one fresh platform anchor was created with separate Super Admin and Organization Owner identities. No demo tenants, module transactions, subscriptions, requests, notifications, or audit history were recreated.

Post-reset counts: 2 users, 1 organization, 2 memberships, 17 system roles, 78 permissions, and 11 active module definitions. Plaintext bootstrap passwords were returned directly to the user and were not written to this repository or documentation. The existing sequential catalog seed was converted to bulk permission/grant insertion so clean bootstraps complete reliably over the remote Neon connection.

## 2026-07-26 — Account, tenant, and platform settings

Implemented editable user profiles (name, phone, sign-in email), bounded profile-picture uploads, authenticated password changes, tenant logo uploads, tenant backup/recovery policy controls, and tenant-wide theme defaults. Email and password changes revoke existing sessions. Organization administrators can remove tenant access without deleting a shared user identity; self-removal and removal of the final active Organization Owner are blocked.

The platform organization-deletion recovery period is no longer a source constant. Platform operators manage it at `/app/platform/settings`; it is persisted in the platform anchor organization's metadata, so no schema migration is required. Tenant controls live at `/app/organization/settings`, linked from Administration. Detailed behavior and infrastructure boundaries are documented in `docs/ACCOUNT_AND_TENANT_SETTINGS.md`.

Verification: Prisma client generation, lint, TypeScript compilation, and the Next.js production build pass (114 routes). Commit and deployment status should be recorded below once completed.

## 2026-07-26 — Completed requests leave the operator queue

Approving and enabling an existing module now sets its `ModuleRequest` to
`COMPLETED` instead of leaving it at `APPROVED`. The platform request query
excludes `COMPLETED`, `CANCELLED`, and `REJECTED`, keeping the work pane
actionable while preserving every request and audit event in storage.
Regression coverage now asserts the completed transition.

## 2026-07-26 — Public acquisition, onboarding, billing, and subscriptions

**Implemented:** Public `/modules` cards now send visitors to a module-specific
demo or module request form. The contact form persists phone/WhatsApp,
preferred communication channel, intent, exact module, expected users,
industry, and country; validates module/phone requirements; emails the sales
address; and creates an in-app notification for every active platform Super
Admin. `/app/platform/requests` shows the enquiry with email/call/WhatsApp
actions and a direct **Create organization from inquiry** path.

Organization onboarding now prefills the customer/company fields from the
enquiry. Tenant codes are generated server-side from the organization name
with collision-safe suffixes and are no longer operator-entered. Creating the
organization still creates/invites its owner and now converts the enquiry into
a first-class `DEMO`, `ENABLE_EXISTING`, or `CUSTOM_MODULE` request.

`/app/platform/subscriptions` is now a working operator ledger. It supports
manual/offline agreements and platform-managed subscriptions, agreed
price/currency, duration, auto-renew intent, linked module requests, payment
confirmation, activation, cancellation, audit logging, and organization
notifications. Payment confirmation calculates the term end, enables the
module, and completes the linked request. Once a module has subscription
history, `getCurrentTenant()` exposes it only during a current paid `ACTIVE`
term; legacy non-subscription module activations remain compatible.

**Payment boundary:** No card/mobile-money gateway was present or selected.
`PLATFORM_MANAGED` is therefore a real lifecycle/renewal classification, but
an operator must confirm a payment reference before activation. The system
does not falsely claim online payment processing. A future signed provider
webhook should reuse `activateSubscription()`.

**Schema/migration:** Added enquiry/contact enums and fields plus the
`Subscription` model in
`20260726020000_add_acquisition_and_subscriptions`. A concurrent compatible
follow-up, `20260726030000_add_subscription_payment_gateway`, reserves
Paystack/Flutterwave provider metadata and adds server-only initialization,
verification, and signature/hash-verification adapters plus documented
optional environment variables. No checkout/callback/webhook routes call
those adapters yet, so this does not claim a working end-user gateway.
Prisma format/generate completed. The migrations were **not applied from this
workstation**:
both `DATABASE_URL` and `DIRECT_URL` currently point to the pooled endpoint;
retrying with the derived direct endpoint still returned Prisma's generic
`Schema engine error`, and a direct Prisma query confirmed that this
environment cannot reach the Neon host at all. The repository's Vercel build
runs `prisma migrate deploy` before `next build`; verify that remote migration
succeeds before treating the deployment as live. No environment file was
modified and no credential was printed.

**Validation:** `npx tsc --noEmit` passed; `npm run lint` passed; `npm run
test` passed (23 files, 164 tests); `npm run build` passed on Next.js 16.2.9,
including TypeScript and all 107 routes. Added regression coverage for
module-specific operator notifications, subscription creation/activation,
module enablement, request completion, and expired-term access denial.

**Documentation:** Added `docs/BILLING_AND_SUBSCRIPTIONS.md`; updated README,
the development roadmap, hardening plan, module registry commentary, and this
handoff. The earlier test-suite repair documentation remains immediately
below.

## 2026-07-26 — Documentation discipline and test-suite repair

**Why:** A shared-agent audit of the five commits preceding this entry found
that three included relevant documentation, while
`18221a1` (Fleet document renewal notifications) and `ed644f8`
(Installment ownership/salary-eligibility hardening) did not update an
authoritative current-state document in the same commit.

**Durable process fix:** `AGENTS.md` now requires every code/schema/config/
behavior/test change to update the relevant authoritative documentation and
`OPERATOR_HANDOFF.md`, keep tests and documented counts synchronized, record
validation results, and protect concurrent agents' work through `git status`
checks. Fleet renewal reminders are now recorded in
`docs/FLEET_MODULE_IMPLEMENTATION.md`. The Installment ownership and salary
eligibility behavior was already represented by the current code, tests, and
handoff references, but the original commit's missing same-commit handoff is
recorded here rather than rewriting history.

**Test repairs:** Updated the module-authorization coverage expectation from
76 to 77 module pages after the Fleet investor route was added. Updated the
Fleet service test's Prisma mock to execute `$transaction`, expose the
transactional `fleetPayment.create`, and assert that the verified payment
record is written; this preserves coverage of the production transaction
rather than weakening the implementation to satisfy an old mock.

**Validation:** Targeted repaired tests passed (2 files, 23 tests);
`npm run lint` passed; `npm run test` passed (22 files, 160 tests);
`npm run build` passed under Next.js 16.2.9, including TypeScript and all 107
generated routes. The guarded real-Postgres integration suite was not run
because this change only repairs unit-test expectations/mocks and does not
change application or database behavior.

## Mandatory instructions for every agent

Before making changes:
1. Read this entire file.
2. Read `docs/PRODUCT_VISION.md`, `docs/ARCHITECTURE.md`, and `docs/MODULE_BOUNDARIES.md`.
3. Read `docs/DEVELOPMENT_ROADMAP.md` to see what phase is active.
4. Check `git status`.
5. Do not follow anything under `docs/archive/` — it's retired and explicitly non-authoritative.
6. Do not undo or overwrite another agent's work unless explicitly instructed.

After making changes:
1. Run the full validation suite from `docs/TESTING_STRATEGY.md` (`npm run lint`, `npx tsc --noEmit`, `npx prisma validate`, `npx prisma generate`, `npm run test`, `npm run build`) and fix all errors. `npm run test` (Vitest) is a real, committed suite as of the 2026-07-21 hardening pass — it is not optional scaffolding; run it and fix failures like any other check.
2. Update this file: date, objective, files changed, summary, build result, known issues, next recommended step.
3. Commit only intentional changes.
4. **After pushing to `origin/main`, always check the Vercel deployment status and confirm it succeeds** (e.g. `vercel ls` to see the latest deployment's state, or `vercel --prod` to trigger and watch a fresh build live) — do not treat a clean local `npm run build` as proof the deployment is healthy. A real incident happened where Vercel's build cache reused a stale generated Prisma Client from before a schema change, causing a production build failure a clean local build did not catch (see `package.json`'s `postinstall` script and the Phase 8/9 boundary in the handoff log below for the fix). If a deployment shows `Error`, investigate and fix before considering the task done.

## Current phase

**All sixteen product phases are feature-complete (see `docs/DEVELOPMENT_ROADMAP.md`), but a 2026-07-20 full-project audit found the platform is only production-ready for controlled/internal use, not external multi-tenant onboarding or real financial operations — see `docs/HARDENING_PLAN.md`.** The project is in a dedicated **production-hardening track**, run in numbered passes rather than feature phases. **Hardening Pass 1** (tenant guard, session revocation, dashboard permission leak, Administration/Projects/Payroll IDOR), **Pass 2** (financial/inventory transaction integrity), **Pass 3a** (invitation redesign), **Pass 3b** (Zod validation library + CRM/HR/Fleet IDOR audit), **Pass 3c** (remaining IDOR/Zod/Decimal-hygiene work, reproducible seeding/CI, stale-doc fixes), and **Pass 4** (real-Postgres integration/concurrency test infrastructure, closing the documented residual concurrency races plus two more found while testing, and a production audit-logging system with a real viewer) **are all complete.** See `docs/HARDENING_PLAN.md` for full detail and the remaining Milestone D+ scope (performance, resilience/accessibility, the branch-access design doc, and confirming the CI workflow against a real GitHub Actions run — still unverified from this environment).

**Billing/Subscriptions is no longer a placeholder.** A prior, undocumented pass (commits `54226be`/`d5eba17`/`2312aa9`/`18221a1`/`ed644f8` — **not previously logged in this file**, a gap in itself; see the note at the end of the entry below) had already built the full acquisition pipeline (`/contact` → platform inquiry inbox → organization creation with auto-generated tenant codes and prefilled fields → `Subscription` record with a `MANUAL_OFFLINE`/`PLATFORM_MANAGED` mode) and reserved but never wired `PAYSTACK`/`FLUTTERWAVE` as gateway-provider values. This pass (below) connects that reservation to real Paystack and Flutterwave checkout, a tenant-facing billing page, and both providers' webhooks. See `docs/BILLING_AND_SUBSCRIPTIONS.md` for the full design.

## Current architecture (short version — see `docs/ARCHITECTURE.md` for full detail)

- Next.js 16 App Router under `src/app/`. Public marketing site at bare paths via `(public)`; auth UI via `(auth)`; **everything requiring sign-in lives under `/app/*`** — `app/(overview)` (organization scope), `app/fleet`, `app/installment`, `app/crm`, `app/inventory`, `app/accounting`, `app/hr`, `app/procurement`, `app/payroll`, `app/analytics`, `app/pos`, `app/projects`, `app/platform` (platform scope). See `docs/ARCHITECTURE.md`'s "Why /app exists."
- Each module (`fleet`, `installment`, `crm`, `inventory`, `accounting`, `hr`, `procurement`, `payroll`, `analytics`, `pos`, `projects`) has its own `layout.tsx` rendering `AppShell` with its own navigation array, guarded on `canAccessModule()` (module enabled for the org + a permission under that module's registered `permissionPrefix`).
- `src/platform/modules/registry.ts` is the single source of truth for every module's metadata; `src/platform/modules/dashboard-widgets.tsx` maps a module key to a real dashboard summary component — every business module except Analytics (which has no natural summary distinct from its own pages) is wired up.
- shadcn/ui (Base UI primitives) + Tailwind v4 design system — see `docs/DESIGN_SYSTEM.md`.
- **All eleven business modules are fully real.** Fleet Management (Phase 6), Installment Management (Phase 7), CRM (Phase 8), Inventory Management (Phase 9), Accounting (Phase 10), Human Resources (Phase 11), Procurement (Phase 12), Payroll (Phase 13), Analytics (Phase 14), Point of Sale (Phase 15), and Project Management (Phase 16) are all complete — every module from the original `docs/PRODUCT_VISION.md` list, plus POS added by explicit request. Only a future Billing/Subscriptions module remains unbuilt. See `docs/AUTHENTICATION_AND_AUTHORIZATION.md` and `docs/MODULE_BOUNDARIES.md` for full detail.
- **Every mutating Server Action that redirects to a list page calls `revalidatePath()` on that page immediately before the `redirect()`** — a systemic gap discovered and fixed during Phase 8 across every action file that existed at the time; every module built since (Inventory, Accounting, HR, Procurement, Payroll, POS, Projects) was written with this pattern from the start.
- **`package.json` has a `"postinstall": "prisma generate"` script** (added after Phase 9) — required because Vercel's build can reuse a cached `node_modules` (including an already-generated Prisma Client) across deployments without regenerating it, which caused a real production build failure right after Phase 8/9 shipped. **Always check deployment status after pushing** (see the "After making changes" checklist above) — this is a standing rule, checked after every phase since (Accounting through POS all confirmed `READY` via `vercel --prod`).
- **Two modules now call directly into a second module's service function as real, load-bearing behavior** (not just a UI shell): Procurement's receiving flow and POS's checkout/refund flow both call Inventory's own `recordMovement()` — receiving posts a stock `RECEIPT`, a POS sale posts an `ISSUE` and a refund reverses it with a `RECEIPT`. Both are deliberate, documented cross-module integrations (see `docs/DECISIONS.md`'s two 2026-07-20 entries, and `docs/MODULE_BOUNDARIES.md`) — the template for any future integration of this kind is the same: call the other module's public service function, never its Prisma models directly, and record the decision.
- **Analytics owns no database tables** — it's the one module built without a migration, a pure aggregation layer over every other enabled module's own summary function.
- `prisma/schema.prisma` changes since Phase 3's reconnection: `User.failedLoginAttempts`/`User.lockedUntil` (migration `20260720120000_add_login_lockout`); CRM (migration `20260720140000_add_crm_module`); Inventory (migration `20260720160000_add_inventory_module`); Accounting (migration `20260720180000_add_accounting_module`); HR (migration `20260720200000_add_hr_module`); Procurement (migrations `20260720220000_add_procurement_module` and `20260720230000_add_procurement_settings`); Payroll (migration `20260720240000_add_payroll_module`); Analytics (no migration — owns no tables); POS (migration `20260720260000_add_pos_module`); Projects (migration `20260720280000_add_projects_module`); `User.sessionVersion` (migration `20260721000000_add_user_session_version`, hardening Pass 1); `Invitation` (migration `20260721010000_add_invitations`, hardening Pass 3a). All applied via `prisma migrate deploy` — **not** `prisma migrate dev`, which detects a pre-existing drift between the live database's migration history and the local `prisma/migrations/` folder (leftover from before this rebuild) and offers to reset the entire database. That offer was declined every time; `migrate deploy` applied each migration cleanly without touching anything else. Anyone continuing this project should use `migrate deploy` (or hand-write the migration SQL and apply it that way) rather than `migrate dev` against this specific database.
- **`getCurrentTenant()` (`src/lib/tenant/index.ts`) is the single authoritative tenant-state check for the whole app** (hardening Pass 1) — it filters to `ACTIVE` memberships in `ACTIVE`/`TRIAL` organizations *before* any cookie/session-based selection logic runs, so an invalid membership/organization can never be silently selected as a fallback. It also computes `TenantContext.accessibleModuleKeys` (enabled **and** permitted, vs. `enabledModuleKeys` which is enablement-only) — anything rendering module data or "open module" links must filter on `accessibleModuleKeys`, not `enabledModuleKeys`.
- **Sessions are JWT-based (NextAuth v4) but revalidated against the database on every request**, not just at sign-in (Pass 1) — `User.sessionVersion` is embedded in the token at login and compared against the live database value on every subsequent `jwt()` callback invocation; a mismatch (or a non-`ACTIVE` user) clears the session immediately. `src/lib/auth/session-revocation.ts`'s `revokeUserSessions(userId)` bumps the version; called today from `resetPassword()` and invitation acceptance for a brand-new user. See `docs/HARDENING_PLAN.md` §2 for what this does and doesn't cover yet.
- **`npm run test` (Vitest) is a real, committed test suite** as of the 2026-07-21 hardening pass — the project's first (`docs/TESTING_STRATEGY.md` previously noted zero committed automated tests). Config at `vitest.config.ts` aliases the `server-only` package (a Next.js bundler intrinsic, not an installed npm package — resolving it requires this alias outside of Next's own build) to an empty stub at `test/stubs/server-only.ts`. Tests live in `test/*.test.ts` and mock `@/lib/db` rather than hitting the real Neon database. 101 tests across 10 files as of Pass 3c.
- **Every financial/inventory state transition that used to be a read-then-absolute-write now uses one of two atomic Prisma patterns** (hardening Pass 2, see `docs/HARDENING_PLAN.md`'s Pass 2 section for the full per-module breakdown): a **guarded `updateMany`** (the invariant — enough stock, still in the right status — lives in the `WHERE` clause, checked via the returned `count`) for anything that must reject under a failed precondition, and a plain atomic `increment`/`decrement` for anything that must always accumulate correctly regardless of concurrent writers. Any new mutating function touching `InventoryStock.quantity`, an `HirePurchaseAccount`'s `balance`/`totalPaid`, an `AccountingInvoice`'s `amountPaid`, or any `DRAFT`/`PENDING`/`OPEN`-style status field should follow one of these two patterns, not a fresh `findFirst` + JS-computed `update`.
- **`Inventory.recordMovement()` optionally accepts an existing transaction client** (`tx?: Tx`, `Tx` exported from `src/modules/inventory/service.ts`) so callers like POS's `createSale()`/`refundSale()` and Procurement's `receiveOrderLine()` can commit their own row changes and Inventory's stock movement as one all-or-nothing transaction while still calling Inventory's public service function, never its Prisma models directly (the module-boundary rule in `docs/MODULE_BOUNDARIES.md`). Omitting `tx` opens a standalone transaction exactly as before — this is backward compatible for every pre-existing caller.
- **Invitations are bound to one specific `OrganizationMember`, not an email** (hardening Pass 3a) — `src/lib/auth/invitations.ts`'s `Invitation` model stores a SHA-256 `tokenHash` (never the raw token) with a unique `membershipId`, so accepting one invitation can only ever activate that one membership. Two distinct accept paths exist: `acceptInvitationNewUser()` for a user who's never set a password, `acceptInvitationExistingUser()` for an already-active user being added to an additional organization (never touches their password; requires the currently authenticated session to already belong to that exact user). The login page (`src/app/(auth)/login/page.tsx`) now honors a `callbackUrl` query param so "log in, then come back and accept" works — it previously hardcoded the post-login destination.
- **`src/lib/auth/tokens.ts` now only handles password-reset tokens** — the invite-specific `issueInviteToken`/`consumeInviteToken` functions were removed entirely (Pass 3a), replaced by the `Invitation` model above. Don't reintroduce an email-keyed invite token; the whole point of the redesign was binding to a membership instead.
- **`src/lib/validation.ts` is the shared Zod primitives library** (hardening Pass 3b, rolled out to every remaining mutating Server Action file in Pass 3c) — `moneyAmount`/`moneyAmountNonNegative`, `positiveInt`, `percent0to100`, `email`, `shortText`/`longText`, `dateInput`, `cuid`, `escapeHtml()`, `parseWithSchema()`. Every mutating Server Action in the app now validates its FormData input through this library before calling the service layer. Use this library, don't invent a parallel one, when validating new untrusted input.
- **Every module's `service.ts` is expected to validate every foreign id a caller supplies against the organization** — Pass 1/2 fixed this for Administration/Projects/Payroll/POS/Inventory/Procurement/Accounting/Installment (`createAccount`/`updateCustomer` only); Pass 3b audited and fixed the same pattern in CRM (`ownerId`/`contactId`/`leadId`/`dealId`), HR (`managerId`/`employeeId`/`leaveTypeId`), and Fleet (`ownerId`/`assignedDriverId`/`vehicleId`); Pass 3c finished the audit for Installment's remaining functions (`recordStaffSalaryPayment`, `adjustStaffInventory`) and POS's register/warehouse setup. A new function accepting a relation id from a caller must resolve it with `findFirst({ where: { id, organizationId } })` (or equivalent) before writing — never trust a bare id.
- **Money arithmetic that produces a value written to the database, or that decides a core invariant (the ledger's debit=credit check), uses `Prisma.Decimal`, not JS `Number`** (hardening Pass 3c) — `new Prisma.Decimal(value)` from `import { Prisma } from "@prisma/client"`, with `.plus()`/`.minus()`/`.times()`/`.div()`/`.toFixed(2)`/`.greaterThan()`/etc. rather than float arithmetic and `.toFixed(2)` on a `Number`. This replaced two `0.005`-epsilon fudge-factors in Accounting that existed specifically to work around float rounding error — Decimal comparison needs no epsilon. Read-only reporting/dashboard aggregations (recomputed fresh every request, not accumulated) were deliberately left as `Number` — see `docs/HARDENING_PLAN.md`'s Pass 3c section for the exact scope and reasoning. Follow this pattern for any new derived-and-persisted monetary computation; don't introduce fresh `Number()` conversions on `Decimal`-typed fields that feed a database write.

## Files changed (Paystack + Flutterwave payment gateways for platform-managed subscriptions)

**Created:** `prisma/migrations/20260726030000_add_subscription_payment_gateway/migration.sql` (`PaymentGatewayProvider` enum, `Subscription.gatewayProvider` column, a lookup index on `(gatewayProvider, paymentReference)`); `src/lib/payments/{types,paystack,flutterwave,config,index}.ts` (gateway clients — `initializeTransaction()`/`verifyTransaction()` per provider, Paystack's HMAC-SHA512 `verifySignature()`, Flutterwave's constant-time `verifyWebhookHash()`, `isGatewayConfigured()`); `src/app/app/(overview)/organization/billing/{page.tsx,actions.ts}` (tenant-facing billing page, gated on `org.settings.manage` like the rest of Organization); `src/app/app/(overview)/organization/billing/callback/{paystack,flutterwave}/page.tsx` (post-checkout return pages); `src/app/api/payments/{paystack,flutterwave}/webhook/route.ts` (the authoritative payment-confirmation path); `docs/BILLING_AND_SUBSCRIPTIONS.md` (rewritten — see note below); `test/payments-gateway-clients.test.ts` (10 tests), `test/subscription-gateway-payment.test.ts` (8 tests).

**Modified:** `prisma/schema.prisma` (`Subscription.gatewayProvider`, new enum); `src/platform/subscriptions/service.ts` (extracted the shared `finalizeActivation()` helper out of `activateSubscription()` so the existing manual-reference path and the new gateway path can't drift apart; added `initiateGatewayPayment()` and `activateSubscriptionFromGateway()`); `.env.example` (`PAYSTACK_SECRET_KEY`/`PAYSTACK_PUBLIC_KEY`/`FLUTTERWAVE_SECRET_KEY`/`FLUTTERWAVE_PUBLIC_KEY`/`FLUTTERWAVE_WEBHOOK_HASH`); `src/platform/modules/workspace-navigation.tsx` (new "Billing" nav link); `src/app/app/(overview)/organization/page.tsx` (new "Billing" card linking to the billing page).

**Migration impact:** additive only (nullable enum column + index) — zero-downtime.

**Note on `docs/BILLING_AND_SUBSCRIPTIONS.md`:** this file already existed before this pass, describing the acquisition pipeline (contact → inquiry → organization creation → subscription record) as implemented and explicitly documenting that Paystack/Flutterwave were "reserved... not yet connected to a checkout page, callback route, or webhook route." That pipeline was real and already working (see below) — but the schema had no `PaymentGatewayProvider` enum, no `gatewayProvider` column, and no `src/lib/payments/` code before this pass, confirmed by inspecting the schema and codebase directly rather than trusting the doc. The doc was accurate about the pipeline and aspirational (ahead of the actual code) about the gateways; it's been updated in place to describe what's now actually implemented rather than left to drift further.

## Summary of what was done (Paystack + Flutterwave payment gateways)

Triggered by the user asking for the full contact→request→subscription pipeline they described, then narrowing to "let's use Paystack and Flutterwave" after a short exploratory exchange about MTN MoMo. Investigating first (per this file's own mandatory instructions) found that almost everything the user described was **already built** in undocumented commits made since the last handoff update (`54226be`, `d5eba17`, `2312aa9`, `18221a1`, `ed644f8` — flagged to the user directly as a process gap, since this file's own rules require every agent to update it): the contact form's demo/module/custom-module routing with a preferred-contact channel, the platform inquiry inbox with one-click Email/Call/WhatsApp actions, prefilled organization creation from an inquiry with an always-automatic tenant code, and a full `Subscription` model with `MANUAL_OFFLINE`/`PLATFORM_MANAGED` modes already gating `OrganizationModule` access by `getCurrentTenant()`. The only real gap was that both subscription modes were activated identically — an operator manually typing in a payment reference — with no actual online checkout for `PLATFORM_MANAGED`. Scoped this pass to exactly that gap via `EnterPlanMode`, confirmed with the user that payment should happen on a **tenant-facing billing page** (login required) rather than a public unauthenticated link, then implemented.

**Design**: extracted the existing `activateSubscription()`'s "payment confirmed → grant access" tail (enable the module, complete the linked request, notify the org, audit) into a shared `finalizeActivation()` so the pre-existing manual path and the new gateway path can never drift apart. `initiateGatewayPayment()` (called from the org's own billing page, never the platform operator surface) validates the subscription belongs to the caller's org and is a `PLATFORM_MANAGED` subscription awaiting payment, generates a reference, calls the chosen gateway's `initializeTransaction()`, and stamps the subscription with that reference + provider via a guarded `updateMany` before redirecting to the hosted checkout. `activateSubscriptionFromGateway()` is the single confirmation entrypoint both the **webhook** (authoritative — registered in each provider's dashboard) and the **browser callback page** (a UX accelerant, so the customer isn't stuck waiting on the webhook) call; it re-verifies the payment server-to-server via the gateway's own `verifyTransaction()`, checks the verified amount/currency against the subscription's stored values, and is idempotent — a subscription already `ACTIVE` by the time either caller reaches it is returned as-is rather than re-processed or rejected, since both callers can race for the same payment.

**Security choices worth calling out**: Paystack's webhook signature is verified via HMAC-SHA512 over the *raw* request body (not a re-serialized JSON.stringify, which can silently break byte-for-byte comparison) using `node:crypto`'s `timingSafeEqual`; Flutterwave's `verif-hash` header is a shared-secret string (not a signature) also compared with `timingSafeEqual`. Neither webhook route requires a signed-in session — authenticity comes entirely from the signature/hash check, since these are server-to-server calls from the gateway, not a browser. Neither route ever trusts a webhook or callback payload's own claimed amount/status; both re-verify against the provider's API before calling `activateSubscriptionFromGateway()`.

**Verified**: 18 new Vitest tests (10 for the gateway clients — amount-unit conversion for each provider, Paystack's ×100 subunit conversion specifically, signature/hash accept-and-reject cases, `isGatewayConfigured()` env-driven behavior; 8 for the service layer — `initiateGatewayPayment()` rejecting a foreign org/wrong mode/wrong status, `activateSubscriptionFromGateway()`'s idempotency on a second call and its amount/currency mismatch rejection) — full suite now 182/182 passing across 25 files (up from 101 tests when this file was last updated at Pass 4, reflecting both this pass's tests and the undocumented commits' own tests found already in the tree). Full validation suite run clean: `npm run lint`, `npx tsc --noEmit`, `npx prisma validate`, `npm run build` (118 routes, up from 113 before this pass's 5 new routes: 2 webhook API routes, the billing page, and 2 gateway callback pages).

**Honestly not verified** — stated plainly, matching this project's existing practice: this environment cannot receive an inbound webhook call or reach Paystack's/Flutterwave's real API, so neither gateway client nor either webhook route has been exercised against a real sandbox transaction. The code is written carefully against each provider's documented API shape and is `tsc`-clean, but a real Paystack **and** Flutterwave sandbox checkout — including confirming the webhook actually lands, not just the callback page — is needed before relying on this in production. Also not done in this pass: backfilling handoff entries for the five undocumented prior commits (`54226be`/`d5eba17`/`2312aa9`/`18221a1`/`ed644f8`) — flagged to the user, but reconstructing accurate "what was verified" detail for someone else's already-merged work without fabricating it was judged out of scope for this pass specifically.

**Next recommended step:** run a real Paystack and Flutterwave sandbox transaction end-to-end (checkout → callback page → confirm webhook delivery) before considering platform-managed billing production-ready; separately, backfill or otherwise reconcile this file against the five undocumented commits noted above so it stops drifting from `git log`.

---

## Files changed (Hardening Pass 3a — Invitation redesign)

**Created:** `prisma/migrations/20260721010000_add_invitations/migration.sql`; `src/lib/auth/invitations.ts`; `test/invitation-redesign.test.ts` (13 tests).

**Modified:** `prisma/schema.prisma` (`Invitation` model + `InvitationStatus` enum + back-relations on `User`/`Organization`/`OrganizationMember`); `src/lib/auth/tokens.ts` (invite-specific functions removed, password-reset untouched); `src/lib/auth/actions.ts` (`acceptInvite` rewritten to call `acceptInvitationNewUser()`, new `acceptInviteExisting`); `src/app/(auth)/invite/page.tsx` (rewritten: branches on `previewInvitation()`'s `isNewUser` for the password-setup vs. "log in to accept" path); `src/app/(auth)/login/page.tsx` (refactored to honor a `callbackUrl` query param via a `useSearchParams()`-reading component under `Suspense`, previously hardcoded to `/app/dashboard`); `src/app/app/(overview)/administration/actions.ts` (`inviteMember` uses `createInvitation()` + honest `sendEmail()` result checking, new `resendMemberInvitation`/`revokeMemberInvitation`); `src/app/app/(overview)/administration/page.tsx` (invitation status column, "Email failed" badge, Resend/Revoke buttons); `test/idor-projects-payroll-administration.test.ts` (updated stale mocks for the new `@/lib/auth/invitations` import).

**Migration impact:** additive only (`Invitation` table + enum + FKs) — zero-downtime, no existing data touched.

## Summary of what was done (Hardening Pass 3a)

Continuation of the same 2026-07-20 audit-driven hardening track, per explicit "go ahead" after Pass 2's review checkpoint, following the order recommended at that checkpoint (invitation redesign first, since it was the clearest remaining real security gap).

**The core fix**: invite tokens were previously keyed by email only (`invite:<email>` in the shared `VerificationToken` table), with no binding to which specific membership they were issued for. Confirmed real bugs: accepting one invite activated **every** `INVITED` membership the target user had (a second organization's invite could be accepted through a first organization's link); an existing active user's password was unconditionally replaced by acceptance; a later invite for the same email silently invalidated an earlier organization's still-outstanding invite. The fix adds a dedicated `Invitation` model with a **unique** `membershipId` foreign key and a SHA-256 `tokenHash` (the raw token is never persisted) — accepting resolves the invitation by its hash and activates only that one membership, full stop.

**Two accept paths, not one**: a brand-new user (never set a password) uses `acceptInvitationNewUser()`, which collects and sets a password. An already-active user being invited to an *additional* organization uses `acceptInvitationExistingUser()`, which never calls `user.update()` at all — it requires the browser's current session to already belong to that exact user id, checked server-side, not just client-side trust. The `/invite` page renders whichever form applies; for an existing user with no session yet, it links to `/login?callbackUrl=...` instead of collecting anything itself. This required fixing a real, unrelated bug found while building this: the login page hardcoded its post-sign-in redirect to `/app/dashboard`, silently ignoring any `callbackUrl` query param — refactored into a `useSearchParams()`-reading component (mirroring the pattern the page already used for its notice banner) so the return-to-invite flow actually works.

**Also added**: resend (issues a fresh token, invalidating the old one, with a 60-second cooldown to stop double-click token churn) and revoke (atomic `PENDING`→`REVOKED` claim, same guarded-`updateMany` pattern as every Pass 2 state transition) — both new buttons on the Administration page, shown only for members with a genuinely pending invitation. `sendEmail()`'s real result is now checked; a failed send sets `lastDeliveryFailed` and shows an honest error instead of the previous unconditional "Invitation sent" banner.

**Verified end-to-end via Playwright**: normal login still works after the login-page refactor (regression check); an invalid token, an expired token, and an already-accepted token each render their own distinct message; a brand-new invitee sets a password, lands on `login?activated=1`, logs in, and reaches the dashboard with the invited organization genuinely active (confirmed via the org switcher/dashboard, not just a redirect); the Administration page's Resend/Revoke buttons render and Revoke performs a real atomic state change. All test users/memberships/invitations were deleted afterward via a one-off cleanup script. The existing-user accept path was verified via Vitest (13 tests covering both accept functions, resend cooldown, and revoke's atomic claim) but not separately browser-verified — it needs a second real active account to exercise realistically, and its core invariants (never touches `user.update`, rejects a session/target mismatch) are directly asserted against the service function instead.

**Build result at the time:** Passed — `npm run test` 58/58 passing across 6 files, 101 routes (unchanged).

**Known issues at the time:** Pass 3b+ not started (Zod validation, CRM/HR/Fleet IDOR audit — since addressed, see Pass 3b below), no rate limiting on invite creation itself (still current), documented residual concurrency races from Pass 2 (still current), Installment's `updatePayment()`/`applyCreditToAccount()` races (still current), plus all previously carried-forward gaps.

**Next recommended step (at the time):** Get explicit direction before starting Pass 3b. The user replied "continue," leading directly into the Pass 3b work above.

---

## Files changed (Hardening Pass 3b — Zod validation foundation, public contact form, CRM/HR/Fleet IDOR audit)

**Created:** `src/lib/validation.ts` (shared Zod primitives); `prisma/migrations/20260721020000_add_contact_submission/migration.sql`; `test/validation.test.ts`, `test/contact-form.test.ts`, `test/idor-crm-hr-fleet.test.ts` (28 tests total).

**Modified:** `prisma/schema.prisma` (`ContactSubmission` model); `src/app/(public)/contact/{actions.ts,page.tsx}` (Zod validation, HTML escaping, persistence, per-email rate limit); `src/app/app/(overview)/administration/actions.ts` (email/name validation on invite); `src/modules/crm/service.ts` (`ownerId`/`contactId`/`leadId`/`dealId` IDOR fixes, new `NotFoundError`); `src/modules/hr/service.ts` (`managerId`/`employeeId`/`leaveTypeId` IDOR fixes, new `NotFoundError`); `src/modules/fleet/service.ts` (`ownerId`/`assignedDriverId`/`vehicleId` IDOR fixes, `recordFleetWorkAndPayPayment()` atomicity fix, new `NotFoundError`/`InvalidPaymentAmountError`); every CRM (`contacts`/`leads`/`deals`/`activities`), HR (`employees`/`leave`/`reviews`), and Fleet (`vehicles`/`insurance-roadworthy`/`maintenance`/`work-and-pay`) action file + their `page.tsx` error maps.

**Migration impact:** additive only (`ContactSubmission` table) — zero-downtime.

## Summary of what was done (Hardening Pass 3b)

Continuation of the same 2026-07-20 audit-driven hardening track, per "continue" following Pass 3a's review checkpoint. Two distinct workstreams, deliberately scoped rather than attempting a blanket retrofit of every Server Action in the app (~49 files) in one pass.

**Public contact form hardening**: the audit's most acute *remaining* finding — no email/length validation, no rate limiting, and submitted fields interpolated unescaped directly into an HTML email sent to Rock Frost staff (a real markup-injection vector into outbound mail), plus a submission silently dropped whenever `RESEND_TO_EMAIL` wasn't configured. Fixed with the new shared `src/lib/validation.ts` library, `escapeHtml()` before every field reaches the email template, and a new `ContactSubmission` model that persists every submission regardless of delivery outcome and powers a basic 60-second per-email rate limit. The same library was applied to Administration's invite form (email format + name length, previously unchecked).

**CRM/HR/Fleet cross-tenant IDOR audit**: the audit flagged these three modules as "likely present but unconfirmed" for the unchecked-foreign-id pattern fixed in Pass 1/2 — audited line-by-line and confirmed real gaps in all three. CRM: `ownerId` on contacts/leads/deals, `contactId`/`leadId`/`dealId` on deals/activities. HR: `managerId` on employees, `employeeId`/`leaveTypeId` on leave requests, `employeeId` on reviews. Fleet (the most gaps): `ownerId`/`assignedDriverId` on vehicles, `vehicleId` on documents/maintenance requests/work-and-pay contracts. **Also found while auditing, not originally in scope**: Fleet's `recordFleetWorkAndPayPayment()` had the exact same read-then-absolute-write race Pass 2 fixed everywhere else — fixed with the same atomic multi-field increment/decrement pattern, plus a positive-amount check that didn't exist before.

**Verified**: 28 new Vitest tests (validation primitives, contact-form validation/rate-limiting/escaping, CRM/HR/Fleet IDOR rejections, Fleet payment atomicity) — 86 total across 9 files. The contact form was also browser-verified end-to-end (validation, persistence, rate-limiting); outbound email delivery itself fails in this sandboxed dev environment due to no network egress to Resend — a pre-existing environment limitation confirmed unrelated to this fix, with the escaping behavior verified directly via Vitest against the constructed email body instead.

## Build result (Hardening Pass 3b)

**Passed.** `npm run lint` clean, `npx tsc --noEmit` clean, `npx prisma validate` succeeds, `npm run test` — 86/86 passing across 9 files (58 from Pass 1+2+3a + 28 new), `npm run build` succeeds — 101 routes (unchanged).

## Known issues / deliberate gaps (at the time, Pass 3b)

- **Pass 3c+ not started**: Zod validation for the ~45 remaining Server Action files (Pass 3b covered only the contact form and invite form — the two highest-risk unauthenticated/admin surfaces; every financial module already has service-layer validation from Pass 2, so this is lower urgency than it sounds), Decimal-precision arithmetic throughout Accounting/Payroll/Installment, reproducible seeding/CI. **Since addressed — see Pass 3c below.**
- **Remaining IDOR audit surface**: POS register/session setup beyond Pass 2, and Installment's ~40 functions beyond `createAccount()`/`updateCustomer()` — Installment is the largest, oldest service file in the codebase and warrants its own dedicated pass. **Since addressed — see Pass 3c below.**
- **Documented residual concurrency races from Pass 2** remain (see `docs/HARDENING_PLAN.md`) — none corrupt a primary financial figure. **Still current.**
- **Installment's `updatePayment()`/`applyCreditToAccount()`** (carried forward from Pass 2) retain the same narrower read-then-write race class fixed elsewhere. **Since addressed in Pass 4, Milestone B** — both now use `SELECT ... FOR UPDATE` row locking.
- **No rate limiting on invite creation itself** (carried forward from Pass 3a, only resend is rate-limited). **Still current.**
- **`src/app/app/(overview)/modules/page.tsx` still uses `enabledModuleKeys`** instead of `accessibleModuleKeys` (carried forward from Pass 1) — a dead-end-link UX inconsistency, not a data leak. **Still current.**
- Every gap carried forward from earlier passes remains true and is unaffected by this pass: no data-level scoping in any module, several modules not yet linked to Accounting, POS's three-fixed-line UI, Analytics' lack of time-series drilldown, Fleet's missing owner portal/file uploads, no branch-level enforcement, no public self-registration, unset `RESEND_API_KEY` (confirmed still an issue in this sandboxed environment specifically — no network egress to Resend at all), functionally inert (single-org) organization switcher. Full list in `docs/HARDENING_PLAN.md`.

**Next recommended step (at the time):** Get explicit direction before starting Pass 3c. The user replied "finish the rest," leading directly into the Pass 3c work below.

---

## Files changed (Hardening Pass 4 — real-Postgres tests, concurrency race closure, audit logging)

**Milestone A (commit `975335b`):** `test/integration/setup/{guard,db,fixtures}.ts` (new); `test/integration/tenant-isolation/*.test.ts` (new, 11 files, one per module); `prisma/seed-data.ts` (new, extracted from `prisma/seed.ts`); `scripts/test-db-migrate.ts`, `scripts/test-db-seed.ts` (new); `vitest.integration.config.ts` (new); `vitest.config.ts` (scoped non-recursive); `package.json` (`test:integration`/`test:all`/`db:test:*` scripts, `cross-env`); `.github/workflows/ci.yml` (new `integration` job with a real `postgres:16` service container); `.env.example` (`TEST_DATABASE_URL`); `src/modules/inventory/service.ts` + its action/page (found-and-fixed: `categoryId` had no cross-tenant check).

**Milestone B (commit `e5615b1`):** `src/modules/accounting/service.ts` (`recordInvoicePayment`'s remaining-balance guard now runs inside the transaction against a `SELECT ... FOR UPDATE`-locked row — this codebase's first raw SQL); `src/modules/installment/service.ts` (`applyCreditToAccount`/`recalculateAccountAfterPaymentChange` same fix); `src/modules/procurement/service.ts` (`cancelOrder()` — found and fixed a real bug: its atomic claim allowed cancelling a `PARTIALLY_RECEIVED` order, relying on a stale pre-transaction read that a concurrent receive could slip past); `src/lib/unique-retry.ts` (new — a shared retry helper for 7 different `count()`-then-format document-number generators found to be racy under real concurrency: invoice/expense/employee/sale/request/order/project numbers); `test/integration/concurrency/*.test.ts` (new, 6 files: inventory, pos, procurement, accounting, payroll, installment).

**Milestone C (commits `72b48f8`, `4a6831a`, `800178f`):** `prisma/schema.prisma` (+2 migrations — `AuditLog` gains `membershipId`/`module`/`status`/`correlationId`, `organizationId` made nullable); `src/lib/audit.ts` (new — the shared `logAuditEvent()` service); wired into `src/lib/auth/{nextauth,actions,session-revocation,invitations}.ts` (login/logout/password-reset/session-revocation/invitation-accepted), `src/app/app/(overview)/administration/actions.ts` (invitation created/resent/revoked), `src/app/app/platform/actions.ts` (module enable/disable), and one Server Action file each in Inventory/POS/Accounting/Procurement/Payroll/Installment (the financial/operational mutations); `src/app/app/(overview)/administration/audit-log/page.tsx` + `src/app/api/audit-log/export/route.ts` (new — the org-scoped viewer and its permission-gated CSV export); `src/lib/auth/permissions.ts` + `prisma/seed-data.ts` (`audit.view`/`audit.export` permission keys).

**Migration impact:** all purely additive or constraint-relaxing, zero-downtime, across three migrations this pass.

## Summary of what was done (Hardening Pass 4)

Continuation of the same 2026-07-20 audit-driven hardening track, per an explicit, highly detailed Pass 4 specification naming exact milestones (A: real-Postgres tests → B: concurrency + race closure → C: audit logging → D: observability/performance/resilience, not started) and an explicit "report and validate before continuing between milestones" instruction, which was followed.

**Milestone A** built the first real-database test layer alongside the existing mocked-`db` unit suite: a safety guard that independently refuses to run unless pointed at a database whose name contains `"test"`, differs from the app's own `DATABASE_URL`, and has an explicit `ALLOW_INTEGRATION_TESTS=1` opt-in — verified for real by running it with no test database configured and confirming a clean refusal. Eleven tenant-isolation integration tests (one per module) prove the IDOR fixes from Passes 1–3c against genuine Postgres queries, not mocks; writing them surfaced one previously-undiscovered gap (`InventoryItem.categoryId`), fixed in the same milestone.

**Milestone B** closed the two residual concurrency races the status report had explicitly flagged as accepted-but-undesirable, using `SELECT ... FOR UPDATE` row locking (this codebase's first use of raw SQL, needed because Prisma's query builder can't express a same-row field comparison any other way). Writing the real concurrency test suite surfaced two more genuine bugs neither the original audit nor earlier passes had caught: a real correctness bug in `cancelOrder()` (could cancel an order that had already received real stock, under a specific race timing) and a systemic `count()`-then-format race affecting seven different document-number generators across five modules (previously crashed the second concurrent caller with an unhandled database error instead of corrupting data, since the unique constraint still held).

**Milestone C** built a genuinely production-grade audit system rather than the pre-existing partial one (three ad hoc `auditLog.create` calls with no filtering, no permission gate beyond page-level, no module/status/correlation tracking): a shared service every mutation goes through, wired into authentication, administration, and every financial/operational mutation category the spec named, plus a real org-scoped viewer with filters and a separately-permissioned, self-auditing CSV export. Explicitly documented what wasn't wired in: three audit categories (membership suspension, role reassignment, org-status change) have no underlying Server Action in this codebase at all yet — audited nothing because there's nothing to audit, not an oversight.

**Verified across all three milestones:** `npx tsc --noEmit`, `npm run lint`, `npx prisma validate`, `npx vitest run` (101/101 passing throughout, mocks updated where the new raw-query/audit call sites required it), and `npm run build` (full production build; 103 routes by the end, up from 101) all pass clean at every milestone boundary. Every migration applied against the real Neon database via the safe `migrate diff` → hand-write → `migrate deploy` workflow, never `migrate dev`.

**Honestly not verified — stated plainly, not glossed over:** this sandbox has no local Postgres, Docker, or GitHub Actions access. The entire real-database integration and concurrency test suite (17 files) was written carefully against the actual current service.ts signatures (not from memory) and is `tsc`-clean, but has never actually been executed by me — it needs a real disposable Postgres (locally or in CI) to confirm it passes for real. The CI workflow itself has still never run on GitHub's infrastructure.

**Build result:** Passed at every milestone — `npm run test` 101/101 across 10 files (unchanged all pass), 103 routes, `vercel --prod` confirmed `READY` after each of the three milestone commits.

**Known issues at the time:** the two honestly-unverified items above; `createAccount()`'s deposit-receipt and `applyCreditToAccount()`'s receipt-number generation retain the older racy pattern (lower-frequency hot paths, deliberately deferred); `DIRECT_URL` still not set in Vercel Production (flagged separately, unrelated to Pass 4, migration-only impact); all previously carried-forward gaps from earlier passes.

**Next recommended step (at the time):** Milestone D (observability, performance, resilience/accessibility, branch-access design doc) per the original Pass 4 specification, or confirming the real-database test suite against an actual disposable Postgres first to close the "written but never executed" gap before adding more untested surface.

---

## Files changed (Hardening Pass 3c — remaining IDOR audit, full Zod rollout, Decimal hygiene, reproducible seeding/CI)

**Created:** `.env.example`; `.nvmrc`; `.github/workflows/ci.yml`; `prisma/seed.ts`; `test/pass3c-installment-pos-decimal.test.ts` (15 tests).

**Modified:** `package.json` (`engines.node`, `db:seed` script, `prisma.seed` config, `tsx` devDependency); `README.md`, `docs/ARCHITECTURE.md`, `docs/DATABASE_STRATEGY.md` (stale Phase-1-era sections replaced with current-state descriptions); every remaining mutating Server Action file across Accounting (`journal`/`expenses`/`invoices`/`settings`/`accounts`), Payroll (`settings`/`runs`/`compensation`), Procurement (`requests`/`orders`/`settings`/`vendors`), POS (`sell`/`sales`/`settings`/`registers`), Inventory (`settings`/`movements`/`warehouses`/`items`), Projects (`tasks`/`milestones`/`projects`), Fleet (`payments`/`drivers`/`owners`), Installment (`payments`/`customers`/`accounts`/`products`), `src/app/app/platform/actions.ts`, `src/app/app/(overview)/notifications/actions.ts`, plus their `page.tsx` error maps; `src/lib/tenant/actions.ts`/`src/lib/auth/actions.ts` (validation added to the previously-untouched exports only); `src/modules/installment/service.ts` (`recordStaffSalaryPayment`/`adjustStaffInventory`/`updateInstallmentSettings` validation, new `InvalidSettingsError`; Decimal-precision conversion of `createAccount`/`recordPayment`/`applyCreditToAccount`/closure-refund/reactivation/`computeProductPrice`); `src/modules/pos/service.ts` (`validateWarehouseRef()` helper, `createRegister`/`updateRegister` warehouse IDOR fix); `src/modules/payroll/service.ts` (Decimal-precision conversion of `processRun()`'s payslip computation); `src/modules/accounting/service.ts` (Decimal-precision conversion of `postJournalEntry()`'s balance check, `computeBalance()`, `recordInvoicePayment()`).

**Migration impact:** none this pass — every fix is query/validation/arithmetic-library logic, no schema changes.

## Summary of what was done (Hardening Pass 3c)

Triggered by "finish the rest" after Pass 3b's review checkpoint — an explicit instruction to complete every item Pass 3b's "Remaining work" section had listed as deliberately deferred, rather than continuing the pass-by-pass checkpoint discipline used through Pass 3b.

**Remaining IDOR audit**: line-by-line pass over the rest of `src/modules/installment/service.ts` (the largest service file in the codebase) beyond the two functions Pass 2 covered, finding real gaps in `recordStaffSalaryPayment()` (unchecked `staffId`) and `adjustStaffInventory()` (unchecked `staffId`/`productId` — an exported function with zero current callers, fixed anyway for defense-in-depth), plus a complete absence of bounds-checking in `updateInstallmentSettings()` on percentage/money fields that feed directly into admin-fee/refund/commission math. POS's `createRegister()`/`updateRegister()` gained the same warehouse-ownership check every other module's foreign-id references already had.

**Zod validation — full rollout**: parallelized across four background agents by module group (Accounting+Payroll; Procurement+POS; Inventory+Projects+misc settings; Fleet-remainder+Platform+Notifications+tenant+auth), each following the exact pattern established in Pass 3b's CRM/HR/Fleet work, converting every remaining file's ad-hoc `String()`/`parseInt()`/`parseFloat()` parsing to the shared `src/lib/validation.ts` schemas. Installment's own remaining action files (`payments`/`customers`/`accounts`/`products`) and `pos/registers/actions.ts` were done directly rather than delegated, to keep them alongside the Decimal-precision work touching the same service files. Every one of the ~45 files ended up validated; no service.ts business logic was touched by this workstream.

**Decimal-precision hygiene — bounded, not a blanket rewrite**: rather than converting all ~80 `Number(...)` call sites across Accounting/Payroll/Installment (many are read-only reporting aggregations recomputed fresh each request, with no compounding risk), this pass specifically converted the sites where a float-computed value gets written to the database or decides a core business invariant. This included removing two `0.005`-epsilon fudge-factors in Accounting (the journal debit=credit check and the invoice fully-paid check) that existed specifically to route around float rounding error — `Prisma.Decimal` comparison needs no epsilon. See `docs/HARDENING_PLAN.md`'s Pass 3c section for the full list of converted sites and the explicit reasoning for what was deliberately left as `Number`.

**Reproducible seeding/CI**: `.env.example` (every required env var documented with placeholders), `.nvmrc`/`engines.node` (Node version pin), a committed idempotent `prisma/seed.ts` (permissions/roles/modules bootstrap — verified via two real runs against the live database confirming identical output), and `.github/workflows/ci.yml` (lint → typecheck → `prisma validate` → test → build). Also fixed three stale Phase-1-era documentation files (`README.md`, `docs/ARCHITECTURE.md`, `docs/DATABASE_STRATEGY.md`) that still described a UI-only shell with no Prisma/auth/database usage — these were explicitly named in the original audit's "Documentation and public-site accuracy" findings.

**Verified**: 15 new Vitest tests covering the new Installment/POS validation and, notably, the Decimal-precision fixes specifically (a repeated-`0.1`-addition journal entry that JS float summation would get wrong, a repeating-decimal admin-fee-rate account creation, a non-clean tax-rate payroll run) — 101 total across 10 files. Full validation suite run clean: `npx tsc --noEmit`, `npm run lint`, `npx prisma validate`, `npx vitest run` (101/101), `npm run build` (101 routes, all passing).

**Build result:** Passed — `npm run test` 101/101 passing across 10 files, 101 routes (unchanged), full production build succeeds.

**Known issues (current)**:
- Documented residual concurrency races from Pass 2 remain (row-level locking or serializable isolation would be needed to fully close them — judged disproportionate).
- Installment's `updatePayment()`/`applyCreditToAccount()` retain the narrower read-then-write race class (Pass 3c improved `applyCreditToAccount()`'s arithmetic precision, not its concurrency behavior).
- `.github/workflows/ci.yml` has never executed against a real GitHub Actions run (this environment can't trigger one) — worth confirming on the next real push.
- Automated tests remain mocked-`db`, not integration tests against a real database transaction under actual concurrent load.
- No rate limiting on invite creation itself; `src/app/app/(overview)/modules/page.tsx` still uses `enabledModuleKeys` instead of `accessibleModuleKeys`; audit logging, performance, and accessibility all remain deferred — none blocking correctness/safety.

**Next recommended step:** Get explicit direction on Pass 4+ scope. Candidates per `docs/HARDENING_PLAN.md`: closing the documented residual concurrency races with real row-level locking (would need a design discussion — raw SQL `FOR UPDATE` vs. serializable transactions, since this codebase has avoided raw SQL so far), or moving on from the hardening track entirely toward Billing/Subscriptions requirements-gathering, which remains an explicit "not yet defined" placeholder.

---

## Files changed (Hardening Pass 2 — Financial/inventory transaction integrity)

**Created:** `test/pass2-financial-inventory-integrity.test.ts` (18 tests covering every fix below).

**Modified:** `src/modules/inventory/service.ts` (atomic guarded increment/decrement, warehouse tenant checks, quantity validation, optional shared `tx`, new `NotFoundError`); `src/modules/pos/service.ts` (`openSession` register IDOR fix, `createSale`/`refundSale` full-transaction atomicity, new `InvalidSaleInputError`); `src/app/app/pos/{sell,sales,registers}/actions.ts` + their `page.tsx` error maps; `src/modules/procurement/service.ts` (`createOrder`/`createRequest` vendor/request/item IDOR fixes, `receiveOrderLine` full-transaction atomicity with a guarded `receivedQuantity` increment, atomic claims on `approveRequest`/`rejectRequest`/`sendOrder`/`cancelOrder`, new `NotFoundError`); `src/app/app/procurement/{orders,requests}/actions.ts` + their `page.tsx` error maps; `src/modules/accounting/service.ts` (`postJournalEntry` account-ownership check — the central fix closing the manual-journal IDOR for every caller, atomic claims on `markInvoiceSent`/`payExpense`/`approveExpense`/`rejectExpense`, `recordInvoicePayment` atomic increment + amount validation, `voidInvoice` reversal posting, new `NotFoundError`/`InvalidPaymentError`); `src/app/app/accounting/{invoices,expenses,journal}/actions.ts` + their `page.tsx` error maps; `src/modules/payroll/service.ts` (`processRun`/`cancelRun` atomic claims, `setCompensation`/`updateSettings` validation, new `InvalidCompensationError`); `src/app/app/payroll/{compensation,runs,settings}/actions.ts` + their `page.tsx` error maps; `src/modules/installment/service.ts` (`recordPayment` atomic multi-field increment/decrement + amount validation, `createAccount`/`updateCustomer` IDOR fixes, `refreshAccountLifecycleStatuses` atomic closure-refund claim, new `NotFoundError`/`InvalidPaymentAmountError`); `src/app/app/installment/{accounts,customers,payments}/actions.ts` + their `page.tsx` error maps.

**Migration impact:** none — every Pass 2 fix is query/transaction-shape logic, no schema changes.

## Summary of what was done (Hardening Pass 2)

Continuation of the same 2026-07-20 audit-driven hardening track, per explicit "go ahead" to proceed into Pass 2 after Pass 1's review checkpoint. Covers the financial/inventory transaction-integrity rework flagged across POS, Inventory, Procurement, Accounting, and Payroll, plus Installment's core payment-recording path, along with every IDOR path the audit noted as entangled with that same code (fixing the IDOR alone without the atomicity work would have been incomplete, since both live in the same functions).

**Two recurring fixes, applied consistently across all six modules**: (1) a **guarded atomic `updateMany`** replacing every "read status, check it in JS, write a new absolute value" state transition — so a second, near-simultaneous request's `count: 0` result rejects it instead of silently double-processing (closes: double invoice-sends, double expense-payments, duplicate payroll-run processing, duplicate POS refunds, duplicate procurement receiving, duplicate installment closure-refund credits); (2) atomic `increment`/`decrement` replacing every "read a total, add to it in JS, write the new absolute total back" — so concurrent writes to the same running total (stock quantity, `amountPaid`, installment `balance`/`totalPaid`) can never lose one writer's contribution.

**Also fixed**: Accounting's `voidInvoice()` now posts a real reversing journal entry instead of only flipping status (previously permanently overstated revenue/AR for a voided-but-previously-sent invoice); several confirmed IDOR gaps where a foreign organization's id could be attached to a new record (Procurement's vendor/request/item on order/request creation, Installment's customer/staff on account creation — the staff one was a real cross-tenant **write**, since it would have consumed another organization's staff-inventory unit); input validation that was previously entirely absent (POS line quantity/price, Payroll salary/tax-rate, Accounting/Installment payment amounts).

**Deliberately not attempted this pass** (documented in `docs/HARDENING_PLAN.md` as Pass 3): full `Decimal`-precision arithmetic (the codebase still converts to JS `Number` throughout), a handful of narrower residual concurrency races that don't corrupt the primary financial figure but could affect a derived status/clamp field under precise three-way interleaving (documented per-instance in the plan), Installment's `updatePayment()`/`applyCreditToAccount()` (same race class, narrower blast radius), and a full line-by-line IDOR audit of CRM/HR/Fleet.

**Build result at the time:** Passed — `npm run test` 45/45 passing across 5 files, 101 routes (unchanged).

**Known issues at the time:** Pass 3 (invitation redesign, Zod validation, CRM/HR/Fleet IDOR audit, Decimal-precision hygiene, reproducible seeding/CI) not started (invitation redesign since resolved — see Pass 3a above), plus documented narrow residual concurrency races (still current, see `docs/HARDENING_PLAN.md`) and all previously carried-forward gaps.

**Next recommended step (at the time):** Get explicit direction before starting Pass 3, per the same review-checkpoint discipline used between Pass 1 and Pass 2. The user replied "ok, go ahead," leading directly into the Pass 3a work above.

---

## Files changed (Hardening Pass 1 — Tenant guard, session revocation, dashboard leak, top IDOR paths)

**Created:** `docs/HARDENING_PLAN.md` (full audit-derived remediation plan, all passes); `prisma/migrations/20260721000000_add_user_session_version/migration.sql`; `src/lib/auth/session-revocation.ts`; `vitest.config.ts`; `test/stubs/server-only.ts`; `test/tenant-guard.test.ts`; `test/dashboard-permission-leak.test.ts`; `test/session-revocation.test.ts`; `test/idor-projects-payroll-administration.test.ts`.

**Modified:** `prisma/schema.prisma` (`User.sessionVersion`); `src/lib/tenant/index.ts` (central guard + `accessibleModuleKeys`); `src/lib/tenant/actions.ts` (`switchOrganization` status validation); `src/app/app/layout.tsx` (redirect to `/login` on a revoked/id-less session, not just a fully-missing one); `src/lib/auth/nextauth.ts` (session revalidation in `jwt()`); `src/lib/auth/next-auth.d.ts` (`sessionVersion` typing); `src/lib/auth/actions.ts` (`resetPassword`/`acceptInvite` bump `sessionVersion`); `src/app/app/(overview)/dashboard/page.tsx` (filters on `accessibleModuleKeys`); all 11 module `layout.tsx` files + `src/app/app/(overview)/layout.tsx` (pass `accessibleModuleKeys` to `AppShell`); `src/app/app/(overview)/administration/actions.ts` (`inviteMember` role lookup scoped to org/system roles); `src/modules/projects/service.ts` (`addProjectMember`/`removeProjectMember`/`createMilestone`/`createTask` organization-scoped, new `NotFoundError`); `src/app/app/projects/{projects,milestones,tasks}/actions.ts` + their `page.tsx` error maps (updated signatures, `not-found` handling); `src/modules/payroll/service.ts` (`setCompensation` organization-scoped, new `NotFoundError`); `src/app/app/payroll/compensation/actions.ts` + `page.tsx` (`not-found` handling); `src/app/app/platform/subscriptions/page.tsx` (relabeled "Planned — requirements not yet defined"); `package.json` (`test` script, `vitest` devDependency).

## Summary of what was done (Hardening Pass 1)

Triggered by a pasted 2026-07-20 full-project audit that classified the platform as a "feature-rich internal beta" — safe for controlled/internal use, not for external multi-tenant onboarding or real financial operations, pending several confirmed blockers. Every audit claim was independently re-verified against the live codebase (not trusted blindly) before being acted on; `docs/HARDENING_PLAN.md` records the full plan, including what's deferred to Pass 2 and why.

**Central active-tenant guard**: `getCurrentTenant()` previously loaded `OrganizationMember` rows filtered only on `userId` — an `INVITED`/`SUSPENDED`/`REMOVED` membership, or a `SUSPENDED`/`CANCELLED` organization, was fully authorized, and the implicit fallback chain (`cookie → session.user.organizationId → allMemberships[0]`) could silently land on any of them. Now filters to `ACTIVE` memberships in `ACTIVE`/`TRIAL` organizations *before* any selection logic runs, so an invalid membership can never be selected, explicitly or implicitly. `switchOrganization()` got the identical fix.

**Session revocation**: sessions are NextAuth v4 JWTs with up to a 30-day lifetime; nothing previously re-checked `User.status` after sign-in. Added `User.sessionVersion`, embedded in the token at login, re-validated against the database on every subsequent request inside `jwt()` — a mismatch or a non-`ACTIVE` user clears the session immediately rather than at next natural expiry. Wired into `resetPassword()` and `acceptInvite()` (the two flows that exist today and change credentials); membership/organization-level suspension is already covered by the tenant guard re-reading the database every request, independent of the JWT.

**Dashboard/module-launcher permission leak**: the organization dashboard filtered which modules to render using only org-level enablement, never the current user's permissions — every dashboard widget fetches and renders real summary data (cash balance, payroll totals, etc.) with no permission check of its own, trusting the page to have already gated it. Added `TenantContext.accessibleModuleKeys` (enabled **and** permitted) and switched the dashboard and all twelve `AppShell` call sites to filter on it instead of `enabledModuleKeys`.

**Confirmed highest-risk IDOR paths** (the subset that doesn't require the broader financial/inventory atomicity rework, which is Pass 2): Administration's `inviteMember()` resolved a submitted `roleId` with no organization check (a foreign organization's custom role could be attached to a new membership); Projects' `addProjectMember`/`removeProjectMember`/`createMilestone`/`createTask` took bare ids with no organization validation; Payroll's `setCompensation()` upserted by a globally-unique `employeeId` with no organization check, meaning a foreign organization's compensation row could be silently overwritten. All four now resolve every foreign id through an organization-scoped lookup and throw a generic not-found error (never revealing whether the foreign record exists) on failure.

**First committed automated test suite**: `docs/TESTING_STRATEGY.md` previously stated no Jest/Vitest/committed Playwright suite existed. Added Vitest (permanent devDependency, not a temporary tool) with 27 tests across 4 files covering every fix above — mocking `@/lib/db` rather than touching the real Neon database.

**Build result at the time:** Passed — `npm run test` 27/27 passing across 4 files, 101 routes (unchanged). `vercel --prod` confirmed `READY`.

**Known issues at the time:** Pass 2 (financial/inventory atomicity + its overlapping IDOR paths) not started (still current at the time), invitation redesign not started (still current), no formal Zod validation (still current), plus all previously carried-forward gaps.

**Next recommended step (at the time):** Get explicit direction before starting Pass 2 given its size. The user replied "go ahead," leading directly into the Pass 2 work above.

---

## Files changed (Phase 16 — Projects)

**Created:** `prisma/migrations/20260720280000_add_projects_module/migration.sql`; `src/modules/projects/{service.ts,navigation.tsx,dashboard-widget.tsx}`; `src/app/app/projects/layout.tsx`, `src/app/app/projects/page.tsx`, and five route trees (`projects`, `tasks`, `milestones` each with `page.tsx` + `actions.ts`; `reports` and `settings` are read-only, `page.tsx` only).

**Modified:** `prisma/schema.prisma` (Projects models — `Project`, `ProjectMember`, `ProjectMilestone`, `ProjectTask` — and back-relations on `User`/`Organization`/`Branch`); `src/lib/auth/permissions.ts` (6 new `PROJECTS_*` keys); `src/platform/modules/registry.ts` (`projects` flipped from `coming-soon` to `available` — the last module from the original `docs/PRODUCT_VISION.md` list); `src/platform/modules/dashboard-widgets.tsx` (Projects widget registered).

**Database (via a one-off script, not committed):** seeded 6 `Permission` rows for `projects.*`, granted them to Super Admin/Organization Owner, created the "Projects Manager" system role, enabled the `projects` module for the demo organization (`Rock Frost Demo Fleet`, tenant code `rock-frost-demo-fleet`).

## Summary of what was done (Phase 16 — Projects)

Built after POS, following the user's "ok do the next" instruction — the last module remaining from the original `docs/PRODUCT_VISION.md` list. Designed four models from scratch: `Project`, `ProjectMember` (many-to-many join to `User` with an optional free-text `role`), `ProjectMilestone`, and `ProjectTask`. No cross-module service calls were needed or added — Projects is self-contained.

Two real guard-rail state transitions, matching the "genuine validation logic, not just CRUD" precedent set by HR's rating-required-before-review-completion: `completeMilestone()` throws `MilestoneStateError` if any task under it isn't `DONE`; `completeProject()` throws `ProjectStateError` if any milestone on it isn't `COMPLETED`. Both surface as an `?error=not-ready` redirect on their respective list pages.

**Verified end-to-end via Playwright**: created a project, added a member, created a milestone with two tasks under it, confirmed the milestone-completion guard correctly rejected completion while a task was still open, progressed both tasks through `TODO → IN_PROGRESS → IN_REVIEW → DONE`, confirmed the milestone then completed successfully, and confirmed the project itself completed successfully once its only milestone was `COMPLETED`. Reports and Overview pages both reflected the resulting state correctly. All four test projects created during this and earlier failed verification attempts (`PRJ-0001` through `PRJ-0004`, all named `QA Project <timestamp>`) were deleted afterward via a one-off cleanup script (cascading to their members/milestones/tasks).

**Build result at the time:** Passed — 101 routes total (95 before Phase 16; 101 after Projects's 6 new routes). Deployment confirmed `READY` via `vercel --prod`.

**Known issues at the time:** Projects' lack of data-level scoping and Accounting/HR/Payroll linkage (still current), plus every previously carried-forward gap (POS/Analytics/Procurement/Payroll/Accounting/HR/Inventory/CRM scoping and integration gaps, Fleet portal/uploads, no fuzzy duplicate-detection, no branch enforcement, no public self-registration, unset `RESEND_API_KEY`, inert organization switcher). Superseded by the audit-driven "Known issues / deliberate gaps (current)" section above, which reorganizes around the hardening-pass structure rather than per-module gaps.

**Next recommended step (at the time):** With Projects complete, every module from the original `docs/PRODUCT_VISION.md` list — plus POS, added by explicit request — was built. The user then pasted a full-project audit and requested a dedicated production-hardening pass rather than continuing with Billing/Subscriptions, leading directly into Hardening Pass 1 above.

---

## Files changed (Phase 14 — Analytics + Phase 15 — POS)

**Analytics — Created:** no migration (owns no tables); `src/modules/analytics/{service.ts,navigation.tsx}`; `src/app/app/analytics/layout.tsx`, `src/app/app/analytics/page.tsx`, and five route trees (`financial`, `sales`, `operations`, `people`, `settings`), all read-only (`page.tsx` only, no `actions.ts`).

**POS — Created:** `prisma/migrations/20260720260000_add_pos_module/migration.sql`; `src/modules/pos/{service.ts,navigation.tsx,dashboard-widget.tsx}`; `src/app/app/pos/layout.tsx`, `src/app/app/pos/page.tsx`, and five route trees (`registers`, `sell`, `sales`, `settings` each with `page.tsx` + `actions.ts`; `reports` is read-only, `page.tsx` only).

**Modified:** `prisma/schema.prisma` (POS models and back-relations on `User`/`Organization`/`Branch`/`InventoryWarehouse`/`InventoryItem`); `src/lib/auth/permissions.ts` (6 new `ANALYTICS_*` + 6 new `POS_*` keys); `src/platform/modules/registry.ts` (`analytics` flipped from `coming-soon` to `available`; new `pos` entry added from scratch — POS was not in the original `docs/PRODUCT_VISION.md` module list); `src/platform/modules/dashboard-widgets.tsx` (POS widget registered; Analytics deliberately has none); `src/app/app/(overview)/reports/page.tsx` (rewritten to point at the new Analytics module instead of claiming cross-module reporting isn't built); `docs/DECISIONS.md` (new entry documenting the POS→Inventory integration).

**Database (via one-off scripts, not committed):** seeded 6 `Permission` rows each for `analytics.*` and `pos.*`, granted them to Super Admin/Organization Owner, created the "Analytics Manager" and "POS Cashier" system roles, enabled both modules for the demo organization (`Rock Frost Demo Fleet`, tenant code `rock-frost-demo-fleet`).

## Summary of what was done (Phase 14 — Analytics)

User asked to finish with Analytics, then add POS. Analytics is structurally different from every prior module: it owns no database tables, so no migration was written. `src/modules/analytics/service.ts` calls every other enabled module's own summary function (`getAccountingSummary`, `getPayrollSummary`, `getCrmSummary`, `getInstallmentSummary`, `getFleetSummary`, `getInventorySummary`, `getProcurementSummary`, `getHrSummary`) and combines the results, gating each call on the organization's actual `enabledModuleKeys` so a disabled module is simply omitted rather than erroring. Also rewrote the pre-existing organization-scope `/app/reports` placeholder (which had claimed "cross-module reporting is not built yet" since Phase 1) to point users to the new Analytics module.

**Verified against real current data**, not synthetic test fixtures: every figure on every Analytics page (Financial, Sales & CRM, Operations, People, and the Overview) was cross-checked against each source module's own Reports page and matched exactly — since Analytics has no create actions, there was nothing to clean up afterward.

## Summary of what was done (Phase 15 — POS)

Built immediately after Analytics per the same instruction. POS was not part of the original module list in `docs/PRODUCT_VISION.md` — added as a brand-new registry entry at the user's explicit request. Designed a register → session → sale lifecycle: a register optionally links to an `InventoryWarehouse`; only one session can be open on a register at a time; a sale can only be recorded against a currently-open session (`SaleStateError` otherwise).

**Deliberate real cross-module integration** (documented in `docs/DECISIONS.md`, the same pattern as Procurement's receiving flow): completing a sale with a line linked to a real `InventoryItem`, on a register with a linked warehouse, calls Inventory's own `recordMovement()` with `type: "ISSUE"`; refunding that sale reverses it with `type: "RECEIPT"`. Stock availability for every line is checked up front via `getStockGrid()` before any movement is posted.

**Verified with real stock arithmetic**: created a warehouse and item with 20 units on hand, opened a register session, sold 3 units (confirmed stock dropped to exactly 17 on Inventory's own Stock page), refunded the sale (confirmed stock returned to exactly 20), and confirmed the Reports page correctly excluded the refunded sale from the completed-sales totals while counting it separately under refunds. All test fixtures — including the Inventory warehouse/item created solely for this test — deleted afterward.

**Build result at the time:** Passed — 95 routes total (83 before Phase 14; 89 after Analytics's 6 new routes; 95 after POS's 6 new routes). Both deployments confirmed `READY` via `vercel --prod`.

**Known issues at the time:** POS's/Analytics's lack of data-level scoping and Accounting linkage (still current), POS sales limited to three fixed UI line slots (still current), POS's theoretical stock-availability race window (still current), plus all previously carried-forward gaps.

**Next recommended step (at the time):** Get explicit direction on what came after POS — the only remaining candidate from the original `docs/PRODUCT_VISION.md` list was Projects. The user also asked, separately, whether a full ERP system or a cloud-hosting change was warranted — answered inline in conversation (short version: this platform already functions as a modular ERP once Projects ships; the current Vercel + Neon stack scales fine for growth, the main levers being plan tier and Postgres connection pooling, not a re-architecture). The user then said "ok do the next," leading directly into the Phase 16 work above.

---

## Summary of what was done (Phase 12 — Procurement)

User asked to build Procurement and Payroll after HR ("lets proceed with with procurement and payroll"). Designed a request→order→receive flow with a genuine cross-module integration: receiving an order line linked to a real `InventoryItem` calls Inventory's own `recordMovement()` to post an actual stock `RECEIPT` (documented in `docs/DECISIONS.md`). An order's status is derived from its lines' received-vs-ordered quantities on every receipt; approving a request and creating an order that references it auto-converts the request.

## Summary of what was done (Phase 13 — Payroll)

Built immediately after Procurement. `PayrollCompensation` references `HrEmployee` by id rather than modifying `HrEmployee` itself. `processRun()` computes gross/tax/net for every eligible employee and completes the run inside one transaction. Deliberately not integrated with Accounting in this pass.

**Build result at the time:** Passed — 83 routes total (71 before Phase 12; 77 after Procurement; 83 after Payroll). Both deployments confirmed `READY` via `vercel --prod`.

**Known issues at the time:** Procurement's/Payroll's lack of data-level scoping (still current), neither yet linked to Accounting (still current), Procurement orders single-line only in the UI (still current), plus all previously carried-forward gaps.

**Next recommended step (at the time):** Get explicit direction on what followed Payroll — candidates were Projects or Analytics. The user asked to finish with Analytics then add POS, leading directly into the Phase 14/15 work above.

---

## Files changed (Phase 10 — Accounting + Phase 11 — HR)

**Accounting — Created:** `prisma/migrations/20260720180000_add_accounting_module/migration.sql`; `src/modules/accounting/{service.ts,navigation.tsx,dashboard-widget.tsx}`; `src/app/app/accounting/layout.tsx`, `src/app/app/accounting/page.tsx`, and six route trees (`accounts`, `invoices`, `expenses`, `journal`, `reports`, `settings`), each with `page.tsx` + `actions.ts`.

**HR — Created:** `prisma/migrations/20260720200000_add_hr_module/migration.sql`; `src/modules/hr/{service.ts,navigation.tsx,dashboard-widget.tsx}`; `src/app/app/hr/layout.tsx`, `src/app/app/hr/page.tsx`, and five route trees (`employees`, `leave`, `reviews`, `settings` each with `page.tsx` + `actions.ts`; `reports` is read-only, `page.tsx` only).

**Modified:** `prisma/schema.prisma` (Accounting + HR models and back-relations on `User`/`Organization`/`Branch`); `src/lib/auth/permissions.ts` (6 new `ACCOUNTING_*` + 6 new `HR_*` keys); `src/platform/modules/registry.ts` (`accounting` and `hr` both flipped from `coming-soon` to `available`); `src/platform/modules/dashboard-widgets.tsx` (both widgets registered); `package.json` (`postinstall` script added — see architecture note above).

**Database (via one-off scripts, not committed):** seeded 6 `Permission` rows each for `accounting.*` and `hr.*`, granted them to Super Admin/Organization Owner, created the "Accounting Manager" and "HR Manager" system roles, enabled both modules for the demo organization (`Rock Frost Demo Fleet`, tenant code `rock-frost-demo-fleet`).

## Summary of what was done (Phase 10 — Accounting)

User asked to build Accounting and HR after Inventory, and to add a standing rule to always check Vercel deployment status after pushing (added above and to persistent memory). Immediately before this, a real Vercel build failure was reported and fixed: a stale generated Prisma Client (predating the CRM/Inventory schema) caused `Module has no exported member 'CrmActivityType'` on production — fixed with the `postinstall` script described above, verified by wiping the local generated client and confirming a fresh install+build succeeds, then confirmed on an actual `vercel --prod` deployment (`READY`).

For Accounting, designed a genuinely functioning minimal double-entry ledger rather than a UI over disconnected records: `AccountingAccount`/`AccountingJournalEntry`/`AccountingJournalLine` are the real source of truth for balances, and `AccountingInvoice`/`AccountingExpense` post journal entries at realistic lifecycle points (sent/paid) via a shared `postJournalEntry()` transaction helper, validated for balance. Five default accounts (Cash, AR, AP, Revenue, General Expenses) are created lazily per organization.

**Verified with real bookkeeping arithmetic**: created a custom expense account and a linked expense category, then ran invoice send (correctly posted AR 500.00 / Revenue 500.00) → invoice full payment (correctly posted Cash 500.00, zeroed AR) → expense approve → expense pay (correctly posted the custom account 200.00, reduced Cash to 300.00) → a manual balanced journal entry (Cash +50 / Revenue +50) — Reports page correctly computed revenue 550.00, expenses 200.00, net income 350.00, matching hand-calculated expectations exactly. All test fixtures deleted afterward.

## Summary of what was done (Phase 11 — HR)

Built immediately after Accounting per the same instruction. `HrEmployee` uses a self-relation for manager/reports (mirroring an org chart), with a status lifecycle (`ONBOARDING` → `ACTIVE` ⇄ `ON_LEAVE` → `TERMINATED`). Deliberately did not build a separate onboarding checklist/workflow — chose to treat onboarding as an employee status plus an "Activate" action, matching the project's own established precedent for not fabricating UI around a concept with nothing real behind it yet.

**Verified end-to-end**: created a manager employee and activated them, created a second employee reporting to that manager (confirming the manager select only offers ACTIVE/ON_LEAVE employees), cycled it through ACTIVE → ON_LEAVE → ACTIVE, submitted a 3-day leave request (confirmed `daysBetween()` computed exactly 3 for a 3-calendar-day inclusive range) and approved it, submitted and rejected a second request, created a review with no rating and confirmed the "Complete" action correctly refuses it (`error=incomplete`), then created a second review with a rating and confirmed "Complete" succeeds and shows COMPLETED with the rating. Reports page correctly aggregated headcount by department. All test fixtures deleted afterward.

**Build result at the time:** Passed. `npm run lint` clean, `npx tsc --noEmit` clean, `npx prisma validate` succeeds, `npm run build` succeeds — 71 routes total (58 before Phase 10; 65 after Accounting's 7 new routes; 71 after HR's 6 new routes). Accounting's deployment confirmed live via `vercel --prod` (`READY`) before starting HR.

**Known issues at the time:** Accounting's/HR's lack of data-level scoping (still current, see above), Accounting not yet linked to Fleet/Installment (still current), HR no attendance/timesheet tracking (still current), Inventory's/CRM's carried-forward gaps, owner-facing maintenance approval portal (Fleet), file/photo upload for maintenance requests (Fleet), fuzzy duplicate-detection on create, hard deletes for financial records, branch-level access enforcement, public self-registration, unset `RESEND_API_KEY`, inert organization switcher.

**Next recommended step (at the time):** Get explicit direction on which module followed HR — candidates were Procurement, Projects, or Analytics. The user asked for Procurement and Payroll together, leading directly into the Phase 12/13 work above.

---

## Files changed (Phase 9 — Inventory Management)

**Created:** `prisma/migrations/20260720160000_add_inventory_module/migration.sql`; `src/modules/inventory/{service.ts,navigation.tsx,dashboard-widget.tsx}`; `src/app/app/inventory/layout.tsx`, `src/app/app/inventory/page.tsx`, and six route trees (`items`, `warehouses`, `stock`, `movements`, `reports`, `settings`) — `stock` is read-only (no `actions.ts`), the other five each have `page.tsx` + `actions.ts`.

**Modified:** `prisma/schema.prisma` (Inventory models + back-relations on `User`/`Organization`/`Branch`); `src/lib/auth/permissions.ts` (6 new `INVENTORY_*` keys); `src/platform/modules/registry.ts` (`inventory` flipped from `coming-soon` to `available`); `src/platform/modules/dashboard-widgets.tsx` (Inventory widget registered).

**Database (via one-off scripts, not committed):** seeded 6 `Permission` rows for `inventory.*`, granted them to Super Admin/Organization Owner, created the "Inventory Manager" system role, enabled the `inventory` module for the demo organization (`Rock Frost Demo Fleet`, tenant code `rock-frost-demo-fleet` — note this is *not* `demo`, worth remembering if a future script needs to target it directly).

## Summary of what was done (Phase 9 — Inventory Management)

User chose "Inventory" as the next module after CRM (via an AskUserQuestion offering Inventory / Accounting / HR-Payroll). Like CRM, no inventory-shaped models existed in the schema (Installment's `HirePurchaseStaffInventory` is a narrow per-staff-member unit counter, not a general warehouse/stock system, so it wasn't reused). Designed five new models from scratch — `InventoryCategory`, `InventoryWarehouse`, `InventoryItem`, `InventoryStock` (a per item×warehouse quantity row), and `InventoryMovement` (an audit-trail row for every receipt/issue/adjustment/transfer) — migrated via the established safe `migrate diff` + manual migration folder + `migrate deploy` workflow (confirmed purely additive).

The one function with real logic, `recordMovement()`, runs the stock-quantity update and the audit-trail row inside a single `db.$transaction`: `RECEIPT` adds to one warehouse, `ISSUE` subtracts (rejecting if insufficient), `ADJUSTMENT` applies a signed delta (rejecting if it would go negative), and `TRANSFER` subtracts from a source warehouse and adds to a distinct destination warehouse in the same transaction (rejecting insufficient stock or a same-warehouse transfer). Built all six pages (Items, Warehouses, Stock, Movements, Reports, Settings) plus an overview page and dashboard widget, following the exact pattern established by Fleet/Installment/CRM. Every action file was written with the `revalidatePath()`-before-`redirect()` pattern from the start — no repeat of Phase 8's discovery needed.

**Verified with real arithmetic, not just "no error thrown"**: created a test item (cost price 10.50, reorder point 5) and two warehouses, then ran a full receipt → transfer → issue → adjustment sequence via Playwright, confirming exact quantities at every step — 20 received into Warehouse A, correctly 12/8 after an 8-unit transfer to Warehouse B, correctly 5 in B after a 3-unit issue, correctly 10 in A after a −2 adjustment — and confirmed a subsequent over-large issue (999 units) was rejected with `error=insufficient-stock` and left stock unchanged. Reports page correctly computed total stock value as 157.50 (15 total units × 10.50) and correctly showed zero low-stock items (15 > reorder point of 5). All test fixtures (item, both warehouses, two lead — categories) deleted afterward via a one-off cleanup script.

**Build result at the time:** Passed. `npm run lint` clean, `npx tsc --noEmit` clean, `npx prisma validate` succeeds, `npm run build` succeeds — 58 routes (up from 51; 7 new Inventory routes).

**Known issues at the time:** Inventory's lack of data-level scoping and cross-module linkage (both still current, see above), CRM's lack of data-level scoping (still current), owner-facing maintenance approval portal (Fleet), file/photo upload for maintenance requests (Fleet), fuzzy duplicate-detection on create, hard deletes for financial records, branch-level access enforcement, public self-registration, unset `RESEND_API_KEY`, inert organization switcher.

**Next recommended step (at the time):** Get explicit direction on which module followed Inventory — candidates were Accounting, HR/Payroll, Procurement, Projects, or Analytics. The user asked for Accounting and HR (HRM) together, plus the standing deployment-check rule now in the "Mandatory instructions" section, leading directly into the Phase 10/11 work above.

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

### 2026-07-21 — Claude Code — Hardening Pass 3b (Zod validation foundation, public contact form, CRM/HR/Fleet IDOR audit)

See "Files changed (Hardening Pass 3b...)," "Summary of what was done (Hardening Pass 3b)," "Build result (Hardening Pass 3b)," "Known issues / deliberate gaps (current)," and "Next recommended step" above — kept in the current-state sections rather than duplicated here, since this is the most recent entry. Full plan and Pass 3c+ scope in `docs/HARDENING_PLAN.md`.

### 2026-07-21 — Claude Code — Hardening Pass 3a (invitation redesign)

See "Files changed (Hardening Pass 3a...)" and "Summary of what was done (Hardening Pass 3a)" above, plus the "at the time" Build result/Known issues/Next recommended step notes appended.

### 2026-07-21 — Claude Code — Hardening Pass 2 (financial/inventory transaction integrity)

See "Files changed (Hardening Pass 2...)" and "Summary of what was done (Hardening Pass 2)" above, plus the "at the time" Build result/Known issues/Next recommended step notes appended.

### 2026-07-21 — Claude Code — Hardening Pass 1 (tenant guard, session revocation, dashboard leak, top IDOR paths)

See "Files changed (Hardening Pass 1...)" and "Summary of what was done (Hardening Pass 1)" above, plus the "at the time" Build result/Known issues/Next recommended step notes appended.

### 2026-07-20 — Claude Code — Phase 16 (Projects)

See "Files changed (Phase 16 — Projects)," "Summary of what was done (Phase 16 — Projects)," plus the "at the time" Build result/Known issues/Next recommended step notes appended.

### 2026-07-20 — Claude Code — Phase 14 (Analytics) + Phase 15 (POS)

See "Files changed (Phase 14 — Analytics + Phase 15 — POS)," "Summary of what was done (Phase 14 — Analytics)," "Summary of what was done (Phase 15 — POS)," plus the "at the time" Build result/Known issues/Next recommended step notes appended.

### 2026-07-20 — Claude Code — Phase 12 (Procurement) + Phase 13 (Payroll)

See "Summary of what was done (Phase 12 — Procurement)" and "Summary of what was done (Phase 13 — Payroll)" above, plus the "at the time" Build result/Known issues/Next recommended step notes appended.

### 2026-07-20 — Claude Code — Phase 10 (Accounting) + Phase 11 (HR) + Vercel postinstall fix

See "Files changed (Phase 10 — Accounting + Phase 11 — HR)" and "Summary of what was done (Phase 10 — Accounting)"/"Summary of what was done (Phase 11 — HR)" above, plus the "at the time" Build result/Known issues/Next recommended step notes appended.

### 2026-07-20 — Claude Code — Phase 9 (Inventory Management)

See "Files changed (Phase 9 — Inventory Management)" and "Summary of what was done (Phase 9 — Inventory Management)" above, plus the "at the time" Build result/Known issues/Next recommended step notes appended to that summary.

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
## 2026-07-26 — Tenant login copy, GLV staff lifecycle, and subscription-state indication

Removed the tenant-login cross-surface notice while preserving the platform
owner notice. Audited Installment staff management against the original GLV
project and added deactivation plus password-and-`DELETE`-confirmed permanent
deletion. Customer, installment-account, or salary-payment history blocks
deletion and directs the administrator to deactivate the profile; linked
Business Suite membership accounts are deliberately preserved.

Tenant application pages now identify the workspace as Trial, Subscribed, or
inactive. Trial display uses the documented 14-day window from organization
creation. Both manual and gateway subscription activation now promote the
organization from `TRIAL` to `ACTIVE`, keeping the badge consistent with paid
access.

Important files: `src/app/(auth)/login/page.tsx`,
`src/app/app/layout.tsx`, `src/app/app/installment/staff/{page,actions}.tsx`,
`src/modules/installment/service.ts`,
`src/platform/subscriptions/service.ts`,
`test/subscription-{workflow,gateway-payment}.test.ts`,
`docs/{INSTALLMENT_GLV_PARITY,BILLING_AND_SUBSCRIPTIONS}.md`, and `README.md`.
No schema migration or environment change is required.

Validation: `npm run lint` passed; the affected suite passed 17/17; the full
`npm run test` suite passed 197/197 across 28 files; and `npm run build`
compiled, type-checked, and generated all 116 pages successfully. The initial
affected-test run exposed two stale transaction mocks after organization
activation was added; both tests were updated to assert the new state
transition. Remaining risk: the 14-day trial is currently indicated but is not
automatically expired; operators must suspend or convert it after the window.
## 2026-07-26 — Complete public-site technical SEO foundation

Replaced the stale static sitemap and permissive robots file with Next.js
metadata routes. The sitemap now contains only real public pages and dedicated
landing pages for all eleven business modules; `/app`, `/api`, login, password,
and invitation routes are excluded from crawling and also emit `noindex`.

Added a single canonical SEO configuration, unique page titles/descriptions,
canonical URLs, Open Graph and Twitter cards, a generated 1200×630 sharing
image, Organization/WebSite/SoftwareApplication/Breadcrumb JSON-LD, stronger
internal footer/module links, and truthful module-focused search content.
Removed stale public copy that said completed modules were still forthcoming.

Important files: `src/lib/seo.ts`, `src/app/{robots,sitemap,opengraph-image}.tsx`,
`src/components/seo/json-ld.tsx`,
`src/app/(public)/modules/[moduleKey]/page.tsx`, all six existing public pages,
the public/auth/application layouts, `public/manifest.webmanifest`,
`test/seo.test.ts`, and `docs/SEO.md`. Static `public/robots.txt` and
`public/sitemap.xml` were removed to prevent competing output. No schema or
environment changes are required.

External owner action remains required: verify the `rockfrostgroup.com` Domain
property in Google Search Console using Google's account-specific Cloudflare
TXT record, submit `https://www.rockfrostgroup.com/sitemap.xml`, and request
indexing for priority pages. Exact steps are in `docs/SEO.md`. Technical SEO
can be made complete, but no implementation can truthfully guarantee a
specific Google ranking.

Validation before release: `npm run lint` passed; the new SEO tests passed
3/3; the full `npm run test` suite passed 200/200 across 29 files; and
`npm run build` compiled, type-checked, generated 130 pages, and statically
prerendered all eleven module landing pages. A local production-server probe
confirmed HTTP 200 responses, unique titles, canonical tags, JSON-LD,
generated robots/sitemap output, and `noindex, nofollow, nocache` on login.
Production verification is completed after deployment.
