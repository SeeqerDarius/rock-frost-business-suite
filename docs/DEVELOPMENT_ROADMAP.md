# Development Roadmap

This supersedes the archived roadmap under `docs/archive/previous-implementation/`. Do not follow that document.

Each phase below is gated — do not start the next phase without checking in, per the project's own operating rule ("do not continue beyond the first clean foundation milestone without approval").

## Phase 1 — Foundation and Design System ✅ (this rebuild's first milestone)

- Clean Next.js application under `src/`, TypeScript strict mode, Tailwind CSS v4.
- shadcn/ui (Base UI) design system: buttons, cards, tables, dialogs, drawers (sheets), forms primitives, notifications (toast), empty states, dark mode.
- Public website shell, login page (UI only), workspace shell, module launcher.
- Empty platform dashboard, empty organization dashboard, empty Fleet module shell, empty Installment module shell.
- Module isolation enforced structurally (separate route-group layouts per module — see `docs/ARCHITECTURE.md`).

**Status: complete.** See `OPERATOR_HANDOFF.md` for the detailed session record.

## Phase 2 — Public Website ✅

- Full marketing site: Home, Solutions, Modules, Industries, Company, Contact — real content, not just the minimal shell built in Phase 1.
- `PublicHeader` expanded to the full primary nav now that all target pages exist.
- Structural correction made first: authenticated routes moved under `/app/*` to eliminate a real collision between the new public `/modules` marketing page and Phase 1's authenticated `/modules` (module launcher) — see `docs/ARCHITECTURE.md`'s "Why /app exists."
- Contact page includes a request-demo path via a reason selector (UI only, no backend — same treatment as login).

**Status: complete.** See `OPERATOR_HANDOFF.md` for the detailed session record.

## Phase 3 — Authentication ✅

- NextAuth v4 (credentials provider, JWT sessions), Neon Postgres, Prisma — reconnected to the existing database, no schema changes.
- Real sessions: `UserMenu`, the login form, and the `/app/*` layout guard all use `getServerSession`/`useSession` — no placeholders remain.
- Password reset and invite-acceptance flows built on a reused `VerificationToken` model (single-use, expiring tokens) and server actions.
- Route protection: `src/app/app/layout.tsx` redirects unauthenticated requests to `/login` and checks tenant membership for every page under `/app/*`.
- Contact form now sends real email via Resend, with graceful degradation (logs instead of failing) when `RESEND_API_KEY` is unset.
- Deferred to Phase 4: admin-facing "send invite" UI, public self-registration, login rate limiting/lockout.

**Status: complete.** See `OPERATOR_HANDOFF.md` for the detailed session record.

## Phase 4 — Platform Workspace (not started)

- Wire the organization switcher, notifications, and administration pages to real data.
- Role-based access control wired into navigation (hide/guard nav items a role can't use) and into every module's server-side queries.
- Module activation: an organization's actually-enabled modules (not just "available" vs "coming soon" globally) should drive what the module launcher and workspace dashboard show.

## Phase 5 — Module Framework (partially started in Phase 1)

`src/platform/modules/registry.ts` already exists as the module registration system (key, name, description, icon, route prefix, navigation, status). This phase extends it with what Phase 1 didn't need yet: required permissions per module, dashboard widget registration, subscription/billing gating.

## Phase 6 — First Complete Module: Fleet Management (not started)

Build Fleet Management completely — vehicles, drivers, owners, maintenance, insurance/roadworthy, payments, work-and-pay, reports, settings — before starting Installment. Real Prisma models (organization + branch scoped), real service layer under `src/modules/fleet/`, real pages replacing the current `EmptyState` shell at `app/fleet/page.tsx` (URL `/app/fleet`).

Do not begin Installment Management work during this phase.

## Phase 7 — Installment Management Migration (not started)

Reference implementation: `C:\Users\andre\glv-management-system` (the "GLV" system) — a proven, working installment/layaway management application. Treat it as a source of validated business rules, not a template to copy wholesale:

**Extract and migrate:**
- Valid business rules and validated calculations (e.g. installment scheduling, payment allocation, product/account lifecycle logic)
- Relevant database concepts (adapted to this platform's organization/branch-scoped schema, not copied as a standalone single-tenant schema)
- Customer, payment, product, and account workflows
- Reporting logic
- Necessary historical-compatibility considerations

**Do not migrate as-is:**
- GLV's standalone layout, authentication, or navigation — the Installment module uses this platform's shared workspace shell and (once built) shared authentication
- Unrelated technical debt from the reference implementation

The migrated module must remain functionally accurate to the validated business rules while visually and structurally matching this platform's design system (`docs/DESIGN_SYSTEM.md`) and module boundaries (`docs/MODULE_BOUNDARIES.md`).

## Later phases (not scoped in detail yet)

Billing/subscriptions, additional modules (CRM, Inventory, Accounting, HR, Payroll, Procurement, Projects, Analytics) per `docs/PRODUCT_VISION.md`, production hardening.
