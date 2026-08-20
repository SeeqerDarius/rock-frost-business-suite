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

**2026-08-20 addendum — Driver role assignment now creates a matching FleetDriver.** Assigning a role that grants `fleet.driver.self_service` (the seeded "Driver" role, or any custom role with that permission) previously only changed the person's login permissions — it never touched `FleetDriver`, the table `/app/fleet/drivers` actually lists and the table driver self-service pages resolve "me" against via `FleetDriver.userId`. A manager had to separately remember to create a roster row and link it by hand; until they did, the newly "assigned" driver was invisible on the roster and their own self-service pages showed nothing. `ensureFleetDriverForUser()` (`src/modules/fleet/service.ts`) now creates the linked row automatically, called from the three moments a member ends up holding such a role while active: `changeMemberRole` (an existing active member's role changes), and both invitation-acceptance paths (`acceptInvitationNewUser`/`acceptInvitationExistingUser` in `src/lib/auth/invitations.ts`) for a newly invited member. It's idempotent (a manually-created row is left alone) and never fires for an INVITED member who hasn't accepted yet. `listFleetDrivers()` also runs a lazy backfill first — the same self-healing-on-read pattern `ensureDefaultAccounts()` already uses for Accounting — so members who were assigned the role before this fix shipped self-heal onto the roster the next time anyone opens the Drivers page, with no manual data migration required.

**Status: complete.** See `OPERATOR_HANDOFF.md` for the detailed session record.

## Phase 7 — Installment Management Migration ✅

Reference implementation: `C:\Users\andre\glv-management-system` (the "GLV" system). Before writing any code, an Explore agent extracted GLV's *actual* behavior (not its aspirational settings UI) — see `OPERATOR_HANDOFF.md`'s Phase 7 entry for the full extraction. Key finding: several of GLV's own settings fields (commission, payroll day, administration fee, minimum deposit, delivery-after-completion) are stored and editable in its UI but **never read by any calculation** — confirmed by GLV's own operator doc ("always distinguish 'saved' from 'effective'").

**Migrated as real, validated logic** (`src/modules/installment/service.ts`): installment scheduling (product-level `duration`/`dailyAmount`/`price`, with a price-floor validation), payment allocation with automatic overpayment-credit creation, a 3-hour payment edit window with full-recalculation-on-edit, receipt/customer/staff code generation (per-year, per-staff sequences), atomic staff-inventory consumption on account creation (a hard stock gate, restored on cancellation), the account lifecycle sweep (dormant/probation/closed/archived, computed lazily on report/list reads rather than a cron), automatic closure-refund credits with a configurable service-fee percentage, dormant-account reactivation, the procurement-readiness list (product restock threshold), and the admin summary / staff performance / weekly collections reports.

**Staff scoping**: a field-staff role (holding `hirepurchase.customers.manage` etc. but not `hirepurchase.staff.manage`) sees and manages only their own assigned customers/accounts/payments/credits — a manager (holding `hirepurchase.staff.manage`) sees everything. This mirrors GLV's real staff-scoping rule.

**Status: complete.** See `OPERATOR_HANDOFF.md` for the detailed session record.

## Post-Phase-7 gap-fixing pass ✅

Immediately after Phase 7, several of its own deliberately-deferred items were revisited and actually built (unlike GLV, which never implements them): commission calculation (wired into staff performance reporting), an administration fee (a real one-time origination fee added at account creation), minimum-deposit enforcement (required at account creation via an optional initial-deposit field), a payroll-day due-date indicator in Reports, and the credit "apply to another account" flow (`APPLIED` status is now reachable — GLV never implements this at all, so it was designed fresh). Also added: GLV's step-up re-authentication pattern (re-entering your own password) for credit refund/void and account reactivation, and login rate limiting (`User.failedLoginAttempts`/`lockedUntil`, migration `20260720120000_add_login_lockout`) — the first schema change since Phase 3's reconnection.

Still deliberately deferred (see `docs/AUTHENTICATION_AND_AUTHORIZATION.md`'s "Known gaps"): public self-registration, an owner-facing maintenance approval portal, fuzzy duplicate-detection on create, and hard deletes for financial records.

**Status: complete.**

## Phase 8 — CRM ✅

New models (`CrmLeadSource`, `CrmContact`, `CrmLead`, `CrmDeal`, `CrmActivity`) — nothing CRM-shaped existed in the schema before this phase, unlike Fleet/Installment. Org-scoped service layer at `src/modules/crm/service.ts`: contact/lead/deal/activity CRUD, `convertLeadToDeal` (creates or reuses a `CrmContact`, creates a linked `CrmDeal`, marks the lead `CONVERTED`), `updateDealStage` (stamps `closedAt` on WON/LOST), and `getCrmSummary` (pipeline value, win rate, stage counts) for the dashboard widget and Reports page. Six permission keys (`crm.view`, `crm.contacts.manage`, `crm.leads.manage`, `crm.deals.manage`, `crm.reports.view`, `crm.settings.manage`) plus a new system role, "CRM Manager". Registry entry flipped from `coming-soon` to `available`.

**Major bug found and fixed during this phase's own verification** — see "Router-cache bug fix" below; it wasn't CRM-specific, it just happened to surface here first.

**Status: complete.**

## Router-cache bug fix (`revalidatePath`) ✅

Discovered while browser-verifying CRM's deal pipeline: `changeDealStage` correctly updated `CrmDeal.stage` in the database (confirmed via direct query), but the browser kept rendering the pre-move stage after the action's `redirect()` landed back on the same `?saved=1` URL a second time. Root cause: Next.js's client Router Cache can serve a stale RSC payload for a URL it has already visited, even though `dynamic` staleTime defaults to 0 — a mutating Server Action that redirects to a URL it (or a sibling action) has redirected to before needs an explicit cache-bust, not just a fresh server render.

**Fix**: every mutating Server Action that redirects to a list page now calls `revalidatePath("<that list page's path>")` immediately before the `redirect()` call. This was missing across essentially every action file written so far this rebuild — fixed in all 18 action files across Fleet (7), Installment (6), and CRM (5). Verified with a full Playwright pass: deal stage moved twice in a row, each move confirmed correct on a hard page reload.

**Going forward**: any new mutating Server Action that redirects to a page showing data it just changed must include the matching `revalidatePath()` call — this is now the standard pattern, not a special case. See `src/app/app/crm/deals/actions.ts` for the reference shape.

**Status: complete.**

## Phase 9 — Inventory Management ✅

New models (`InventoryCategory`, `InventoryWarehouse`, `InventoryItem`, `InventoryStock`, `InventoryMovement`) — like CRM, nothing inventory-shaped existed in the schema before this phase (Installment's `HirePurchaseStaffInventory` is a per-staff unit counter, not a general warehouse/stock model). Org-scoped service layer at `src/modules/inventory/service.ts`: item/warehouse/category CRUD, `getStockGrid` (per item × warehouse quantity), and `recordMovement` — the one function with real business logic, handling all four movement types (`RECEIPT`, `ISSUE`, `ADJUSTMENT`, `TRANSFER`) inside a single `$transaction`, validating sufficient stock before an `ISSUE`/`TRANSFER`/negative `ADJUSTMENT` and a distinct destination warehouse for `TRANSFER`. `getInventorySummary` aggregates total stock value (quantity × cost price, across warehouses) and a low-stock list (items at or below their `reorderPoint`) for the dashboard widget and Reports page. Inventory items now also support optional JPG/PNG/WebP images up to 1 MB, signature-validated on upload and served only through an authenticated tenant-scoped route. Six permission keys (`inventory.view`, `inventory.items.manage`, `inventory.warehouses.manage`, `inventory.movements.manage`, `inventory.reports.view`, `inventory.settings.manage`) plus a new system role, "Inventory Manager". Registry entry flipped from `coming-soon` to `available`.

Every mutating action follows the `revalidatePath()`-before-`redirect()` pattern from day one (no repeat of the CRM-era gap). Verified end-to-end with a full receipt → transfer → issue → adjustment sequence against a real warehouse pair, confirming exact quantity arithmetic at every step (20 receipt → 12/8 after an 8-unit transfer → 5 after a 3-unit issue → 10 after a −2 adjustment) and that an over-large issue is correctly rejected without mutating stock.

**Status: complete.**

## Phase 10 — Accounting ✅

New models from scratch: `AccountingAccount` (chart of accounts), `AccountingExpenseCategory`, `AccountingInvoice`, `AccountingExpense`, `AccountingJournalEntry`/`AccountingJournalLine`. A minimal but real double-entry ledger underpins the module — `AccountingJournalEntry`/`Line` is the source of truth for every account balance, computed as debit-minus-credit for ASSET/EXPENSE accounts and credit-minus-debit for LIABILITY/EQUITY/REVENUE accounts (`computeBalance()` in `src/modules/accounting/service.ts`). Five default system accounts (Cash, Accounts Receivable, Accounts Payable, Revenue, General Expenses) are created lazily per organization via `ensureDefaultAccounts()`.

Invoices and expenses post journal entries at the points a real bookkeeper would, not at creation time: an invoice posts Debit AR / Credit Revenue only when marked **Sent** (not on creation, while still a DRAFT); a payment posts Debit Cash / Credit AR and flips status to PAID once `amountPaid` reaches the invoice total; an expense posts Debit [category's linked account, or General Expenses] / Credit Cash only once marked **Paid** (after a PENDING → APPROVED gate). A manual journal entry UI exists on the Journal page for adjustments outside the invoice/expense flow, validated for balance (`JournalNotBalancedError`).

Six pages (Chart of Accounts, Invoices, Expenses, Journal, Reports, Settings) plus an overview page and dashboard widget. Six permission keys (`accounting.view`, `.accounts.manage`, `.invoices.manage`, `.expenses.manage`, `.reports.view`, `.settings.manage`) plus a new "Accounting Manager" role. Verified end-to-end with a real invoice send→pay and expense approve→pay sequence, confirming exact ledger balances and P&L figures at every step (see `OPERATOR_HANDOFF.md`'s Phase 10 entry for the exact numbers).

**2026-08-20 addendum — Petty cash and Statement of Financial Position.** Two additions built on top of the existing ledger rather than beside it, both in `src/modules/accounting/service.ts`:

- **Petty cash (imprest system)**: `AccountingPettyCashFund`/`AccountingPettyCashTransaction` models. Each fund is backed by its own dedicated ASSET/`liquidityType: CASH` `AccountingAccount`, so a fund's balance is always the same journal-line-derived figure as every other account rather than a separately tracked number. `createPettyCashFund` posts the initial float as Debit fund account / Credit the main Cash account (1000). `recordPettyCashExpense` posts Debit [category's account or General Expenses] / Credit the fund account, re-checking the fund's row-locked (`SELECT ... FOR UPDATE`) ledger balance inside the transaction before posting — the same concurrency pattern `recordInvoicePayment` uses for its overpayment guard, applied here to stop two concurrent expenses from together overdrawing a fund that only has room for one. `replenishPettyCashFund` tops the float back up (auto-computes the shortfall, or accepts an explicit amount) as Debit fund account / Credit Cash. `closePettyCashFund` claims the fund atomically (guarded `updateMany`, same pattern as `markInvoiceSent`) and, if float remains, reverses it back to Cash. New page: `/app/accounting/petty-cash`, gated on the existing `accounting.cashbook.manage` permission (no new permission key — petty cash is cash-account administration, the same class of action cashbook opening balances and reconciliations already require).
- **Statement of financial position (balance sheet)**: `getStatementOfFinancialPosition()` groups `listAccounts()`'s already-correctly-signed balances by ASSET/LIABILITY/EQUITY. Revenue and Expense accounts have no balance-sheet home of their own, so the current period's net income is folded into equity as "Retained earnings (current period)" — the same effect a period-end close journal entry would have, computed live instead of requiring a manual close. Rendered as a new card on the existing Reports page (`/app/accounting/reports`), which also reports whether Assets = Liabilities + Equity holds (it always should; the check exists to surface a ledger-corruption bug rather than assume one can't happen).

**Status: complete.**

## Phase 11 — Human Resources ✅

New models from scratch: `HrEmployee` (with a self-relation for manager/reports), `HrLeaveType`, `HrLeaveRequest`, `HrPerformanceReview`. Org-scoped service layer at `src/modules/hr/service.ts`: employee CRUD with a lifecycle (`ONBOARDING` → `ACTIVE` ⇄ `ON_LEAVE` → `TERMINATED`, the last two reachable from `ACTIVE` and each other), leave-type CRUD, leave-request CRUD with approve/reject (`daysBetween()` computes an inclusive day count for display — not persisted, computed on read), and performance reviews with a `DRAFT` → `COMPLETED` lifecycle that requires a rating to be set before completion (`ReviewStateError` otherwise).

Deliberately did **not** build a separate "Onboarding" page or a photo/document-checklist workflow — onboarding is handled as an employee status plus an "Activate" action on the Employees page itself, consistent with the project's own precedent (Fleet Settings was left an honest placeholder rather than fabricating a workflow with nothing behind it) for not inventing UI around a concept the schema doesn't actually model yet.

Six pages (Employees, Leave, Reviews, Reports, Settings) plus an overview page and dashboard widget. Six permission keys (`hr.view`, `.employees.manage`, `.leave.manage`, `.reviews.manage`, `.reports.view`, `.settings.manage`) plus a new "HR Manager" role. Verified end-to-end: employee onboarding→active→on-leave→active transitions, manager assignment, a 3-day leave request's day count, approve/reject, and the review draft→completed lifecycle including the rating-required guard correctly rejecting an incomplete review.

**Status: complete.**

## Phase 12 — Procurement ✅

New models from scratch: `ProcurementVendor`, `ProcurementRequest`, `ProcurementOrder`/`ProcurementOrderLine`, `ProcurementSettings`. A purchase request (optionally linked to a real `InventoryItem`) can be approved, then converted into a purchase order (the request auto-flips to `CONVERTED` when an order references it via `requestId`). An order moves `DRAFT` → `SENT` → `PARTIALLY_RECEIVED`/`RECEIVED` as its lines are received; `recomputeOrderStatus()` derives the order's status from its lines' `receivedQuantity` vs `quantity` on every receipt.

**Deliberate real cross-module integration** (documented in `docs/DECISIONS.md`): receiving an order line calls Inventory's own `recordMovement()` to post a genuine stock `RECEIPT` into the chosen warehouse, when the line is linked to a real `InventoryItem` — a purchase order that didn't actually move stock when received wouldn't be a real procurement flow. Procurement only calls Inventory's public service function; it never reaches into Inventory's tables directly. `ProcurementSettings.defaultWarehouseId` stores a per-organization default receiving warehouse.

Orders are deliberately kept to one line per order in the UI (matching Accounting's single-amount invoices) rather than a dynamic multi-line itemized form, since no page in this codebase uses client-side repeating-fieldset input — the schema still models `lines: ProcurementOrderLine[]` as one-to-many for future extensibility.

Six pages (Vendors, Requests, Orders, Reports, Settings) plus an overview page and dashboard widget. Six permission keys (`procurement.view`, `.vendors.manage`, `.requests.manage`, `.orders.manage`, `.reports.view`, `.settings.manage`) plus a new "Procurement Manager" role. Verified end-to-end: request → approval → order (auto-converts the request) → send → partial receive (6/10, confirmed live on Inventory's Stock page) → full receive (10/10) → default-warehouse setting.

**Status: complete.**

## Phase 13 — Payroll ✅

New models from scratch: `PayrollCompensation` (one row per `HrEmployee`, referenced by id — Payroll owns its own compensation data rather than modifying HR's employee model), `PayrollRun`, `PayrollPayslip`, `PayrollSettings` (a single org-wide default tax rate). A run starts `DRAFT`; `processRun()` computes a payslip for every `ACTIVE`/`ON_LEAVE` employee with compensation on record (`grossPay` = base salary, `taxDeduction` = gross × the org's default tax rate, `netPay` = gross − tax), creating every payslip and flipping the run to `COMPLETED` inside a single `db.$transaction`. A run with no eligible compensation throws `NoCompensationError` rather than silently completing with zero payslips.

**Deliberately not integrated with Accounting in this pass** (no journal entry posted when a run completes) — the same scope decision already recorded for Procurement-to-Accounting; see `OPERATOR_HANDOFF.md`'s Phase 12/13 entry.

Six pages (Compensation, Runs, Payslips, Reports, Settings) plus an overview page and dashboard widget — Payslips is read-only (payslips are a computed record of a completed run, not directly editable). Six permission keys (`payroll.view`, `.compensation.manage`, `.runs.manage`, `.payslips.view`, `.reports.view`, `.settings.manage`) plus a new "Payroll Manager" role. Verified end-to-end with real payroll math: a 3000.00 base salary at a 10% default tax rate produced an exact 300.00 tax deduction and 2700.00 net pay on the processed payslip, matching the run summary and the Reports/Overview pages; a second draft run was correctly cancellable.

**Status: complete.**

## Phase 14 — Analytics ✅

Unlike every prior module, Analytics owns **no database tables of its own** — no migration was needed for this phase. `src/modules/analytics/service.ts` is a pure read-only aggregation layer that calls every other enabled module's own summary function (`getAccountingSummary`, `getPayrollSummary`, `getCrmSummary`, `getInstallmentSummary`, `getFleetSummary`, `getInventorySummary`, `getProcurementSummary`, `getHrSummary`) and combines the results — never reaching into any module's Prisma models directly. A module the organization hasn't enabled is simply omitted from the aggregate rather than erroring.

Five pages (Financial, Sales & CRM, Operations, People, Settings) plus an overview page — Settings is an honest placeholder (Analytics has no configuration of its own to manage; each source module's own Settings page controls what shows up here). The pre-existing organization-scope `/app/reports` placeholder (which claimed cross-module reporting "is not built yet") was updated to point to the new Analytics module instead. Six permission keys (`analytics.view`, `.financial.view`, `.sales.view`, `.operations.view`, `.people.view`, `.settings.manage`) plus a new "Analytics Manager" role — note only `.settings.manage` is a mutate-style key, since every other Analytics permission gates a read-only view, a deliberate deviation from the "always has manage verbs" shape of every prior module given Analytics' fundamentally different (aggregation-only) nature.

Verified against real current data across all eight other modules — every figure on every Analytics page matched each source module's own reports exactly.

**Status: complete.**

## Phase 15 — Point of Sale ✅

New models from scratch: `PosRegister`, `PosSession` (a cash-drawer open/close lifecycle per register), `PosSale`/`PosSaleLine`, `PosSettings`. Not part of the original module list in `docs/PRODUCT_VISION.md` — added by explicit user request after Analytics.

**Deliberate real cross-module integration** (documented in `docs/DECISIONS.md`, same pattern as Procurement→Inventory): completing a sale with a line linked to a real `InventoryItem`, on a register with a linked `InventoryWarehouse`, calls Inventory's own `recordMovement()` with `type: "ISSUE"` to post a genuine stock decrease; refunding that sale reverses it with a `type: "RECEIPT"`. A sale can only be recorded against a register's currently open session; only one session can be open per register at a time.

Sales are kept to three fixed line slots in the UI (matching Procurement's/Accounting's precedent of avoiding dynamic client-side repeating-fieldset forms) rather than an unbounded cart. Six pages (Registers, Sell, Sales, Reports, Settings) plus an overview page and dashboard widget — Settings holds one genuinely useful option (a configurable receipt footer). Six permission keys (`pos.view`, `.registers.manage`, `.sessions.manage`, `.sales.manage`, `.reports.view`, `.settings.manage`) plus a new "POS Cashier" role.

Verified end-to-end with real stock arithmetic: opened a session, sold 3 units of a tracked item (confirmed Inventory stock dropped from 20 to 17), refunded the sale (confirmed stock returned to exactly 20), and confirmed the Reports page correctly excluded the refunded sale from completed-sales totals while counting it under refunds.

**Status: complete.**

## Phase 16 — Project Management ✅

New models from scratch: `Project`, `ProjectMember` (many-to-many join to `User` with an optional free-text `role`), `ProjectMilestone`, `ProjectTask`. The last module from the original `docs/PRODUCT_VISION.md` list.

Two real guard-rail state transitions (not just CRUD), matching the "genuine validation logic" precedent set by HR's rating-required-before-review-completion: `completeMilestone()` throws `MilestoneStateError` if any task under that milestone isn't `DONE`; `completeProject()` throws `ProjectStateError` if any milestone on that project isn't `COMPLETED`. Both surface as a `?error=not-ready` redirect rather than a silent no-op or a generic 500.

Six pages (Projects, Tasks, Milestones, Reports, Settings) plus an overview page and dashboard widget — Settings is an honest placeholder (project codes are auto-generated, statuses/priorities are fixed enums; no module-wide configuration exists yet). Six permission keys (`projects.view`, `.projects.manage`, `.tasks.manage`, `.milestones.manage`, `.reports.view`, `.settings.manage`) plus a new "Projects Manager" role.

Verified end-to-end: created a project, added a member, created a milestone with two tasks under it, confirmed the milestone-completion guard correctly rejected completion while tasks were still open, progressed both tasks through `TODO → IN_PROGRESS → IN_REVIEW → DONE`, confirmed the milestone then completed successfully, and confirmed the project itself completed successfully once its only milestone was `COMPLETED`. Reports and Overview pages both reflected the resulting counts correctly.

**Status: complete.**

## Phase 17 — Hotel Management ✅

Property and room inventory, guests, reservation and stay lifecycle, folios/payments, housekeeping, restaurant orders and folio charging, channel mappings, reporting, and settings. Tenant isolation, RBAC, state guards, additive migration, and real-database integration coverage are included.

**Status: complete.**

## Phase 18 — School Management ✅

Campus, student/guardian, academic period, class/enrollment, attendance, fee/payment, exam/grading/moderation, timetable, transport, library, payroll-adjustment, reporting, and settings workflows. Tenant isolation, RBAC, academic/financial guards, additive migration, and real-database integration coverage are included.

**2026-08-20 addendum — Student and guardian photos.** `SchoolStudent.photoData`/`SchoolGuardian.photoData` (nullable `Text`), following the exact pattern established by `InventoryItem.imageData`: a client-validated (JPEG/PNG/WebP, magic-byte signature check, 1 MB cap — `src/lib/school-photo-image.ts`) base64 data URL stored directly in the column, served back through a dedicated authenticated, module-permission-gated streaming route (`/api/school/students/[studentId]/photo`, `/api/school/guardians/[guardianId]/photo`) rather than a public file URL. The Students & Guardians page (`/app/school/students`) gained a photo column on both tables — a thumbnail (or a placeholder icon when none is set) that, for users with `school.students.manage`, opens a small dialog to add, replace, or remove the photo; list queries stay lean by fetching only which ids have a photo (`listSchoolStudentPhotoIds`/`listSchoolGuardianPhotoIds`) rather than pulling every row's image bytes.

**Status: complete.**

## PDF/Excel report exports (2026-08-20)

Every module's Reports page (14 modules: Accounting, School, HR, Payroll, Inventory, POS, Fleet, Hotel, Pharmacy, Hospital, CRM, Installment, Procurement, Projects) gained "PDF" and "Excel" download buttons rendering exactly the same stats the page already shows as cards, as a downloadable document rather than a screen-only view. Not a bespoke exporter per module — one shared path:

- **`src/lib/reports/export.ts`** — `buildReportExcelWorkbook()` (ExcelJS, one styled sheet: title/subtitle/generated-at, an optional key-figure summary block, then a filterable data table) and `buildReportPdf()` (pdfkit, auto-paginating table using pdfkit's built-in standard-14 fonts — deliberately no custom TTF embedding, a frequent source of "font not found" failures once bundled for Vercel's serverless functions). Both take the same `ReportExportInput` shape (title, subtitle, columns, rows, optional summary stats), so a report only has to be described once to get both formats.
- **`src/lib/excel-safety.ts`** — the formula-injection guard (`safeExcelText`/`safeExcelValue`, prefixing a leading `=+-@` so Excel/Sheets treats a value as literal text) extracted out of `src/lib/backup/tenant-excel.ts` (previously private to the tenant data-export workbook) so the new report exporter reuses the same, already-tested protection rather than a second copy.
- **`src/lib/reports/summary-to-report.ts`** — every module's existing `getXSummary(organizationId)` already returns exactly the flat stats its Reports page renders; `summaryToReportInput()` flattens that object into a uniform two-column Metric/Value table (a nested breakdown like HR's `departmentCounts` becomes one row per entry, prefixed with a colon, never an em dash — generated report content is customer-facing per `AGENTS.md`'s punctuation rule; an array value becomes its count rather than dumping raw records).
- **`src/lib/reports/registry.ts`** — one entry per module (title, its `*_REPORTS_VIEW` permission, its `getSummary` function).
- **`/api/reports/[moduleKey]?format=pdf|xlsx`** (`src/app/api/reports/[moduleKey]/route.ts`) — one shared download endpoint for every module rather than a route per module per format, gated identically to the Reports page itself (module enabled + that module's `*_REPORTS_VIEW` permission).
- **`ReportExportLinks`** (`src/components/reports/report-export-links.tsx`) — two plain `<a>` downloads styled as buttons, added to each Reports page's header actions slot.

Deliberately does not cover Analytics (already a cross-module report with no separate Reports subpage) or the organization-wide `/app/reports` overview. Fleet's Reports page itself renders the richer `getFleetManagementReport()`, but its export uses the simpler `getFleetSummary()` (the same one the dashboard widget uses) — a deliberate, documented scope choice rather than building a bespoke exporter for Fleet's specific report shape; a first extension point if per-module richer exports are wanted later.

## Production hardening track (started 2026-07-21)

With every product module built, a full-project audit (2026-07-20) found the platform is a strong feature-complete beta but not yet safe for external multi-tenant onboarding or real financial operations. Rather than a numbered phase, this is now tracked as a series of hardening passes in **`docs/HARDENING_PLAN.md`** — read that file for the authoritative current status. **Pass 1** (central active-tenant guard, session revocation, dashboard permission leak, and the Administration/Projects/Payroll IDOR paths), **Pass 2** (financial/inventory transaction atomicity across POS/Inventory/Procurement/Accounting/Payroll/Installment plus the IDOR paths entangled with it), **Pass 3a** (invitation redesign — bound to one membership, hashed tokens, resend/revoke), **Pass 3b** (a shared Zod validation library applied to the public contact form and Administration's invite form, plus a full CRM/HR/Fleet cross-tenant IDOR audit that found and fixed real gaps in all three), and **Pass 3c** (the remaining Installment/POS IDOR audit, a full Zod validation rollout across every remaining Server Action file, bounded Decimal-precision hygiene in Accounting/Payroll/Installment, reproducible seeding/CI, and stale-documentation fixes) are all complete. **Pass 4+** (the narrow documented residual concurrency races, audit logging, performance, accessibility) has not started.

## Platform acquisition and subscriptions ✅

Public module/demo enquiries now feed the operator request queue, prefill
organization onboarding, generate tenant codes automatically, and convert to
module requests. Operators can record manual/offline or platform-managed
subscriptions, confirm payment, activate a module for a defined term, and
cancel it. Subscription-controlled access fails closed after expiry. See
`docs/BILLING_AND_SUBSCRIPTIONS.md`. Automated online checkout remains
provider-dependent and is not represented as complete.
