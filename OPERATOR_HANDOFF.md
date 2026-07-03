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
- Dashboard routes are protected through the current auth-protection foundation.
- Existing dashboard UI should remain stable while platform foundations are added.

Fleet module status:
- Fleet is the first SaaS business module.
- Fleet UI routes exist for overview, vehicles, vehicle owners, drivers, insurance/roadworthy, maintenance, work-and-pay, payments, reports, settings, and investor dashboard.
- Fleet pages currently use mock data from `lib/fleet/index.ts`.
- Do not replace mock data with database data until the database integration phase is explicitly approved.

Auth foundation status:
- NextAuth foundation has been started with credentials-based demo authentication.
- Auth API route exists at `app/api/auth/[...nextauth]/route.ts`.
- Auth helpers and type augmentation exist under `lib/auth/`.
- Login, forgot-password, reset-password, invite, and profile pages exist.
- This is not production auth yet; do not implement production auth until database integration is ready.

Prisma/database status:
- Prisma and Prisma Client are installed.
- `prisma/schema.prisma` exists with initial multi-tenant platform, NextAuth-compatible, RBAC, module, audit, notification, file, and fleet models.
- `lib/db.ts` exists as a server-only Prisma Client singleton.
- `.env.example` has database and NextAuth environment variables.
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
