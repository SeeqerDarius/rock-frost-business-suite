# Module Boundaries

This is the non-negotiable contract every future phase of this project must respect. It exists because the previous implementation violated it repeatedly and that's the direct reason for this rebuild — see `docs/DECISIONS.md`.

## The rule

Every page belongs to exactly one of three scopes:

1. **Platform scope** (`app/platform/*`, URL `/app/platform/*`) — Rock Frost operators managing the SaaS across every tenant organization. Organizations, subscriptions, module activation, platform-wide activity.
2. **Organization scope** (`app/(overview)/*`, URL `/app/*`) — a single organization's cross-module concerns: an overview dashboard, the module launcher, cross-module reports, notifications, organization profile, and administration (users/roles/permissions/audit).
3. **Module scope** (`app/<module>/*`, URL `/app/<module>/*`) — one module's own business data and workflows.

(Public marketing pages — home, `/solutions`, `/modules`, `/industries`, `/company`, `/contact` — are a fourth, unauthenticated scope outside this three-way split; see `docs/ARCHITECTURE.md`'s "Why /app exists" for why the authenticated app and the public site don't share a URL namespace.)

There must be no ambiguous pages — a page that shows a bit of Fleet and a bit of Installment "for convenience" does not have a home in this structure, and should not be built.

## Concretely, Fleet must never display

- installment customers
- layaway/installment payments
- installment products
- customer installment balances or account statuses
- installment collection reports

## Concretely, Installment must never display

- drivers
- vehicles
- fleet owners
- vehicle maintenance records
- insurance/roadworthy records
- fleet work-and-pay contracts

## Cross-module data

CRM data must not appear inside Fleet or Installment pages unless there is a deliberate, documented integration (recorded in `docs/DECISIONS.md`, not silently added). The same applies to Accounting data appearing inside any other module. If a future feature genuinely needs cross-module data (e.g. an organization-wide report combining Fleet revenue and Installment collections), it belongs in **organization scope** (`/reports`), built as its own explicit cross-module reporting feature — not smuggled into a module page.

## How this is enforced today

Structurally, via nested layouts — see `docs/ARCHITECTURE.md`'s "How module isolation is enforced structurally" section. Each module route tree has its own `layout.tsx` with its own `AppShell` instance and its own navigation array; there is no shared conditional-sidebar logic that could drift.

As of Phase 6 this is real for Fleet, not just aspirational — `src/modules/fleet/service.ts` is the pattern every future module's service layer should follow:

- Every module-owned database record must carry `organizationId` (and `branchId` where relevant) — see `docs/DATABASE_STRATEGY.md`. Every function in `src/modules/fleet/service.ts` takes `organizationId` as an explicit parameter and filters on it in the Prisma call itself (`where: { id, organizationId }` on updates, not just on the initial list query) — assume a user can hit any URL or call any server action directly, not just navigate through the UI.
- Permission checks are module-specific (`fleet.vehicles.manage`, `fleet.reports.view`, etc. — see `docs/AUTHENTICATION_AND_AUTHORIZATION.md`), not one shared "can access dashboard" flag reused across modules. Fleet additionally distinguishes *viewing* a module (reachable with any permission under the module's prefix) from *mutating* a specific area (gated on that area's own `.manage` permission) — a page can be visible without its create/edit controls being visible.
- Installment's service layer (`src/modules/installment/service.ts`, Phase 7) follows the same shape, plus a data-level scoping helper (`resolveInstallmentStaffScope`) that Fleet doesn't need yet — a field-staff user is restricted to their own assigned customers/accounts, on top of the organization-wide filtering every function already does.
- CRM's service layer (`src/modules/crm/service.ts`, Phase 8) is the third module built on this pattern, with no data-level scoping beyond organization-wide filtering (every contact/lead/deal/activity is visible to anyone holding the relevant `crm.*` permission — there is no per-owner restriction analogous to Installment's field-staff scoping).
- Inventory's service layer (`src/modules/inventory/service.ts`, Phase 9) is the fourth module on this pattern. Its one real business-logic function, `recordMovement()`, runs entirely inside a single `db.$transaction` — every stock quantity change and its audit-trail `InventoryMovement` row are written atomically, the same discipline Installment's `createAccount`/`recordPayment` established for inventory-consuming and payment-recording transactions.
- Accounting's service layer (`src/modules/accounting/service.ts`, Phase 10) is the fifth module on this pattern, and the first with a genuine double-entry ledger: every account balance is derived from `AccountingJournalEntry`/`Line` rows rather than stored directly, and invoices/expenses post journal entries via the shared `postJournalEntry()` transaction helper at the specific lifecycle point a real bookkeeper would (sent/paid), not at record creation.
- HR's service layer (`src/modules/hr/service.ts`, Phase 11) is the sixth module on this pattern, with organization-wide visibility only (no data-level scoping, same as CRM and Inventory) — any user holding an `hr.*` permission sees every employee/leave request/review in the organization.
- Procurement's service layer (`src/modules/procurement/service.ts`, Phase 12) is the seventh module, and the first to call into a second module's service function as its core behavior: receiving a purchase order line calls Inventory's `recordMovement()` directly (a deliberate, documented integration — see `docs/DECISIONS.md`'s 2026-07-20 entry) rather than duplicating Inventory's stock-quantity logic. This is the model for any future "Module A's workflow genuinely requires Module B's real capability" integration: call the other module's public service function, never reach into its Prisma models directly, and document the decision.
- Payroll's service layer (`src/modules/payroll/service.ts`, Phase 13) is the eighth module. It references `HrEmployee` by id (an employee is who Payroll pays) but owns all of its own tables (`PayrollCompensation`, `PayrollRun`, `PayrollPayslip`, `PayrollSettings`) rather than adding salary fields onto `HrEmployee` itself — the same "reference by id, don't reach into another module's model" discipline as Procurement's Inventory integration, just without a service-to-service call since Payroll only reads employee status/id, it doesn't invoke any HR behavior.
- Analytics's service layer (`src/modules/analytics/service.ts`, Phase 14) is the ninth module, and structurally unique: it owns **no database tables at all**. It calls every other enabled module's own summary function and combines the results — this is the sanctioned home for genuine cross-module reporting referenced earlier in this document (the pre-existing organization-scope `/app/reports` placeholder now points here rather than duplicating the same aggregation).
- POS's service layer (`src/modules/pos/service.ts`, Phase 15) is the tenth module, and the second (after Procurement) to call directly into Inventory's `recordMovement()` as real, load-bearing behavior — a completed sale posts a stock `ISSUE`, a refund posts a `RECEIPT`, both via Inventory's public service function only (see `docs/DECISIONS.md`'s 2026-07-20 POS entry).
- Projects's service layer (`src/modules/projects/service.ts`, Phase 16) is the eleventh module on this pattern, with organization-wide visibility only (same as CRM/Inventory/HR). It has no cross-module service calls, but does have two real guard-rail state transitions: `completeMilestone()` requires every task under the milestone to be `DONE`, and `completeProject()` requires every milestone on the project to be `COMPLETED` — the same "real validation logic, not just CRUD" discipline as HR's rating-required-before-review-completion.
- **Every mutating Server Action that redirects to a list page must call `revalidatePath()` on that page's path immediately before the `redirect()`** — see `docs/DEVELOPMENT_ROADMAP.md`'s "Router-cache bug fix" entry. Omitting this was a systemic gap across all of Fleet, Installment, and the first pass of CRM; it is now the required pattern for every action file, not an optional optimization.

## Adding a new module

The approved Hotel and School verticals follow the staged boundaries and
integration contracts in `HOTEL_AND_SCHOOL_MODULES.md`. In particular, Hotel
restaurant/stock workflows must call POS/Inventory services, and School
workforce/payroll workflows must call HR/Payroll services; neither vertical may
query another module's Prisma tables directly.

1. Add its entry to `src/platform/modules/registry.ts` (key, name, description, icon, `routePrefix` — must be `/app`-prefixed, e.g. `/app/crm` — status).
2. If it has real navigation, add `src/modules/<key>/navigation.tsx` and reference it from the registry entry. Every `href` in it must also be `/app`-prefixed.
3. Create its route tree under `src/app/app/<key>/` with its own `layout.tsx` wrapping `AppShell` with that module's navigation — copy the pattern from `app/fleet/layout.tsx` or `app/installment/layout.tsx`.
4. Do not add its nav items to `workspace-navigation.tsx` or another module's navigation file. Each module's nav lives only in its own file.
