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

## Phase 4 — Platform Workspace ✅

- Organization switcher (cookie-based active-organization selection, real for any user with more than one membership — today every demo user has exactly one, so it renders as a plain label rather than a fake single-item dropdown), Notifications, Organization, and Administration pages all wired to real data.
- Role-based access control: `/app/platform/*` gated to the "Super Admin" system role; Administration/Organization gated on `org.settings.manage`; Fleet/Installment gated on module enablement plus any permission under that module's prefix (`fleet.*` / `hirepurchase.*`) — this prefix-based check specifically so roles like Investor (which holds `fleet.investor.view` but not `fleet.view`) still reach the module. Workspace navigation filters Administration/Organization out for roles without `org.settings.manage`.
- Module activation: `OrganizationModule.enabled` (real DB state, not a global "available" flag) drives the module launcher, `/app/modules`, and the dashboard's enabled-module summary — three real states: open (built + enabled), not enabled (built but organization hasn't activated it), coming soon (not built yet). Platform operators can toggle activation per organization from `/app/platform/organizations`.
- Admin-facing "send an invite" UI (deferred from Phase 3) now exists on `/app/administration`, reusing the Phase 3 invite-token/email infrastructure. "Super Admin" is deliberately excluded from the invitable-role list — it's Rock Frost's own operator role, not something a tenant should be able to grant.
- Platform Activity now reads real `AuditLog` rows (member invited, module enabled/disabled) instead of a placeholder.
- One data reconciliation performed as part of this phase: the `Module` table had a legacy `layaway` code that didn't match the `installment` key used everywhere in code, several modules were marked `ACTIVE` despite having no real pages, and an orphaned `pos` module row existed with no registry counterpart. All three fixed to match the current registry (see `OPERATOR_HANDOFF.md`'s Phase 4 entry for exact detail).

**Status: complete.** See `OPERATOR_HANDOFF.md` for the detailed session record.

## Phase 5 — Module Framework ✅

- `ModuleDefinition` (`src/types/module.ts`) gained `permissionPrefix` — the single source of truth for which permission prefix grants entry to a module, consumed by `canAccessModule()` in `src/lib/auth/permissions.ts` (previously a separate, duplicated map).
- Dashboard widget registration: `src/platform/modules/dashboard-widgets.tsx` maps a module key to a real Server Component that fetches its own org-scoped summary data, rendered by the organization dashboard for any enabled module that has one. Deliberately a file separate from `registry.ts`, since `registry.ts` is also imported by the client-side `ModuleLauncher` and a widget's server-only data fetching must not leak into that bundle.
- Subscription/billing gating: still correctly out of scope — no `Subscription`/billing model exists in the schema. Module activation itself (which is the actual gating mechanism today) was already built in Phase 4.

**Status: complete.** See `OPERATOR_HANDOFF.md` for the detailed session record.

## Phase 6 — First Complete Module: Fleet Management ✅

Full CRUD across all nine Fleet areas — Vehicles, Drivers, Owners, Maintenance, Insurance & Roadworthy, Payments, Work & Pay, Reports, Settings — built on the Prisma models that already existed in the schema (`FleetVehicle`, `FleetDriver`, `FleetOwner`, `FleetVehicleDocument`, `FleetMaintenanceRequest`, `FleetPayment`, `FleetWorkAndPayContract`). Real org-scoped service layer at `src/modules/fleet/service.ts`; every query and mutation filters by `organizationId`, per `docs/MODULE_BOUNDARIES.md`. Each page gates its create/edit controls on the specific `fleet.*.manage` permission for that area (view access is implied by reaching the module at all); Reports is gated separately on `fleet.reports.view` since Driver/Mechanic don't hold it.

Fleet Settings is a deliberate honest placeholder — there's no fleet-wide configuration concept in the schema yet, so the page says so rather than fabricating options with nothing behind them.

Installment Management work was not started during this phase, per the roadmap's own sequencing rule.

**Status: complete.** See `OPERATOR_HANDOFF.md` for the detailed session record.

## Phase 7 — Installment Management Migration ✅

Reference implementation: `C:\Users\andre\glv-management-system` (the "GLV" system). Before writing any code, an Explore agent extracted GLV's *actual* behavior (not its aspirational settings UI) — see `OPERATOR_HANDOFF.md`'s Phase 7 entry for the full extraction. Key finding: several of GLV's own settings fields (commission, payroll day, administration fee, minimum deposit, delivery-after-completion) are stored and editable in its UI but **never read by any calculation** — confirmed by GLV's own operator doc ("always distinguish 'saved' from 'effective'"). This module's Settings page (`/app/installment/settings`) is upfront about the same distinction here: a "used in calculations" section and a "reserved for future use" section, rather than silently implementing untested rules GLV itself never validated.

**Migrated as real, validated logic** (`src/modules/installment/service.ts`): installment scheduling (product-level `duration`/`dailyAmount`/`price`, with a price-floor validation), payment allocation with automatic overpayment-credit creation, a 3-hour payment edit window with full-recalculation-on-edit, receipt/customer/staff code generation (per-year, per-staff sequences), atomic staff-inventory consumption on account creation (a hard stock gate, restored on cancellation), the account lifecycle sweep (dormant/probation/closed/archived, computed lazily on report/list reads rather than a cron), automatic closure-refund credits with a configurable service-fee percentage, dormant-account reactivation, the procurement-readiness list (product restock threshold), and the admin summary / staff performance / weekly collections reports.

**Deliberately not migrated** (GLV has no real reference implementation for these — confirmed dead code there, not just "not gotten to yet"): commission calculation, payroll-day-triggered payroll, an administration fee, minimum-deposit enforcement, and applying a credit to a future payment (the `APPLIED` credit status exists in the schema but no code path — in GLV or here — ever sets it). Also not migrated: GLV's step-up re-authentication pattern (re-entering a password for sensitive mutations) and its fuzzy duplicate-detection on customer/product creation — both real GLV features, deferred here as scope-control decisions rather than migration gaps.

**Staff scoping**: a field-staff role (holding `hirepurchase.customers.manage` etc. but not `hirepurchase.staff.manage`) sees and manages only their own assigned customers/accounts/payments/credits — a manager (holding `hirepurchase.staff.manage`) sees everything. This mirrors GLV's real staff-scoping rule.

**Status: complete.** See `OPERATOR_HANDOFF.md` for the detailed session record.

## Later phases (not scoped in detail yet)

Billing/subscriptions, additional modules (CRM, Inventory, Accounting, HR, Payroll, Procurement, Projects, Analytics) per `docs/PRODUCT_VISION.md`, production hardening.
