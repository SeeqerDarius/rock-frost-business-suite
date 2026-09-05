# Production Hardening Plan

## Security controls release (2026-08-13)

The application applies global CSP, HSTS, clickjacking protection,
MIME-sniffing protection, referrer policy, permissions policy, and opener
isolation through `next.config.ts`. CI blocks high-severity dependency
vulnerabilities and scans full Git history with Gitleaks. Cloudflare Turnstile
verification is wired into login, password-reset requests, and the public
contact form. It becomes mandatory when both `TURNSTILE_SECRET_KEY` and the
matching `NEXT_PUBLIC_TURNSTILE_SITE_KEY` are configured. If Turnstile is not
configured, the public contact form uses a server-signed proof that expires
after two hours, enforces a minimum completion time, checks a hidden honeypot,
and retains the database-backed email cooldown. Login and password-reset
forms do not use this fallback and continue to fail closed. Verification
failures are logged without recording challenge tokens or submitted content.

Prisma parameterization, tenant-scoped access checks, password hashing, TOTP
secret encryption, login lockout, and upload signature checks remain in place.
PostgreSQL row-level security is not enabled in this release. It requires a
separate database-role and transaction-context design so it does not break
migrations, authentication, platform administration, jobs, or backups.

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

**Pass 3a (invitation redesign) — complete** (2026-07-21): invites are now
bound to one specific membership via a hashed token, never activate more than
the intended membership, never replace an existing user's password, and
support resend/revoke with basic rate limiting. See the "Pass 3a" section
below for full detail.

**Pass 3b — complete** (2026-07-21): a shared Zod validation library, applied
to the public contact form (previously the most acute remaining gap — no
email/length validation, no HTML escaping, no rate limiting, and a
silently-dropped submission whenever email wasn't configured) and to
Administration's invite form; a full IDOR audit of CRM, HR, and Fleet
(the three modules the audit flagged as "likely present but unconfirmed"),
finding and fixing real unchecked-foreign-id gaps in all three, plus one
lost-update race in Fleet's Work & Pay payment recording matching the exact
pattern Pass 2 fixed elsewhere. See the "Pass 3b" section below for full
detail.

**Pass 3c — complete** (2026-07-21): full IDOR audit of Installment's
remaining ~40 functions and POS register/session setup; Zod validation
rolled out across the remaining ~45 Server Action files; bounded
Decimal-precision hygiene in Accounting/Payroll/Installment (every derived
monetary value that gets written to the database, plus the ledger's core
debit=credit invariant, now uses `Prisma.Decimal` instead of JS `Number`);
reproducible seeding/CI (`.env.example`, `.nvmrc`, GitHub Actions workflow,
committed idempotent `prisma/seed.ts`); stale Phase-1-era documentation
(`README.md`, `docs/ARCHITECTURE.md`, `docs/DATABASE_STRATEGY.md`)
corrected to reflect current reality. See the "Pass 3c" section below for
full detail.

**Pass 4, Milestone A — complete** (2026-07-22): real-PostgreSQL integration
test infrastructure (a genuinely disposable test database, never
production, guarded from three independent directions) and a tenant-
isolation integration suite across all 11 modules, proving the IDOR fixes
from Passes 1–3c against real Postgres, not mocks. Found and fixed one new
gap along the way (`InventoryItem.categoryId` had no cross-tenant check).
See the "Pass 4, Milestone A" section below.

**Pass 4, Milestone B — complete** (2026-07-22): closed the two previously-
documented residual concurrency races (Accounting's `recordInvoicePayment`,
Installment's `recordPayment`/`updatePayment`/`applyCreditToAccount`) using
`SELECT ... FOR UPDATE` row locking; found and fixed two more real races
while writing the concurrency test suite (`cancelOrder()`'s partially-
received-order gap, and a systemic `count()`-then-format document-number
collision affecting six different number-generation functions); added a
real concurrency test suite (`Promise.allSettled` against genuinely
overlapping Postgres transactions) covering Inventory, POS, Procurement,
Accounting, Payroll, and Installment. Two further receipt-number generators
(Installment's `createAccount` deposit receipt and `applyCreditToAccount`)
were migrated to the same fix on 2026-07-22 during verification prep,
closing the milestone's one remaining deferred item. See the "Pass 4,
Milestone B" section below.

**Pass 4, Milestone C — complete** (2026-07-22): a shared, append-only audit
service (`src/lib/audit.ts`) wired into authentication, administration, and
the financial/operational mutations across every module; a real org-scoped
audit-log viewer with filters/pagination and a permission-gated CSV export
(itself audited). See the "Pass 4, Milestone C" section below.

**Pass 4, Milestone D — baseline complete** (2026-07-28). Added authenticated
automatic trial expiry, a database-backed health probe, structured cron and
uncaught-request error logs, Vercel Web Analytics and Speed Insights, a global
keyboard skip link, focusable main landmarks, reduced-motion support, patched
production dependencies, and operational documentation. Ongoing performance
and accessibility work is evidence-driven through production metrics and
manual assistive-technology checks. The branch-access design remains separate.

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

## Pass 3a — Invitation redesign (complete)

**Status: fixed.** Previous design (`src/lib/auth/tokens.ts`'s `issueInviteToken`/
`consumeInviteToken`, keyed by `invite:<email>`) confirmed three real problems:
accepting one token activated **every** `INVITED` membership for that user
(a second organization's invite could be accepted through a first
organization's link); an existing active user's password was unconditionally
replaced by `acceptInvite()`; a later invite for the same email deleted any
earlier organization's outstanding token (`issueToken()`'s `deleteMany` by
identifier).

**Fix — new `Invitation` model** (migration `20260721010000_add_invitations`),
bound to one specific `OrganizationMember` via a `membershipId` **unique**
foreign key, not an email:
- `tokenHash` stores a SHA-256 digest, never the raw token — `src/lib/auth/invitations.ts`'s
  `createInvitation()` generates the raw token, hashes it for storage, and
  returns the raw value only long enough to build the email link.
- **Accepting activates only `invitation.membershipId`** — `acceptInvitationNewUser()`
  and `acceptInvitationExistingUser()` both call a scoped
  `organizationMember.update({ where: { id: membershipId } })`, never an
  `updateMany` across every membership a user might have.
- **An existing active user's password is never touched.** Two distinct
  accept paths: `acceptInvitationNewUser()` (the invited user has never set a
  password — collects one) vs. `acceptInvitationExistingUser()` (the user is
  already `ACTIVE` — requires the *currently authenticated session* to match
  the invitation's target user id, and only ever writes the membership row).
  The `/invite` page (`src/app/(auth)/invite/page.tsx`) branches on
  `previewInvitation()`'s `isNewUser` flag to decide which path to render; for
  an existing user with no active session, it links to
  `/login?callbackUrl=/invite?token=...` rather than collecting credentials
  itself. The login page (`src/app/(auth)/login/page.tsx`) was refactored to
  actually honor a `callbackUrl` query param (previously hardcoded to
  `/app/dashboard`, silently dropping any return-to destination) — extracted
  into a `useSearchParams()`-reading component under `<Suspense>`, matching
  the pattern the page already used for its notice banner.
- **Status support**: `PENDING`/`ACCEPTED`/`REVOKED` are stored; `EXPIRED` is
  deliberately derived from `expiresAt < now` at accept time rather than
  stored (the same "compute don't store" choice Installment makes for
  `OVERDUE`). `lastDeliveryFailed` is a separate boolean, not conflated with
  `status`, so a failed send doesn't invalidate an otherwise-valid token — an
  admin can still resend or share the link manually.
- **Resend/revoke with basic rate limiting**: `resendInvitation()` issues a
  fresh token (old one invalidated) but rejects a second resend within 60
  seconds of the last send; `revokeInvitation()` atomically claims
  `PENDING`→`REVOKED` (a guarded `updateMany`, the same pattern as every Pass
  2 state transition) so a concurrent accept-vs-revoke race resolves to
  exactly one winner. Both are wired into new buttons on the Administration
  page's Members table, shown only for `INVITED` members with a `PENDING`
  invitation.
- **Delivery failure is never reported as success**: `inviteMember()` (and
  the new `resendMemberInvitation()`) now check `sendEmail()`'s real result;
  a failed send marks `lastDeliveryFailed: true` (surfaced as an "Email
  failed" badge in the Members table) and redirects with
  `?error=delivery-failed` instead of the success banner.

**Files changed:** `prisma/schema.prisma` (+migration); `src/lib/auth/invitations.ts`
(new); `src/lib/auth/tokens.ts` (invite-specific functions removed, password-reset
untouched); `src/lib/auth/actions.ts` (`acceptInvite` rewritten, new
`acceptInviteExisting`); `src/app/(auth)/invite/page.tsx` (rewritten for both
accept paths); `src/app/(auth)/login/page.tsx` (respects `callbackUrl`);
`src/app/app/(overview)/administration/actions.ts` (`inviteMember` uses
`createInvitation()`, new `resendMemberInvitation`/`revokeMemberInvitation`);
`src/app/app/(overview)/administration/page.tsx` (invitation status column,
resend/revoke buttons); `test/invitation-redesign.test.ts` (new, 13 tests).

**Verified end-to-end via Playwright**: normal login still works after the
login-page refactor; an invalid token, an expired token, and an
already-accepted token each show the correct distinct message; a brand-new
invitee sets a password, is redirected to `login?activated=1`, logs in, and
reaches the dashboard with the invited organization actually active; the
Administration page's Resend/Revoke buttons render correctly and Revoke
performs a real atomic state change. All test users/memberships/invitations
created for this were deleted afterward via a one-off cleanup script.

**Not done this pass** (documented, low-risk): the existing-user accept path
(`acceptInvitationExistingUser`) was verified via Vitest but not
browser-verified end-to-end (it requires a second real user account already
active in the system to exercise realistically) — the unit tests cover its
core invariants (never calls `user.update`, rejects a mismatched session)
directly against the service function.

## Pass 3b — Zod validation foundation + public contact form + CRM/HR/Fleet IDOR audit (complete)

**Status: fixed**, scoped to the two highest-value targets rather than a
blanket retrofit of all ~49 Server Action files in the app (see "Remaining
work" below for why that's explicitly not claimed as done).

### Shared Zod validation library

New `src/lib/validation.ts`: reusable primitives for untrusted input —
`moneyAmount`/`moneyAmountNonNegative` (positive/non-negative decimal strings,
≤2 decimal places), `positiveInt`, `percent0to100`, `email` (format + case
normalization), `shortText`/`longText` (length-bounded strings), `dateInput`
(HTML date-input parsing), `cuid`, `escapeHtml()`, and a `parseWithSchema()`
helper that returns either typed data or a single readable error message. Not
yet wired into every mutating Server Action — see "Remaining work" for exactly
which files use it today.

### Public contact form (`src/app/(public)/contact/actions.ts`)

The audit's most acute remaining finding: no email format or length
validation, no rate limiting, and user-submitted fields interpolated
**unescaped** directly into an HTML email sent to Rock Frost staff (a real
HTML/markup-injection vector into outbound mail). Also: a submission was
silently dropped (only `console.warn`-logged) whenever `RESEND_TO_EMAIL`
wasn't configured — no record of it existed anywhere.

Fixed: Zod validation via the new library (name/company: `shortText`; email:
format-checked and normalized; message: length-capped); every field is passed
through `escapeHtml()` before being embedded in the notification email; a new
`ContactSubmission` model (migration `20260721020000_add_contact_submission`)
persists every submission regardless of email delivery outcome, and doubles as
the source for a basic per-email rate limit (rejects a resubmission from the
same email within 60 seconds).

### Administration invite form

`inviteMember()`'s `email`/`name` fields had no format or length validation at
all (a malformed email would create a `User` row that could never receive its
invite). Now validated via the shared `email`/`shortText` schemas.

### CRM / HR / Fleet cross-tenant IDOR audit

The audit flagged these three modules as "likely present but unconfirmed" for
the same unchecked-foreign-id pattern fixed in Pass 1/2. Audited line-by-line;
all three had real, confirmed gaps:

- **CRM** (`src/modules/crm/service.ts`): `createContact`/`updateContact`/
  `createLead`/`updateLead`/`createDeal`/`updateDeal`'s `ownerId` was never
  checked against the organization; `createDeal`/`updateDeal`'s `contactId`
  and `createActivity`'s `contactId`/`leadId`/`dealId` were never checked
  either. All now resolve through an organization-scoped lookup (new
  `NotFoundError`).
- **HR** (`src/modules/hr/service.ts`): `createEmployee`/`updateEmployee`'s
  `managerId`, and `createLeaveRequest`'s `employeeId`/`leaveTypeId`, and
  `createReview`'s `employeeId` were all unchecked. Same fix pattern.
- **Fleet** (`src/modules/fleet/service.ts`) — the most gaps of the three:
  `createFleetVehicle`/`updateFleetVehicle`'s `ownerId`/`assignedDriverId`;
  `createFleetVehicleDocument`/`updateFleetVehicleDocument`'s `vehicleId`;
  `createFleetMaintenanceRequest`'s `vehicleId`; `createFleetWorkAndPayContract`'s
  `vehicleId` — all unchecked, all now validated. **Also found and fixed
  while auditing**: `recordFleetWorkAndPayPayment()` used the exact
  read-then-absolute-write pattern Pass 2 fixed everywhere else — two
  concurrent payments on the same contract could lose one payment's
  contribution to `amountPaid`/`outstandingBalance`. Now uses one atomic
  multi-field `increment`/`decrement`, the same fix shape as Installment's
  `recordPayment()`, plus a positive-amount check (new
  `InvalidPaymentAmountError`).

**Files changed:** `src/lib/validation.ts` (new); `prisma/schema.prisma`
(+`ContactSubmission` model, migration `20260721020000_add_contact_submission`);
`src/app/(public)/contact/{actions.ts,page.tsx}`; `src/app/app/(overview)/administration/actions.ts`;
`src/modules/{crm,hr,fleet}/service.ts`; every CRM/HR/Fleet action file that
calls the now-validating service functions (`contacts`/`leads`/`deals`/`activities`
for CRM; `employees`/`leave`/`reviews` for HR; `vehicles`/`insurance-roadworthy`/
`maintenance`/`work-and-pay` for Fleet) plus their `page.tsx` error maps;
`test/validation.test.ts`, `test/contact-form.test.ts`, `test/idor-crm-hr-fleet.test.ts`
(new, 28 tests total).

**Migration impact:** additive only (`ContactSubmission` table) — zero-downtime.

**Verified end-to-end via Playwright**: the contact form rejects a malformed
email, HTML-escapes an injected `<script>` tag before it would reach the
outbound email (confirmed directly via Vitest against the constructed email
body — outbound send itself fails in this sandboxed dev environment due to no
network egress to Resend, a pre-existing environment limitation unrelated to
this fix), persists every submission regardless of delivery outcome, and
rate-limits an immediate resubmission from the same email. Test data cleaned
up afterward via a one-off script.

## Pass 3c — remaining IDOR audit, full Zod rollout, Decimal hygiene, reproducible seeding/CI (complete)

**Status: fixed**, closing out every item Pass 3b's "Remaining work" section
listed as still open.

### Installment full IDOR audit + POS register/session audit

Line-by-line audit of every function in `src/modules/installment/service.ts`
(the largest, oldest service file in the codebase) beyond the two functions
Pass 2 already covered (`createAccount`, `updateCustomer`). Found and fixed:
`recordStaffSalaryPayment()` (unchecked `staffId`, unvalidated amount),
`adjustStaffInventory()` (unchecked `staffId`/`productId` — zero real callers
today, fixed anyway for defense-in-depth since it's an exported service
function), and `updateInstallmentSettings()` (no bounds checking at all on
percentage/money settings that feed directly into admin-fee/refund/commission
math — new `InvalidSettingsError`). POS's `createRegister()`/`updateRegister()`
now validate `warehouseId` belongs to the organization (new
`validateWarehouseRef()` helper in `src/modules/pos/service.ts`).

### Zod validation — full rollout

Every remaining mutating Server Action file (all ~45 Pass 3b left
unconverted, across Accounting, Payroll, Procurement, POS, Inventory,
Projects, Fleet, Installment, Platform, Notifications, and the untouched
exports of `src/lib/tenant/actions.ts`/`src/lib/auth/actions.ts`) now
validates its FormData input through the shared schemas in
`src/lib/validation.ts` before calling into the service layer — money fields
via `moneyAmount`/`moneyAmountNonNegative`, quantities via `positiveInt`,
percentages via `percent0to100`, emails via `email`, names/titles via
`shortText`, notes/descriptions via `longText`, date-picker fields via
`dateInput`, and foreign-id fields via `cuid` for well-formedness (the actual
IDOR protection remains the organization-scoped `service.ts` lookup — `cuid`
here is defense-in-depth, not the security boundary). Most files reused an
existing `?error=` slug already in the page's error map (typically
`missing-fields`); a handful of pages that previously had no generic
validation-failure slug gained a new `invalid-input` entry.

### Decimal-precision hygiene (bounded, not a blanket rewrite)

Rather than converting every `Number(...)` call site across Accounting,
Payroll, and Installment (~80 sites, many of them read-only reporting/
dashboard aggregations recomputed fresh on every request — no compounding
risk, low value to touch), this pass converted specifically the sites where
a JS-float-computed value gets **written to the database** or decides a
**core business invariant**, since those are the two places float rounding
error becomes a real, persisted, or safety-relevant problem:

- **Accounting** (`src/modules/accounting/service.ts`): `postJournalEntry()`'s
  debit=credit balance check — the core double-entry invariant for the whole
  ledger — now compares `Prisma.Decimal` sums exactly, replacing a `Math.abs(...)
  > 0.005` epsilon fudge-factor that existed specifically to work around float
  error. `computeBalance()` (every account's displayed balance) sums its
  journal lines via `Decimal` rather than `Number`, since an account can
  accumulate thousands of lines over its lifetime and summation error
  compounds across many terms in a way a single arithmetic op doesn't.
  `recordInvoicePayment()`'s remaining-balance guard and fully-paid check are
  now exact `Decimal` comparisons, removing another `0.005` epsilon hack.
- **Payroll** (`src/modules/payroll/service.ts`): `processRun()`'s
  grossPay/taxDeduction/netPay computation (written straight into each
  `PayrollPayslip` row) now uses `Prisma.Decimal` arithmetic throughout.
- **Installment** (`src/modules/installment/service.ts`): every derived value
  that gets persisted now uses `Decimal` — `createAccount()`'s
  targetAmount/adminFee/initial-balance computation, `recordPayment()`'s
  overpayment-clamp and credit-amount derivation, `applyCreditToAccount()`'s
  partial-application math, the closure-refund and reactivation service-fee
  calculations, and `computeProductPrice()`'s price-floor check.
- **Deliberately left as `Number`**: read-only reporting/dashboard
  aggregations in all three modules (outstanding totals, win-rate
  percentages, collection summaries) — these are recomputed fresh from the
  database on every request rather than accumulated over time, so there's no
  compounding-error risk, and converting them adds review surface for no
  correctness benefit.

### Reproducible seeding/CI

- `.env.example` documents every required environment variable with
  placeholder values and explanatory comments (including that Resend email
  degrades gracefully to console-logging when unconfigured).
- `.nvmrc` + `package.json`'s `engines.node` pin the Node version.
- `prisma/seed.ts` (new, committed, idempotent): upserts every `Permission`
  row, every system `Role` with its permission grants, and every `Module`
  row — verified via two real runs against the live database confirming
  identical output (76 permissions, correct per-role grant counts, 11
  modules, no errors) on the second run. Wired up via `npm run db:seed` and
  the `prisma.seed` config key (so `npx prisma db seed` also works). Does
  *not* create tenant-level data (a demo organization/users) — that remains a
  separate concern from platform-level RBAC/module bootstrap.
- `.github/workflows/ci.yml`: lint → typecheck → `prisma validate` → test →
  build, using placeholder env vars (documented as intentionally fake, since
  `prisma validate`/`generate` don't require live database connectivity) —
  not yet verified against a real GitHub Actions run (no way to trigger one
  from this environment).
- Stale Phase-1-era claims in `README.md`, `docs/ARCHITECTURE.md`, and
  `docs/DATABASE_STRATEGY.md` (all still describing a UI-only shell with "no
  Prisma," "no real auth," "database not yet touched") replaced with accurate
  current-state sections.

**Files changed:** `.env.example`, `.nvmrc`, `.github/workflows/ci.yml`
(all new); `prisma/seed.ts` (new); `package.json` (`engines`, `db:seed`
script, `prisma.seed` config, `tsx` devDependency); `README.md`,
`docs/ARCHITECTURE.md`, `docs/DATABASE_STRATEGY.md`; every remaining Server
Action file across Accounting/Payroll/Procurement/POS/Inventory/Projects/
Fleet/Installment/Platform/Notifications plus their `page.tsx` error maps;
`src/lib/tenant/actions.ts`, `src/lib/auth/actions.ts`; `src/modules/
{accounting,payroll,installment,pos}/service.ts`; `test/pass3c-installment-
pos-decimal.test.ts` (new, 15 tests).

**Migration impact:** none this pass (no schema change — the Decimal work is
pure arithmetic-library substitution against existing `Decimal`-typed
columns).

**Verification:** `npx tsc --noEmit`, `npm run lint`, `npx prisma validate`,
`npx vitest run` (101 tests across 10 files, all passing), and `npm run
build` (full production build, all 101 routes) all pass clean.

## Pass 4, Milestone A — real-Postgres integration tests (complete)

**Status: fixed.** Adds a second, independent test layer alongside the
mocked-`db` unit suite: real Prisma queries against a genuinely disposable
database, never production.

### Test-database safety

`test/integration/setup/guard.ts`'s `assertSafeTestDatabase()` refuses to run
unless: `TEST_DATABASE_URL` is set; its database name contains `"test"`; it
differs from `DATABASE_URL`/`DIRECT_URL`; `ALLOW_INTEGRATION_TESTS=1` is
explicitly set (so the suite can never run as a side effect of a plain
`npm test`); and `NODE_ENV`/`VERCEL_ENV` isn't `production`. Verified
working directly — running `npm run test:integration` with no
`TEST_DATABASE_URL` set fails closed with an actionable error, touching
nothing. `test/integration/setup/{db,fixtures}.ts` provide the real
`PrismaClient` and per-suite isolated-organization fixtures
(`createTestOrg`/`cleanupTestOrg`). `prisma/seed-data.ts` was extracted from
`prisma/seed.ts` (now a thin CLI wrapper) so the same platform-bootstrap
logic seeds the test database too, without any risk of `seed.ts`'s own
import accidentally running against a wrong `DATABASE_URL`.

`.github/workflows/ci.yml` gained a second `integration` job: a genuinely
ephemeral `postgres:16` service container (no external secrets needed),
migrated via `npm run db:test:migrate`, then `npm run test:integration`
against it. The `validate` job is otherwise unchanged.

### Tenant-isolation integration suite

`test/integration/tenant-isolation/*.test.ts` — one file per module
(Administration, Projects, Fleet, Installment, CRM, Inventory, Accounting,
HR, Procurement, Payroll, POS) — each creates two real, fully isolated
organizations and proves Organization A can never read or write
Organization B's records through that module's real service-layer
functions, against real Postgres. This is the real-database counterpart to
the mocked `test/idor-*.test.ts` suite from Passes 1–3c.

**Found and fixed while writing these:** `createItem()`/`updateItem()` in
`src/modules/inventory/service.ts` had no cross-tenant check on
`categoryId` — a category belonging to another organization could be
attached to an item. Fixed with a `requireCategory()` helper matching every
other module's IDOR-fix pattern, with a regression test.

**Files changed:** `test/integration/setup/{guard,db,fixtures}.ts` (new);
`test/integration/tenant-isolation/*.test.ts` (new, 11 files);
`prisma/seed-data.ts` (new); `prisma/seed.ts` (now a thin wrapper);
`scripts/test-db-migrate.ts`, `scripts/test-db-seed.ts` (new);
`vitest.integration.config.ts` (new); `vitest.config.ts` (scoped to
`test/*.test.ts` only, non-recursive, so it can never pick up the
integration suite); `package.json` (`test:integration`, `test:all`,
`db:test:migrate`, `db:test:seed` scripts, `cross-env` devDependency);
`.github/workflows/ci.yml` (new `integration` job); `.env.example`
(`TEST_DATABASE_URL`); `docs/TESTING_STRATEGY.md`, `docs/DATABASE_STRATEGY.md`;
`src/modules/inventory/service.ts` + `src/app/app/inventory/items/{actions,page}.tsx`
(the categoryId fix above).

**Migration impact:** none.

**Honest verification limits:** this sandbox has no local Postgres, Docker,
or GitHub Actions access. Everything above was verified via `tsc`/`lint`/the
existing mocked suite/production build — all clean — plus the safety
guard's refusal behavior, which was actually exercised. The integration
suite's tests themselves have **not** been executed against a real
database by me; they need a real disposable Postgres (locally or in CI) to
confirm they pass for real.

## Pass 4, Milestone B — closing residual concurrency races (complete)

**Status: fixed** for the two previously-documented races, plus two more
found while writing this milestone's test suite.

### Accounting `recordInvoicePayment()`

The remaining-balance guard now runs *inside* the transaction against the
invoice row locked with `SELECT ... FOR UPDATE` (raw SQL via `tx.$queryRaw`
— this codebase's first use of raw SQL, chosen because Prisma's query
builder can't express a same-row field-to-field comparison like
`amountPaid + payment <= amount` any other way), instead of a
pre-transaction snapshot. A second concurrent payment on the same invoice
now blocks on the row lock until the first commits, then re-reads the true
committed `amountPaid` before deciding whether it still fits.

### Installment `recordPayment()` / `applyCreditToAccount()` / `updatePayment()`

- `applyCreditToAccount()`: both the credit and the target account are now
  read via `SELECT ... FOR UPDATE` inside the transaction, replacing two
  pre-transaction `findFirst` reads.
- `recalculateAccountAfterPaymentChange()` (called by `updatePayment()`,
  a full recompute-from-every-payment, not an increment — can't use the
  guarded-`updateMany` pattern): now locks the account row with
  `SELECT ... FOR UPDATE` before its read, serializing it against
  `recordPayment()`/`applyCreditToAccount()` on the same account.
- `recordPayment()` itself needed no code change — on closer analysis its
  two same-transaction updates were never actually racy against each other
  (Postgres holds the row lock from the first `UPDATE` until commit); the
  real gap was the other two functions reading stale data with no lock at
  all. Its docstring was corrected to stop claiming a residual race that
  isn't real.

### Found while writing the concurrency tests (not in the original list)

- **`generateInvoiceNumber`/`generateExpenseNumber`/`generateEmployeeNumber`/
  `generateSaleNumber`/`generateRequestNumber`/`generateOrderNumber`/
  `generateProjectCode`** (Accounting, HR, POS, Procurement ×2, Projects):
  all `count()`-then-format, racy under real concurrency — two simultaneous
  creates can read the same count and compute the same number. The
  `@@unique` constraint prevented an actual duplicate row, but the second
  caller previously got an unhandled `P2002` crash instead of a usable
  record. Fixed with a shared `createWithUniqueRetry()` helper
  (`src/lib/unique-retry.ts`) that retries the whole create (or whole
  transaction, for POS/Procurement's multi-statement creates) with a freshly
  regenerated number on a unique-constraint collision.
- **Procurement `cancelOrder()`**: the atomic status claim only excluded
  `RECEIVED`/`CANCELLED`, relying on a separate *stale pre-transaction read*
  of the order's lines to reject cancelling a partially-received order. A
  concurrent `receiveOrderLine()` landing between that read and the claim
  could move the order to `PARTIALLY_RECEIVED` without the cancel noticing —
  the claim's own `WHERE` clause still matched, incorrectly cancelling an
  order with real received stock against it. Fixed by restricting the claim
  itself to `status IN (DRAFT, SENT)`, removing the stale pre-check
  entirely (the atomic claim now *is* the correct-and-only guard).

### Real concurrency test suite

`test/integration/concurrency/*.test.ts` (6 files: inventory, pos,
procurement, accounting, payroll, installment) — genuine `Promise.allSettled`
firing truly concurrent requests into the same service function against
real overlapping Postgres transactions, asserting on final totals, final
status, exact row counts, and absence of duplicates. Covers: competing
stock issues/receipts/transfers, competing POS sales/refunds, competing
purchase-order receives (and a receive-vs-cancel race), competing invoice
payments (both the overpay-rejection and the exact-fit case) and invoice
sends, competing payroll-run processing (and a process-vs-cancel race), and
competing installment payments/credit-applications.

**Files changed:** `src/modules/accounting/service.ts` (`recordInvoicePayment`
row lock, `createWithUniqueRetry` for invoice/expense numbers);
`src/modules/installment/service.ts` (`applyCreditToAccount`/
`recalculateAccountAfterPaymentChange` row locks, `createWithUniqueRetry`
for receipt numbers in `recordPayment`); `src/modules/procurement/service.ts`
(`cancelOrder` fix, `createWithUniqueRetry` for request/order numbers);
`src/modules/{hr,pos,projects}/service.ts` (`createWithUniqueRetry` for
employee/sale/project numbers); `src/lib/unique-retry.ts` (new, shared
helper); `test/integration/concurrency/*.test.ts` (new, 6 files);
`test/pass2-financial-inventory-integrity.test.ts`,
`test/pass3c-installment-pos-decimal.test.ts` (updated mocks for the new
`$queryRaw` row-lock calls).

**Migration impact:** none (no schema change — every fix is query/logic
shape, using the existing `Decimal`-typed columns from earlier passes).

**Follow-up (2026-07-22, during verification prep):** the two receipt-number
generators noted below as deferred (`createAccount()`'s deposit receipt,
`applyCreditToAccount()`'s receipt number) have now been migrated to
`createWithUniqueRetry()` as well — no concrete reason was found to treat
them differently from the other eight call sites, so the deferral was
closed rather than left open. Both wrap their existing `db.$transaction`
in the retry helper, with `generateReceiptNo()` moved inside the retried
closure so it recomputes fresh (rather than reusing the same doomed
number) on each attempt. Verified via `npx tsc --noEmit` and the existing
`test/pass3c-installment-pos-decimal.test.ts` suite (15 tests, still
passing unmodified — these tests mock `db.$transaction` directly, not the
outer retry wrapper, so no mock changes were needed) plus the full 101-test
unit suite. `HirePurchasePayment` already has `@@unique([organizationId,
receiptNo])`, confirming this was a real, live P2002 collision surface
under concurrency, not just a theoretical one.

**Verification:** `npx tsc --noEmit`, `npm run lint`, `npx prisma validate`,
`npx vitest run` (101 tests across 10 files, all still passing, mocks
updated for the new raw-query call sites), and `npm run build` (full
production build, all 101 routes) all pass clean. Same honest limit as
Milestone A: the concurrency tests themselves need a real disposable
Postgres to actually execute — verified here via `tsc` and careful manual
review of each fixed function's current code, not by watching them run.

## Pass 4, Milestone C — audit logging (complete)

**Status: fixed.** A shared, append-only audit trail, wired into
authentication, administration, and the financial/operational mutations
across every module, plus a real viewer.

### Schema

`AuditLog` (already existed, mostly unused) gained `membershipId` (actor's
`OrganizationMember`), `module` (source module key), `status`
(`SUCCESS`/`FAILURE`), and `correlationId`, plus a back-relation on
`OrganizationMember`. `organizationId` is now nullable — a failed login for
an email matching no user (or a user with zero organization memberships)
genuinely has no organization to attach to. Two migrations (both purely
additive/relaxing, zero-downtime).

### Shared service

`src/lib/audit.ts`'s `logAuditEvent(input, tx?)` is the one way anything in
this codebase writes an audit row:
- Accepts an optional Prisma transaction client — pass it when the event
  describes a mutation that just happened inside a `db.$transaction(...)`
  callback, so the audit row commits or rolls back atomically with the
  real operation (a hard requirement: an audit entry for a mutation must
  only persist if that mutation's transaction actually commits).
- Never throws. A failure to write an audit row logs to the server console
  instead of breaking the real operation — verified for real: the mocked
  unit suite's `invitation-redesign.test.ts` didn't mock `auditLog.create`
  initially, so every accept-path test exercised this exact failure path
  and all 13 tests still passed, proving the defensive try/catch works
  under a genuinely broken audit sink, not just in theory.
- Best-effort IP/user-agent capture from the current request's headers.

### Events wired

**Authentication** (`module: "auth"`): login success/failure (including
lockout and wrong-password — the failure event never reveals which reason
to distinguish "no such account" from "wrong password" for an
unauthenticated caller), logout (NextAuth's `signOut` event), password
reset, session revocation (generic — covers every `revokeUserSessions()`
caller, not just password reset).

**Administration** (`module: "administration"`): invitation created,
resent, revoked, accepted (both the new-user and existing-user accept
paths), module enable/disable (upgraded a pre-existing raw
`auditLog.create` call to the shared helper), audit-log CSV export.

**Financial/operational**, one event per successful mutation (with a
`FAILURE` counterpart on the module's own typed rejection error, e.g.
`InsufficientStockError`/`InvalidPaymentError`): inventory
receipt/issue/transfer/adjustment; POS sale and refund; procurement
receiving; journal posting; invoice send/payment/void; expense payment;
payroll run processing and cancellation; installment payment, credit
application/void/refund, and account reactivation.

**Deliberately not wired — no underlying action exists yet**: membership
suspension/removal, role reassignment after invite, and organization-status
change have no existing UI/Server Action in this codebase at all. Building
those from scratch would be new feature work, not "add audit logging to an
existing mutation" — out of scope for this pass.

### Audit-log viewer + permissions

Two new permission keys, `audit.view`/`audit.export` (seeded; granted
automatically to Super Admin/Organization Owner via `ALL_PERMISSIONS`, no
other role gets them by default). `/app/administration/audit-log`: an
org-scoped viewer with filters (date range, actor, module, action substring,
entity type, status) and pagination, gated on `audit.view`. A CSV export
route (`/api/audit-log/export`) respects the same filters, gated on the
separate `audit.export` permission, and audits the export itself
(`action: "audit_log.exported"`). The pre-existing platform-wide
`/app/platform/activity` page (Super-Admin-gated, cross-tenant) was left as
its simpler pre-existing self — the new org-scoped viewer is the real
deliverable here.

Tenant visibility has an additional actor boundary beyond `organizationId`:
`tenantAuditWhere()` excludes every event whose actor holds the global system
`Super Admin` role, even when a platform action targeted that tenant and the
row therefore carries the tenant's organization ID. The same scope is applied
to viewer rows/counts, actor/module/entity filter options, and CSV export.
Tenant/system events remain visible; the complete cross-tenant/operator trail
is available only from the Super-Admin-gated platform activity surface.

**Files changed:** `prisma/schema.prisma` (+2 migrations); `src/lib/audit.ts`
(new); `src/lib/auth/{nextauth,actions,session-revocation,invitations}.ts`;
`src/app/app/(overview)/administration/{actions,page}.tsx`;
`src/app/app/(overview)/administration/audit-log/page.tsx` (new);
`src/app/api/audit-log/export/route.ts` (new); `src/app/app/platform/actions.ts`;
`src/app/app/platform/activity/page.tsx` (nullable-org fix only);
`src/app/app/inventory/movements/actions.ts`; `src/app/app/pos/{sell,sales}/actions.ts`;
`src/app/app/accounting/{journal,invoices,expenses}/actions.ts`;
`src/app/app/procurement/orders/actions.ts`; `src/app/app/payroll/runs/actions.ts`;
`src/app/app/installment/{payments,accounts}/actions.ts`;
`src/lib/auth/permissions.ts`, `prisma/seed-data.ts` (2 new permission keys);
`test/invitation-redesign.test.ts` (mock fix).

**Migration impact:** additive/relaxing only, zero-downtime.

**Verification:** `npx tsc --noEmit`, `npm run lint`, `npx prisma validate`,
`npx vitest run` (101/101, unchanged), and `npm run build` (full production
build, 103 routes — the two new audit-log routes) all pass clean. Both new
permissions confirmed seeded against the live database (78 permissions,
up from 76).

## Remaining work (Pass 4, Milestone D+)

### 2026-08-10 Payroll settings initialization follow-up

The School customer-readiness release gate exposed a first-use race in
`getSettings()`: concurrent payroll processing could both enter Prisma's
upsert create path and one caller received a unique-constraint error instead
of the expected run-state result. Payroll settings reads/updates now take a
bounded shared unique-constraint retry around the settings upsert.
The complete disposable-PostgreSQL suite subsequently passed 19 files / 107
tests, including both payroll process/process and process/cancel races.

### Performance, resilience, accessibility

The production baseline is implemented: structured runtime/error logs, health
checks, Web Analytics, Speed Insights, keyboard skip links, main landmarks,
reduced-motion support, and a zero-production-vulnerability dependency audit.
Continue weekly Core Web Vitals review and periodic keyboard, screen-reader,
contrast, zoom, and responsive testing. Add an external uptime monitor against
`/api/health`; Vercel instrumentation does not itself page an operator.

### CI workflow — unverified against a real run

`.github/workflows/ci.yml` was added and reasoned through carefully but has
never actually executed on GitHub's infrastructure (this environment can't
trigger one). Worth confirming on the next real push before relying on it as
a merge gate.

### 2026-09-05 Centralized rate limiting (API routes and Server Actions)

Before this change, rate limiting existed only per-feature: login lockout,
invitation resend cooldown, the public contact form cooldown, customer
feedback cooldown, and the AI support-assistant reply cap. There was no
generic throttle covering the app's API routes or Server Actions as a whole.

`src/proxy.ts` (Next.js's request-interception file, which in this Next 16
release defaults to the Node.js runtime rather than Edge, so Prisma can run
directly inside it) now checks every request to `/api/*` (any method) and
every non-GET/HEAD request to any other path, since a Server Action
invocation is itself a POST to the page route that calls it. Identity is the
signed-in user's id from the NextAuth JWT (no DB hit to resolve it), or the
caller's IP when unauthenticated. Two fixed windows, tracked in a new
`RateLimitBucket` table via a single atomic `INSERT ... ON CONFLICT DO
UPDATE`:

- `auth` (5 min / 30 requests): `/api/auth/*` and non-GET requests to
  `/login`, `/forgot-password`, `/reset-password`, `/invite`. This is a
  second, IP-keyed layer on top of the existing per-account
  `failedLoginAttempts` lockout, which does nothing to slow a
  credential-stuffing pass spread across many accounts from one IP.
- `general` (60 sec / 300 requests): everything else in scope. The cap
  was set from the app's actual measured polling load (support chat and
  notification-badge polling top out around 50 to 70 requests per minute
  across a few open tabs for one signed-in user), leaving 4 to 6x headroom
  before it engages.

Exempt entirely (matched by path prefix, never written to the bucket
table): the Paystack and Flutterwave webhook routes (signature-verified,
called from provider-shared IP pools, and rate limiting must never read
their request body ahead of the downstream raw-body signature check); the
cron routes (already gated by a `CRON_SECRET` check and fired at most a
handful of times per day); `/api/health` (an external uptime probe, where a
false 429 becomes a false downtime alert); and the offline-sync routes
(device-signature authenticated, where a warehouse's device fleet
legitimately bursts many sequential requests after reconnecting).

The check fails open: if it throws for any reason (a DB hiccup, a
connection blip), the request is logged and allowed through rather than
blocked. This is a deliberate exception to this document's general
fail-closed bias (see line 15 above, on login and password-reset). It is
justified here because this is defense-in-depth, not the app's primary
security boundary the way tenant scoping and the login lockout are; failing
closed would mean a single transient database error takes down every API
route and every Server Action at once. This mirrors the existing stated
"never throws" behavior of audit logging (Pass 4, Milestone C above).

On a blocked request: a JSON `429` for `/api/*` routes, and a `429` with a
`text/plain` body for Server Actions (matched to the exact response shape
Next.js's installed client code needs to surface the message on the thrown
error rather than a generic fallback). Either way, `src/app/app/error.tsx`
catches the resulting error, so the user sees a normal error boundary, not
a crash.

Validated locally: `tsc --noEmit`, lint, and the full test suite (165 files,
1257 tests, including 9 new unit tests against the rate limiter and the
updated `proxy-host-routing` tests) all pass, and `npm run build` succeeds.
The new migration was verified with a schema-only `prisma migrate diff`
run (no live database available in this sandbox); it still needs CI's
real-Postgres `integration` job to confirm it applies cleanly, and the
exact `Content-Type: text/plain` behavior is worth a quick post-deploy
sanity check in case an intermediate layer appends a charset (the fallback
in that case is still just a less specific message inside the same error
boundary, not a failure).

### 2026-09-05 Fleet maintenance-request scoping: vehicle reassignment leaked a predecessor driver's report

User report: a different driver could see another driver's reported
maintenance issue in their own workspace. Root cause: every place that
surfaces a driver's maintenance history scoped by *vehicle*
(`FleetVehicle.assignedDriverId`), never by *requester*
(`FleetMaintenanceRequest.requestedById`). Since a vehicle's driver
assignment is reassignable, whoever a vehicle was handed to next inherited
every maintenance request ever filed against it, including a predecessor's
fault description, requester identity, and uploaded photos. Three
independently reachable surfaces of the same defect, all fixed:

- `getFleetDriverWorkspace()` (`src/modules/fleet/service.ts`) - the query
  backing the driver-portal's "My reports"/"Maintenance activity" sections
  and the offline sync work-pack route now filters
  `maintenanceRequests: { where: { requestedById: userId } }`, instead of
  every request ever filed on the driver's currently assigned vehicle(s).
- `listFleetMaintenanceRequests()` gained an optional `requestedById`
  parameter. The shared `/app/fleet/maintenance` page (reachable by
  managers, owners, and drivers alike) now passes the current user's id when
  the viewer holds only `FLEET_DRIVER_SELF_SERVICE` (no manage/owner
  permission) - a driver-only viewer's "Reported by" column can no longer
  show a stranger's name. Managers and owners are unaffected: they still see
  every requester's requests within their scope, since real oversight is the
  point of their role.
- `getFleetMaintenanceAttachment()` no longer grants access via "currently
  drives this vehicle" (`vehicle.assignedDriver.userId`); it checks the
  request's actual `requestedById` instead, alongside the existing
  vehicle-owner and assigned-mechanic grants. A reassigned driver can no
  longer open a predecessor's uploaded photo via the attachment route.

A second, related complaint - a newly invited driver seeing every vehicle in
the "Report an issue" dropdown, not just their own - was investigated
thoroughly (both the driver-portal and shared-maintenance-page dropdowns,
the seeded Driver role's permission grants, `hasPermission()`'s fail-closed
behavior, and every `listFleetVehicles`/`listFleetActorVehicles` call site)
and does not reproduce against current `main`: every path is already
correctly scoped to `assignedDriver: { userId }`, confirmed by a passing
real-Postgres integration test
(`test/integration/tenant-isolation/fleet-driver-sales.test.ts`). No app
feature can grant a Driver role broader permissions than the seeded
`[DASHBOARD_VIEW, FLEET_DRIVER_SELF_SERVICE, AI_ASSISTANT_USE]` set
(`prisma/seed-data.ts`) short of a direct database edit. If this recurs,
the next report should include which specific organization and driver
account saw it, so the affected role's actual stored permissions can be
inspected directly.

**2026-09-05, re-checked a second time** after the report recurred. Re-read
`getFleetDriverWorkspace()`, `canUserReportFleetVehicle()`, and
`listFleetActorVehicles()` against the code actually on `main` today (post
the reassignment-leak fix above): the driver-portal's "Report an issue"
dropdown builds its options solely from `driver.assignedVehicles`
(`src/app/app/fleet/driver-portal/page.tsx`), and the shared
`/app/fleet/maintenance` page's dropdown builds its options from
`listFleetActorVehicles(..., { driver: canDriverSubmit, owner: ... })`
(`src/app/app/fleet/maintenance/page.tsx`) - both trace back to
`assignedDriver: { userId }` with no other path in. `FleetVehicle` also
carries a partial unique index on `(organizationId, assignedDriverId)`, so a
driver can be the current assignee of at most one vehicle at the database
level - "every vehicle" cannot come from a legitimate multi-assignment
either. Separately confirmed the Driver role's permission grants can't be
the cause here: the retroactive `FLEET_VIEW` removal in `seedPlatform()`
(`prisma/seed-data.ts`, commit `edbc84e`, 2026-08-31) re-runs on every
production build (`scripts/vercel-build.mjs` runs `prisma/seed.ts` before
`next build` when `VERCEL_ENV=production`), so it was already live in
production before this report came in - it isn't an unapplied fix. Also
pulled the last 7 days of production runtime errors for
`/app/fleet/driver-portal`, `/app/fleet/maintenance`, and `/app/fleet/drivers`
via Vercel: the only errors on file are two `completionVerified` column
P2022 errors from 2026-07-26 and 2026-08-30, both against a stale prior
deployment (`dpl_7J5pZqAKgDRx5rdfHCy8Fo2ed1Sz`) whose migration lag was
already superseded by later deploys - nothing recent, nothing on the
current deployment. Still does not reproduce. The ask from the first
investigation stands: a recurrence report needs the specific organization
and driver account, since the code path itself has no gap left to find by
static review alone.

Validated: `tsc --noEmit`, lint, and the full test suite pass, including new
unit tests for the query-shape fix in all three functions and a new
real-Postgres integration test reproducing the exact reassignment scenario
end to end (`test/integration/tenant-isolation/fleet-driver-sales.test.ts`) -
not yet run against real Postgres in this sandbox (no `TEST_DATABASE_URL`
available); it will run for real in CI's `integration` job.

### 2026-09-05 Dashboard revenue-insights leak: any non-admin role saw organization-wide posted revenue

User report: a Teacher could see "the organization overview," which should
be restricted to the Organization Owner or Administrator. Root cause:
`/app/dashboard`'s Revenue insights card (`getRevenueInsights()`, summing
every module's posted revenue) was gated only on whether Accounting was
active for the organization, never on the viewer's own role - the exact
same class of bug as the earlier "Dashboard / module permission leak" fix
above, but for a widget that fix never covered since it isn't a per-module
widget. The three narrow Fleet roles (Driver, Mechanic, Vehicle Owner)
already redirect away from this page entirely before reaching that card,
since each has its own dedicated workspace to land on instead - but no
equivalent workspace exists for a Teacher, Nurse, Cashier, or any other
narrow operational role in a non-Fleet module, so they all fell through to
this same unscoped card. `isOrganizationAdminRole()`
(`src/lib/auth/permissions.ts`) already existed for exactly this class of
check and had zero call sites anywhere in the codebase before this fix.

Fix: added a sibling `isOrganizationOwnerRole()` helper (identical
name+system-role gating), and the dashboard now only fetches
`getRevenueInsights()` when `isOrganizationOwnerRole(tenant) ||
isOrganizationAdminRole(tenant)` - never fetched, never rendered, for
anyone else. This is a "fetch never happens" fix rather than a "hide the
card" fix, so there's no risk of the data reaching the client and only
being hidden by CSS.

Validated: `tsc --noEmit`, lint, and the full test suite pass, including a
new regression test asserting the conditional gate exists in the page
source.

### 2026-09-05 Button loading feedback: submit buttons gave zero visual feedback while pending

User report: clicking a button that's submitting shows no loading
indication at all, inviting repeated clicks - a real double-submission risk,
not just a polish gap. Audit found only 5 files in the whole codebase used
`useFormStatus`/`useTransition` for this, against 228 files importing the
shared `Button` component and 113 files with a raw `<Button
type="submit">` - 106 of those had no pending handling whatsoever. Fixed
centrally in `Button` itself (`src/components/ui/button.tsx`) rather than
per call site: see `docs/DESIGN_SYSTEM.md`'s Component conventions section
for the exact mechanism (auto-detected via `useFormStatus()`, never
double-applied to a caller already managing its own `disabled`/pending UI).
`EntityDialog` (`src/components/forms/entity-dialog.tsx`, ~80+ callers
across every module) dropped its own bespoke implementation of the same
thing in favor of this, so its callers keep working unchanged while gaining
the same behavior from one place.

Validated: `tsc --noEmit`, lint, and the full test suite pass, plus manual
verification against the real dev server with a throwaway probe route
(deleted before finishing) and Playwright - confirmed a plain, previously
unhandled `<Button type="submit">` now auto-disables, sets `aria-busy`, and
shows a spinner with a fallback `aria-label="Loading"` the instant a slow
Server Action starts, and confirmed the pre-existing custom-pending login
button (which passes its own `disabled`) is completely unaffected.

---

## Billing / Subscriptions

Implemented after the original hardening scope was written: public
module/demo acquisition, operator-led onboarding, manual/offline and
platform-managed subscription records, payment confirmation, time-bounded
module activation, cancellation, notifications, and audit logging. See
`docs/BILLING_AND_SUBSCRIPTIONS.md`. Paystack and Flutterwave hosted checkout,
callbacks, signed/authenticated webhook routes, server-side amount/currency
verification, and idempotent activation are implemented. Real provider-sandbox
round trips remain the required external verification step.
