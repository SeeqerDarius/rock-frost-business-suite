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
- `lib/tenant/index.ts` exists (`getCurrentTenant()` / `requireCurrentTenant()`) — resolves the signed-in user's `Organization` and `Branch` (if assigned) from their `OrganizationMember` row. This is Phase 3 of `docs/DEVELOPMENT_ROADMAP.md`.
- This only resolves/reads tenant context for display purposes so far (Topbar, profile page, and the auth-protection gate). It does **not** yet scope any actual data queries — there's nothing to scope yet since Fleet still uses mock data (Phase 6, still gated per the rule below).

Fleet module status:
- Fleet is the first SaaS business module.
- Fleet UI routes exist for overview, vehicles, vehicle owners, drivers, insurance/roadworthy, maintenance, work-and-pay, payments, reports, settings, and investor dashboard.
- Fleet pages currently use mock data from `lib/fleet/index.ts`.
- Do not replace mock data with database data until the database integration phase is explicitly approved.

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
- Do not replace mock data with database data until the database phase is approved.
- Do not implement payment gateways yet.
- Do not implement real production auth until database integration is ready.
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
- `/settings` (planned; not currently present as a root route)
- `/profile`
- `/notifications` (planned; not currently present)
- `/admin` (planned; not currently present)
- `/organizations` (planned; not currently present)

## Latest Handoff Log

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
