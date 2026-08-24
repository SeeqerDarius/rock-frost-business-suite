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

### Consolidated product groups

Human Resources and Payroll are sold and presented as one customer-facing product, while retaining `hr.*` and `payroll.*` permission namespaces, routes, and data models. Inventory and Procurement follow the same pattern with `inventory.*` and `procurement.*`. This is a product and entitlement consolidation, not a destructive database merge. The internal boundaries remain deliberate because Payroll references employee records and Procurement posts receipts through Inventory's public service.

An active entitlement for either a primary or legacy group member expands to both internal module keys. This keeps existing subscriptions working and gives new primary-product subscriptions the complete workflow. Role permissions still determine which pages and actions a member can use. Public catalogue, request, pricing, sitemap, and platform sales controls expose only the primary `hr` and `inventory` products. Old public Payroll and Procurement URLs permanently redirect to their combined product pages.

CRM data must not appear inside Fleet or Installment pages unless there is a deliberate, documented integration (recorded in `docs/DECISIONS.md`, not silently added). The same applies to Accounting data appearing inside any other module. If a future feature genuinely needs cross-module data (e.g. an organization-wide report combining Fleet revenue and Installment collections), it belongs in **organization scope** (`/reports`), built as its own explicit cross-module reporting feature — not smuggled into a module page.

One deliberate workforce integration exists at the organization boundary. When HR is enabled, accepting or reactivating an internal organization membership, changing an active member to an internal role, or enabling HR creates a missing linked `HrEmployee`. This does not expose Fleet or any other module's operational records inside HR. It establishes the shared person identity that HR and Payroll require. Existing HR-managed fields are never overwritten, and external `Vehicle Owner` and `Investor` memberships are excluded.

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
- Procurement's service layer (`src/modules/procurement/service.ts`, Phase 12) is the seventh module, and the first to call into a second module's service function as its core behavior: receiving a purchase order line calls Inventory's `recordMovement()` directly (a deliberate, documented integration — see `docs/DECISIONS.md`'s 2026-07-20 entry, corrected 2026-08-14) rather than duplicating Inventory's stock-quantity logic. This is the model for any future "Module A's workflow genuinely requires Module B's real capability" integration: call the other module's public service function, never reach into its Prisma models directly, and document the decision. Inventory and Procurement remain two independent modules at the boundary level above (own tables, own permission prefixes, own routes) even though they are now presented to tenants as one combined product, "Inventory & Procurement" — see `docs/INVENTORY_PROCUREMENT_CONSOLIDATION.md`. That consolidation is UI/navigation composition on top of this existing boundary, not a change to it.
- Payroll's service layer (`src/modules/payroll/service.ts`, Phase 13) is the eighth module. It references `HrEmployee` by id (an employee is who Payroll pays) but owns all of its own tables (`PayrollCompensation`, `PayrollRun`, `PayrollPayslip`, `PayrollSettings`) rather than adding salary fields onto `HrEmployee` itself — the same "reference by id, don't reach into another module's model" discipline as Procurement's Inventory integration, just without a service-to-service call since Payroll only reads employee status/id, it doesn't invoke any HR behavior.
- Analytics's service layer (`src/modules/analytics/service.ts`, Phase 14) is the ninth module, and structurally unique: it owns **no database tables at all**. It calls every other enabled module's own summary function and combines the results — this is the sanctioned home for genuine cross-module reporting referenced earlier in this document (the pre-existing organization-scope `/app/reports` placeholder now points here rather than duplicating the same aggregation).
- `src/platform/business-insights/service.ts` is the platform-scope equivalent of the same pattern, one level up: it owns no tables either, and calls Analytics's own `getAnalyticsOverview()` per organization (never a module's Prisma models directly) to build a cross-tenant view for `/app/platform/dashboard`. It covers whichever modules Analytics itself covers today (fleet, installment, crm, inventory, accounting, hr, procurement, payroll) — POS, Projects, Hotel, School, Hostel, Pharmacy, and Hospital each have their own summary function but aren't wired into Analytics yet, so extending this platform view to them means extending Analytics first, not adding a second aggregation path. Money fields are grouped by each organization's own `currency` rather than summed across the whole platform — organizations aren't guaranteed to share one currency (a platform operator can set any 3-letter code per organization), so a single blended total would misrepresent the business.
- POS's service layer (`src/modules/pos/service.ts`, Phase 15) is the tenth module, and the second (after Procurement) to call directly into Inventory's `recordMovement()` as real, load-bearing behavior. A completed or resumed sale posts a stock `ISSUE`; each approved return line posts a `RECEIPT`. Both use Inventory's public service function only (see `docs/DECISIONS.md` and `docs/POS_OPERATIONS.md`).
- Projects's service layer (`src/modules/projects/service.ts`, Phase 16) is the eleventh module on this pattern, with organization-wide visibility only (same as CRM/Inventory/HR). It has no cross-module service calls, but does have two real guard-rail state transitions: `completeMilestone()` requires every task under the milestone to be `DONE`, and `completeProject()` requires every milestone on the project to be `COMPLETED` — the same "real validation logic, not just CRUD" discipline as HR's rating-required-before-review-completion.
- **Every mutating Server Action that redirects to a list page must call `revalidatePath()` on that page's path immediately before the `redirect()`** — see `docs/DEVELOPMENT_ROADMAP.md`'s "Router-cache bug fix" entry. Omitting this was a systemic gap across all of Fleet, Installment, and the first pass of CRM; it is now the required pattern for every action file, not an optional optimization.
- Fleet, Pharmacy, Hospital, POS, Installment, Hostel, Hotel, and School each call into Accounting's `postSourceJournalEntry()`/`reverseJournalEntry()` — through a shared `postModuleRevenue()`/`reverseModuleRevenue()` helper (`src/lib/accounting-integration.ts`), never Accounting's Prisma models directly — the moment each module treats its own money as confirmed (see `docs/DECISIONS.md`'s 2026-08-21 entry, and `docs/ACCOUNTING_MODULE.md`). Unlike the Inventory integrations above, this one is conditional: it silently no-ops if the organization hasn't activated Accounting, since a source module's core operation must never depend on a different module being subscribed.

## Cross-cutting infrastructure that is deliberately not a module

Not everything under organization scope or platform scope is a module. `Notification`, `AuditLog`, and Support messaging (`/app/support`, `/app/platform/support` — see `docs/SUPPORT_MESSAGING.md`) are cross-cutting infrastructure available to every organization unconditionally: no `registry.ts` entry, no module-prefix permission, no `OrganizationModule.enabled` check, and excluded from the tenant backup/export system (`BACKUP_MODULES`) since their records can reference platform-operator identities that must never leak into a tenant's own export. Don't add a new one of these lightly — most new cross-cutting needs still belong in `/app/reports` (Analytics) as documented below; this category is reserved for genuinely infrastructural, always-on concerns.

## Adding a new module

The approved Hotel and School verticals follow the staged boundaries and
integration contracts in `HOTEL_AND_SCHOOL_MODULES.md`. In particular, Hotel
restaurant/stock workflows must call POS/Inventory services, and School
workforce/payroll workflows must call HR/Payroll services; neither vertical may
query another module's Prisma tables directly.

Hospital Management (merged to `main`, live in production) follows the same
contract — see `HOSPITAL_MODULE.md`. Its one deliberate
cross-module boundary is medication orders reaching Pharmacy through a
versioned, Hospital-owned contract (`HospitalMedicationOrder`); it does not
and must never read or write a Pharmacy table directly. That contract must
also be **idempotent** once it's actually built — whichever side initiates
the cross-module call includes a client-generated request id so a retried
call applies once, not twice. As of the clinical-upgrades tranche this is a
documented requirement for the future integration, not a delivered
mechanism; no request-id field exists yet on either side.

1. Add its entry to `src/platform/modules/registry.ts` (key, name, description, icon, `routePrefix` — must be `/app`-prefixed, e.g. `/app/crm` — status).
2. If it has real navigation, add `src/modules/<key>/navigation.tsx` and reference it from the registry entry. Every `href` in it must also be `/app`-prefixed.
3. Create its route tree under `src/app/app/<key>/` with its own `layout.tsx` wrapping `AppShell` with that module's navigation — copy the pattern from `app/fleet/layout.tsx` or `app/installment/layout.tsx`.
4. Do not add its nav items to `workspace-navigation.tsx` or another module's navigation file. Each module's nav lives only in its own file.
