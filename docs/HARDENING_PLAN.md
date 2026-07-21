# Production Hardening Plan

Tracks the remediation of the blockers identified in the 2026-07-20 full-project
audit. This is a multi-pass effort — see `OPERATOR_HANDOFF.md` for which pass is
currently active. Findings below were independently re-verified against the live
codebase before being marked "confirmed"; a few audit claims turned out to be
partially inaccurate (noted where relevant) — this file reflects verified reality,
not the audit text verbatim.

**Scope note:** Billing/Subscriptions is not part of this plan. It was never
implemented scope — see the "Billing/Subscriptions" section at the bottom.

## Status

**Pass 1 — complete** (2026-07-21): central active-tenant guard, session
revocation, dashboard/module permission leak, and the Administration/Projects/
Payroll IDOR paths that didn't require the broader transaction-atomicity work.

**Pass 2 — complete** (2026-07-21): financial/inventory transaction integrity
across POS, Inventory, Procurement, Accounting, and Payroll, Installment's
core payment-recording path, and every IDOR path that was entangled with that
atomicity work (vendor/request/item ids in Procurement, warehouse ids in
Inventory/POS, journal account ids in Accounting, customer/staff ids in
Installment's account creation).

**Pass 3 — not started.** See the "Remaining work (Pass 3)" section near the
bottom for the full list: invitation redesign, formal Zod validation, broader
IDOR audit of CRM/HR/Fleet, Decimal-precision hygiene, reproducible seeding/CI,
and the narrow residual concurrency races documented per-fix below.

---

## 1. Central active-tenant guard

**Status: fixed.**

**Problem (confirmed):** `getCurrentTenant()` in `src/lib/tenant/index.ts` loaded
`OrganizationMember` rows filtered only on `userId`, with no check on
`OrganizationMember.status`, `Organization.status`, or `User.status`. An
`INVITED`/`SUSPENDED`/`REMOVED` membership, or a `SUSPENDED`/`CANCELLED`
organization, was fully authorized. `switchOrganization()` in
`src/lib/tenant/actions.ts` had the identical gap — it would switch a user into
any membership row that merely existed, regardless of status.

**Fix:**
- `getCurrentTenant()` now loads memberships with `include: { organization: true }`
  and filters to only those where `member.status === "ACTIVE"` and
  `organization.status` is `"ACTIVE"` or `"TRIAL"` (both are legitimate
  operating states; `SUSPENDED`/`CANCELLED` are not) *before* doing any cookie/
  session-based selection. The previous implicit fallback chain
  (`cookie → session.user.organizationId → allMemberships[0]`) now only ever
  selects from this pre-filtered valid pool — it can no longer silently land on
  an invalid membership. If the pool is empty, `getCurrentTenant()` returns
  `null` (denied), exactly like the existing "no organization" case.
- `switchOrganization()` now re-validates the target membership's status and the
  target organization's status before setting the cookie; an invalid target is a
  silent no-op (same UX as a missing membership today), not a switch.
- `src/app/app/layout.tsx` now also redirects to `/login` when the session
  exists but carries no `user.id` (the shape produced by a revoked session, see
  §2) — previously only a fully-missing `session` triggered that redirect, so a
  revoked-but-still-cookied session fell through to the generic "No
  organization access" message instead of being sent back to sign in.

**Files changed:** `src/lib/tenant/index.ts`, `src/lib/tenant/actions.ts`,
`src/app/app/layout.tsx`.

**Migration impact:** none (no schema change).

**Tests:** `test/tenant-guard.test.ts` — covers: suspended/removed/invited
membership denied, suspended/cancelled organization denied, valid membership
still resolves, `switchOrganization` rejects a status-invalid target.

---

## 2. Session revalidation / revocation

**Status: fixed for the flows that exist today; noted gap for flows that don't.**

**Problem (confirmed):** Sessions use NextAuth v4's JWT strategy. `authorize()`
checked `user.status === "ACTIVE"` only at sign-in time; nothing re-checked it
for the lifetime of the JWT (default 30 days). A user suspended, or whose
password was reset, after they signed in kept full access on their existing
token until it naturally expired.

**Fix — `sessionVersion` pattern:**
- Added `User.sessionVersion Int @default(0)`.
- `authorize()` now returns `sessionVersion` alongside the rest of the user
  shape; `jwt()` stores it on first sign-in.
- On every *subsequent* `jwt()` invocation (i.e. every request that touches the
  session, not just sign-in — NextAuth v4 re-runs `jwt()` on every
  `getServerSession()` call, not only at login), the callback re-reads the
  user's current `status` and `sessionVersion` from the database and compares
  them against what's embedded in the token. A status other than `ACTIVE`, a
  `sessionVersion` mismatch, or a deleted user clears `token.user` entirely.
  `session()` then omits `user.id` from the returned session, which every
  existing `session?.user?.id` check across the app already treats as "not
  signed in" — no downstream code needed to change.
- `sessionVersion` is incremented (via a new `revokeUserSessions(userId)`
  helper in `src/lib/auth/session-revocation.ts`) on:
  - `resetPassword()` (self-service password reset)
  - `acceptInvite()` (invite acceptance sets a password)

**What this does not yet cover:** there is no existing UI action that suspends
a user, suspends/removes a membership, changes a role, or force-logs-out a
user — so those triggers have nothing to call `revokeUserSessions()` from yet.
The moment such an action is built, it must call `revokeUserSessions(userId)`
(user-level) or rely on the Pass-1 tenant-guard status checks (membership/org-
level, which are re-validated every request regardless of JWT state — see §1).
Membership- and organization-level suspension are therefore *already* enforced
today even without a dedicated "suspend" button, because §1's guard re-checks
`OrganizationMember.status`/`Organization.status` from the database on every
request, independent of the JWT. Only *user*-level suspension depends on the
JWT `sessionVersion` check, since a suspended user's own session cookie is the
only thing that needs invalidating.

**Files changed:** `prisma/schema.prisma` (+migration), `src/lib/auth/nextauth.ts`,
`src/lib/auth/next-auth.d.ts`, `src/lib/auth/session-revocation.ts` (new),
`src/lib/auth/actions.ts`.

**Migration impact:** additive column, `Int @default(0)` — zero-downtime,
backfills existing rows to `0` automatically.

**Tests:** `test/session-revocation.test.ts` — covers: version bump invalidates
a previously-issued token's user payload, matching version passes, non-ACTIVE
user is rejected even with a matching version.

---

## 3. Dashboard / module permission leak

**Status: fixed.**

**Problem (confirmed):** `src/app/app/(overview)/dashboard/page.tsx` filtered
which modules to render using only `tenant.enabledModuleKeys` (organization
enablement), never `tenant.permissions`. Every dashboard widget
(`src/modules/*/dashboard-widget.tsx`) is an async Server Component that fetches
and renders real organization-wide summary data with no permission check of its
own — it trusted the page to have already gated it. A user with *any* login but
no `accounting.*`/`payroll.*`/etc. permission saw cash balance, outstanding
invoices, net income, payroll totals, and every other enabled module's summary,
purely because the module was enabled for the org.

**Fix:**
- `TenantContext` gained a new `accessibleModuleKeys: string[]` field — the
  subset of `enabledModuleKeys` the current user also holds a permission for
  (same logic as `canAccessModule()`, computed once in `getCurrentTenant()`
  rather than calling the module-scoped `canAccessModule()` per module to avoid
  a `permissions.ts` → `tenant/index.ts` runtime import cycle).
- `dashboard/page.tsx` now filters on `accessibleModuleKeys`, so a widget for a
  module the user cannot access is never constructed — its data fetch never
  runs, since these are Server Components only executed when actually rendered
  into the tree.
- Every module `layout.tsx` (all eleven) and the overview layout now pass
  `accessibleModuleKeys` to `<AppShell>` (previously `enabledModuleKeys`), so
  the module-launcher dialog (`ModuleLauncher`) also stops offering "open" links
  to modules the user has no permission for — it now shows them as "Not
  enabled" (same as a genuinely disabled module), rather than a dead-end link
  that would 403/redirect once clicked.

**Deferred (documented, not fixed this pass):** `src/app/app/(overview)/modules/page.tsx`
still uses raw `enabledModuleKeys` for its own "Open" button — this page never
renders module *data*, only registry metadata and a link, and the link target
is already independently gated by that module's own `layout.tsx` permission
check, so this is a UX inconsistency (a dead-end "Open" button), not a data
leak. Left as-is to keep this pass's diff focused; worth a one-line follow-up.

**Files changed:** `src/lib/tenant/index.ts`, `src/app/app/(overview)/dashboard/page.tsx`,
all 11 module `layout.tsx` files, `src/app/app/(overview)/layout.tsx`.

**Migration impact:** none.

**Tests:** `test/dashboard-permission-leak.test.ts` — covers: a module enabled
for the org but with no matching permission is excluded from
`accessibleModuleKeys`; a module with a matching permission is included.

---

## 4. Confirmed highest-risk IDOR paths (Pass 1 subset)

**Status: fixed for the three paths below. Remaining confirmed IDOR paths are
listed in Pass 2 further down.**

### 4a. Administration — role assignment

**Problem (confirmed):** `inviteMember()` in
`src/app/app/(overview)/administration/actions.ts` resolved the submitted
`roleId` with a bare `db.role.findUnique({ where: { id: roleId } })` — no check
that the role belongs to the active organization (or is a legitimate system
role). A crafted `roleId` for another organization's custom role would be
accepted and attached to a new membership in *this* organization.

**Fix:** the lookup now requires the role to satisfy
`organizationId: tenant.organizationId` (a tenant's own custom role) **or**
`isSystem: true` (a global system role, still excluding `"Super Admin"` via the
pre-existing `NOT_INVITABLE_ROLES` check). Any other role id — including one
belonging to a different organization — now redirects to
`?error=invalid-role`, the same outcome as an unresolvable id, revealing
nothing about whether the foreign role exists.

### 4b. Projects — members, milestones, tasks

**Problem (confirmed):** `addProjectMember()`, `removeProjectMember()`, and
`createMilestone()` in `src/modules/projects/service.ts` took a bare
`projectId` with no organization check. `createTask()` took `organizationId`
for the row's own tenant stamp but never validated that the supplied
`projectId`, `milestoneId`, or `assigneeId` actually belonged to that
organization — so a task could be created referencing another organization's
project or milestone while carrying the caller's own `organizationId`, corrupting
the tenant-boundary invariant the rest of the module relies on.

**Fix:** all four functions now take `organizationId` as their first parameter
and resolve every foreign id through an organization-scoped `findFirst` before
writing:
- `addProjectMember(organizationId, projectId, userId, role?)` — verifies the
  project belongs to the org and the user is an `ACTIVE` member of the same org.
- `removeProjectMember(organizationId, projectId, userId)` — verifies the
  project belongs to the org.
- `createMilestone(organizationId, data)` — verifies `data.projectId` belongs
  to the org.
- `createTask(organizationId, data)` — verifies `data.projectId` belongs to the
  org; if `milestoneId` is supplied, verifies it belongs to that same project;
  if `assigneeId` is supplied, verifies it's an `ACTIVE` member of the org.

Any failed check throws a generic `Error("Not found.")` — callers
(`src/app/app/projects/projects/actions.ts`, `.../milestones/actions.ts`,
`.../tasks/actions.ts`) catch it and redirect to `?error=not-found`, matching
the "don't reveal the foreign record exists" requirement.

### 4c. Payroll — compensation

**Problem (confirmed):** `setCompensation()` in `src/modules/payroll/service.ts`
upserted `PayrollCompensation` keyed only on the globally-unique
`employeeId`, with no check that the employee belongs to the calling
organization. Because `employeeId` is `@unique` (not organization-composite),
submitting another organization's employee id would hit that organization's
existing compensation row on the `update` branch — silently overwriting another
tenant's payroll data.

**Fix:** `setCompensation()` now first resolves the employee via
`db.hrEmployee.findFirst({ where: { id: employeeId, organizationId } })` and
throws `Error("Employee not found.")` if it doesn't belong to the calling
organization, before the upsert runs. The action
(`src/app/app/payroll/compensation/actions.ts`) catches it and redirects to
`?error=not-found`.

**Files changed:** `src/app/app/(overview)/administration/actions.ts`,
`src/modules/projects/service.ts`, `src/app/app/projects/{projects,milestones,tasks}/actions.ts`,
`src/modules/payroll/service.ts`, `src/app/app/payroll/compensation/actions.ts`.

**Migration impact:** none (no schema change — pure query/validation logic).

**Tests:** `test/idor-projects-payroll-administration.test.ts` — covers: cross-org
project id rejected for member add/remove/milestone/task creation, cross-org
assignee rejected, cross-org employee id rejected for compensation, cross-org
role id rejected for invitation, same-org paths still succeed.

---

## Pass 2 — financial/inventory transaction integrity (complete)

**Status: fixed**, across every module the audit named. All fixes follow the
same two primitives established in Pass 1's Inventory work: (a) an **atomic
guarded update** (`updateMany` with the invariant expressed in its `WHERE`
clause, checked via the returned `count`) instead of a JS read-then-absolute-write,
so concurrent requests can never both pass a stale check and both act; and
(b) **claim-then-act** for state transitions (flip the status atomically
*first*, inside the same transaction, before doing anything the flip guards) —
so double-submission of a "process/send/refund/receive" action is rejected by
the second caller's zero-row update, not merely made "unlikely."

### Inventory (`src/modules/inventory/service.ts`)

- `recordMovement()` now validates: quantity is a non-zero integer, positive
  for RECEIPT/ISSUE/TRANSFER (only ADJUSTMENT may be signed), and both the
  source warehouse and (for TRANSFER) destination warehouse belong to the
  calling organization — previously only the item was tenant-checked.
- Stock mutations use atomic `increment`/`decrement` instead of a
  read-then-absolute-write; ISSUE/TRANSFER-out use a new `decrementGuarded()`
  helper (`updateMany` with `quantity: { gte: n }` in the WHERE) so two
  concurrent issues against the same row can never both pass and oversell.
- `getOrCreateStockRow()` uses `upsert` (atomic get-or-create) instead of
  find-then-create, closing a race where two concurrent first-time movements
  against the same item/warehouse could both see "no row" and one throws a
  unique-constraint error instead of both succeeding quietly.
- `recordMovement()` now optionally accepts an existing transaction client
  (`tx?: Tx`, exported as `Tx`) — this is what lets POS's `createSale()`/
  `refundSale()` commit a sale and every line's stock movement as one
  all-or-nothing unit while still calling Inventory's own public service
  function, never its Prisma models directly (the module-boundary rule in
  `docs/MODULE_BOUNDARIES.md`).

### POS (`src/modules/pos/service.ts`)

- `openSession()` now validates the register belongs to the organization
  (previously a bare id).
- `createSale()` validates every line has a positive whole-number quantity
  and a finite, non-negative unit price (new `InvalidSaleInputError`) before
  touching the database, and now commits the sale row and every line's
  Inventory `ISSUE` as one transaction — previously these were separate
  statements, so a failure partway through left a "completed" sale with only
  some of its stock actually deducted.
- `refundSale()` atomically claims the sale (`COMPLETED` → `REFUNDED` via a
  guarded `updateMany`) *before* posting any stock `RECEIPT`, inside the same
  transaction — two concurrent refund requests for the same sale can no
  longer both pass a stale status check and both return stock.

### Procurement (`src/modules/procurement/service.ts`)

- `createOrder()` now validates the vendor, the request (if given), and every
  line's item belong to the organization (previously all three were unchecked
  — new `NotFoundError`).
- `createRequest()` validates its optional item id the same way.
- `receiveOrderLine()` now commits the atomic guarded `receivedQuantity`
  increment, the Inventory `RECEIPT` movement, and the order's recomputed
  status as one transaction — previously these were three separate
  statements (posts Inventory first, updates the order afterward), so a
  failure after the stock movement left real stock received with no record
  of it on the order, and a retry would receive it again. The
  `receivedQuantity` increment is itself guarded (`WHERE receivedQuantity <=
  quantity - input.quantity`), not a JS-computed sum, closing a lost-update
  race between two concurrent receives on the same line.
- `approveRequest()`/`rejectRequest()`/`sendOrder()`/`cancelOrder()` all now
  use the same atomic claim-then-act pattern for their status transitions.

### Accounting (`src/modules/accounting/service.ts`)

- `postJournalEntry()` — the single choke point every journal-posting call
  site goes through (invoice send, invoice payment, expense payment, manual
  entries) — now validates every line's `accountId` belongs to the
  organization (new `NotFoundError`), closing "manual journal lines accept
  arbitrary account ids" for every caller at once, not just
  `createManualJournalEntry()`.
- `markInvoiceSent()` and `payExpense()` now atomically claim their status
  transition (`DRAFT`→`SENT`, `APPROVED`→`PAID`) *before* posting a journal
  entry, inside the same transaction — closing the confirmed "concurrent
  invoice sends / expense payments can post twice" double-posting bug.
- `recordInvoicePayment()` rejects non-positive amounts and amounts exceeding
  the remaining balance (new `InvalidPaymentError`), and updates `amountPaid`
  via an atomic `increment` instead of a JS-computed absolute write — closing
  the confirmed "concurrent payments can duplicate journal entries while
  losing one amountPaid update" bug. A narrower residual race remains (see
  "Documented residual concurrency risks" below).
- `voidInvoice()` now posts a reversing journal entry (Debit Revenue / Credit
  AR) when voiding a `SENT`/`OVERDUE` invoice, instead of only flipping
  status — closing the confirmed "voiding doesn't reverse the original AR/
  Revenue entry" bug that permanently overstated revenue for voided invoices.
  A `DRAFT` invoice never had anything posted, so it needs no reversal. The
  status flip itself is now an atomic guarded claim too.
- `approveExpense()`/`rejectExpense()` use the same atomic claim pattern.
- **Not done**: full `Decimal`-precision arithmetic throughout (the module
  still converts to JS `Number` for most calculations) and immutable posted
  journals (already true today only because no code path exists to edit
  one — not enforced). See "Remaining work (Pass 3)".

### Payroll (`src/modules/payroll/service.ts`)

- `processRun()` atomically claims the run (`DRAFT`→`COMPLETED`) as the first
  statement inside its transaction, before creating any payslips — closing
  the confirmed "duplicate run processing" risk: two concurrent "process"
  clicks previously could both pass a stale status check and both generate a
  full set of payslips.
- `cancelRun()` uses the same atomic claim.
- `setCompensation()` rejects a non-positive base salary (new
  `InvalidCompensationError`); `updateSettings()` rejects a default tax rate
  outside 0–100%. Both were previously unvalidated, so a negative salary or a
  negative/over-100% tax rate could silently corrupt payroll math (e.g. a
  negative tax rate produces `netPay > grossPay`).

### Installment (`src/modules/installment/service.ts`)

- `recordPayment()` rejects non-positive amounts (new
  `InvalidPaymentAmountError`) and now updates `totalPaid`/`balance` via one
  atomic multi-field `increment`/`decrement` (a single UPDATE statement, both
  columns together) instead of a JS-computed absolute write — closing the
  confirmed "concurrent balance corruption" bug where two simultaneous
  payments on the same account could lose one payment's contribution to the
  running total even though both payment rows were created for real.
  Overpayment/credit-amount detection now reads the true atomically-decremented
  balance, not a stale pre-transaction snapshot.
- `createAccount()` now validates `customerId` and `inventoryStaffId` belong
  to the organization (previously only `productId` was checked) — the
  `inventoryStaffId` gap was a real cross-tenant **write**: a foreign staff id
  would have had *another organization's* staff-inventory row consumed.
- `updateCustomer()` now validates the reassigned `staffId` belongs to the
  organization.
- `refreshAccountLifecycleStatuses()`'s CLOSED-transition now atomically
  claims the status change before creating an `ACCOUNT_CLOSURE_REFUND`
  credit — closing a confirmed "duplicate lifecycle processing" bug where two
  concurrent sweeps (e.g. two users loading a report at the same moment)
  could both pass a stale "no existing refund" check and both create a
  duplicate refund credit for the same account.
- **Not done this pass** (documented residual, see below): `updatePayment()`'s
  recompute-from-all-payments path, and `applyCreditToAccount()`'s
  read-then-write balance/credit updates, retain the same class of race the
  fixes above closed elsewhere in this module — narrower in practice (both
  require two specific actions racing on the *same* account within a short
  window) but not yet closed. Full per-function IDOR coverage (every
  `staffId`/`productId`/`accountId` reference across all ~40 functions in this
  1100+-line file) was also not exhaustively re-audited; `createAccount()` and
  `updateCustomer()`'s confirmed gaps were fixed, others may remain.

### Documented residual concurrency risks (accepted, not full serializable protection)

None of these can corrupt the *primary* financial figure (the atomic
increment/decrement always accumulates correctly); each is a narrower
edge case where a *derived* field (a status flip, a balance-guard rejection)
could theoretically be based on a snapshot that's gone stale by the time a
second, near-simultaneous request completes:

- Accounting `recordInvoicePayment()`: the "payment exceeds remaining
  balance" guard reads a snapshot before the transaction; two concurrent
  payments that each individually fit the remaining balance based on their
  own stale read could together slightly overpay (the `amountPaid` figure
  itself is never wrong, since it's an atomic increment).
- Installment `recordPayment()`: if a *third* payment interleaves precisely
  between the atomic balance decrement and the immediately-following
  clamp-to-zero-and-flip-status step, that third payment's status/clamp
  write could be based on a value one payment out of date. `totalPaid` and
  `balance` themselves are never wrong.
- POS's stock-availability pre-check (unchanged from its original design,
  documented in `docs/DECISIONS.md`) is a fast UX helper, not the actual
  safety mechanism — the atomic guarded decrement inside `recordMovement()`
  is what actually prevents overselling.

Closing these fully would require either Postgres `SELECT ... FOR UPDATE`
row locking (raw SQL, avoided so far in this codebase) or serializable
transaction isolation (a broader performance/retry-handling change). Given
these are real business amounts, not internal counters, this residual is
worth closing in a future pass but was judged disproportionate to hold up
this one.

## Remaining work (Pass 3, not started)

### Remaining IDOR audit surface

CRM, HR, and Fleet have not been individually audited line-by-line for the
same unchecked-foreign-id pattern fixed elsewhere in this file — the audit
flagged this as likely present but unconfirmed. POS register/session setup
beyond what Pass 2 fixed, and Installment's ~40 functions beyond
`createAccount()`/`updateCustomer()`, also warrant a full pass.

### Invitation redesign (not started)

Current design (`src/lib/auth/tokens.ts`, `acceptInvite()` in
`src/lib/auth/actions.ts`) keys invite tokens by email only
(`invite:<email>`), not by membership. Confirmed real problems:
- Accepting one token activates **every** `INVITED` membership for that user
  (`updateMany` with no organization scoping) — a second organization's invite
  can be accepted through a first organization's link.
- An existing active user's password is unconditionally replaced by
  `acceptInvite()`.
- A later invite for the same email deletes any earlier organization's
  outstanding invite token (`issueToken()` does `deleteMany` by identifier).

Full fix requires a new `Invitation` model (organization + membership + role +
email + hashed token + expiry + status + creator + acceptance time) and a
rewritten accept flow that: for an existing user, requires authentication or
verified email ownership rather than replacing the password, and activates only
the one intended membership. This is a schema change and a full flow rewrite —
correctly out of scope for a "confirmed IDOR path" fix.

### Runtime validation (not started)

Zod is an installed but unused dependency. Server Actions rely on
`String(...).trim()`, `parseInt`/`parseFloat`, `new Date(...)`, and TypeScript
enum casts — none of which validate untrusted input at runtime. Needs shared
Zod schemas for amounts, quantities, percentages, dates, emails, and relation
ids, applied across every mutating Server Action. Large, cross-cutting; not
started this pass.

### Automated tests / reproducible setup (partially started)

Pass 1 added the project's first committed Vitest suite (tenant guard,
session revocation, dashboard leak, Administration/Projects/Payroll IDOR).
Pass 2 extended it with `test/pass2-financial-inventory-integrity.test.ts` —
18 tests covering the atomic-guard and validation behavior added across
Inventory, POS, Procurement, Accounting, Payroll, and Installment (45 tests
total across 5 files). These are still mocked-`db` tests, not integration
tests against a real database transaction under actual concurrent load — they
verify the *code* takes the atomic-updateMany-with-guard shape and rejects
correctly when a mocked `count: 0` simulates a lost race, not that Postgres
itself behaves as reasoned about above under real concurrent connections. A
real concurrency integration test (two actual concurrent requests against a
test database, asserting the final total is correct) is Pass 3 work.
Reproducible platform seeding (`.env.example`, committed RBAC/module seed
script, CI workflow, Node version pin) is also Pass 3.

### Audit logging, email/public-form hardening, performance, accessibility, documentation accuracy

All confirmed in the audit, all deferred to a later pass — none are blocking
correctness or safety in the way tenant isolation, session revocation, and the
IDOR/financial-integrity issues are.

---

## Billing / Subscriptions

Per explicit scope clarification: billing, subscriptions, pricing plans,
checkout, usage metering, and payment-provider integration are **not** part of
this project's implemented or planned-for-this-pass scope. The existing
`/app/platform/subscriptions` placeholder page is relabeled to say
**"Planned — requirements not yet defined."** No further work on it is
implied by this hardening pass.
