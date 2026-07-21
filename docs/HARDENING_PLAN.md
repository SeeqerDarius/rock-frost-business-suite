# Production Hardening Plan

Tracks the remediation of the blockers identified in the 2026-07-20 full-project
audit. This is a multi-pass effort — see `OPERATOR_HANDOFF.md` for which pass is
currently active. Findings below were independently re-verified against the live
codebase before being marked "confirmed"; a few audit claims turned out to be
partially inaccurate (noted where relevant) — this file reflects verified reality,
not the audit text verbatim.

**Scope note:** Billing/Subscriptions is not part of this plan. It was never
implemented scope — see the "Billing/Subscriptions" section at the bottom.

## Pass 1 (this pass) — scope

Per explicit instruction, Pass 1 covers exactly:

1. Central active-tenant guard
2. Session revalidation/revocation
3. Dashboard/module permission leak
4. The confirmed highest-risk IDOR paths that don't require the broader
   financial/inventory transaction-atomicity rework (Administration role
   assignment, Projects members/milestones/tasks, Payroll compensation)

Everything else below is scoped for a **future Pass 2+** and is documented here
so that work doesn't need to be rediscovered.

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

## Pass 2 (not started this pass) — remaining confirmed findings

Documented now so this doesn't need rediscovery. **Do not implement in Pass 1.**

### Remaining IDOR paths (confirmed, deferred — overlaps with atomicity rework below)

| Domain | Issue | File |
|---|---|---|
| Procurement | Vendor, request, item, and default warehouse ids not consistently tenant-validated | `src/modules/procurement/service.ts` |
| Accounting | Manual journal lines accept arbitrary account ids | `src/modules/accounting/service.ts` |
| Inventory | Item is tenant-checked; source/destination warehouses are not | `src/modules/inventory/service.ts` |
| POS | Session open accepts a register by bare id | `src/modules/pos/service.ts` |
| CRM, HR, Fleet, Installment | Same unchecked-foreign-id pattern likely present; not yet individually audited line-by-line | various `src/modules/*/service.ts` |

### Financial / inventory transaction integrity (not started)

- POS: negative/zero quantity validation, atomic sale+stock-deduction (single
  transaction), atomic refund (claim-then-return, not return-then-claim),
  duplicate-submission guards, safe receipt numbering.
- Inventory: atomic guarded increment/decrement instead of read-then-write,
  same-warehouse transfer rejection, concurrent-issue oversell prevention.
- Procurement: receiving must commit the inventory receipt and the order
  quantity update together; retries must not duplicate a receipt.
- Accounting: prevent double-posting invoices/payments/expenses, reject
  negative/excessive payments, voiding must post a reversing entry instead of
  only flipping status, posted journals must become immutable, preserve
  `Decimal` precision instead of converting to `Number`.
- Payroll: prevent duplicate run processing / duplicate payslips, reject
  negative salary or deductions.
- Installment: non-positive payment guard, duplicate-payment guard, atomic
  balance updates, Decimal precision, consistent staff-inventory/account
  updates.

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

Pass 1 adds a real Vitest suite (see `test/`) covering exactly the Pass-1
fixes — this is the first committed automated test suite in the project
(previously zero, per `docs/TESTING_STRATEGY.md`). Broader coverage (financial
invariants, concurrent-write tests, full auth-lifecycle tests) is Pass 2+, once
the underlying atomicity/validation fixes exist to test. Reproducible platform
seeding (`.env.example`, committed RBAC/module seed script, CI workflow, Node
version pin) is also Pass 2+.

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
