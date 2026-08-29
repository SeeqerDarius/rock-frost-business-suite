# Fleet & Asset Management System Implementation

## Online driver collections

Drivers can start Paystack checkout for their own configured daily or weekly remittance and active Work & Pay obligations when the organization has an active Settlement Account. Amount, currency, assignment, contract, organization, and beneficiary are re-derived on the server. Paystack confirmation automatically verifies the Fleet submission and posts confirmed revenue through Accounting. Existing manual payment recording remains available.

## Architecture

The Fleet module is implemented as a tenant-scoped module in Rock Frost Business Suite. All records remain in the shared PostgreSQL database and carry `organizationId`; service functions verify organization ownership before reading or mutating records.

The responsive Next.js web application is the system of record. Its server-action/service boundaries can later support native Android and iOS clients through authenticated route handlers without changing the domain model.

## Driver Workspace redesign (shipped, 2026-08-29)

A complete UX/IA redesign of the Driver Workspace and manager Drivers roster, shipped phase by phase (see `docs/DECISIONS.md`'s 2026-08-29 entries for the due-date/overdue derivation, KPI-interpretation, and `existedYet` decisions this depends on). **Phase 1 (backend foundations)** shipped `src/modules/fleet/driver-obligations.ts` (`computeObligationSummary`/`getFleetDriverObligations`), the accessible `Progress` primitive, and `sr-only` chart data tables.

**Phase 2 (Driver Workspace IA rebuild) has now shipped.** `src/app/app/fleet/driver-portal/page.tsx` is a single `Tabs` component with exactly six sections, replacing the prior always-visible-Overview-plus-two-tabs layout:

- **Overview** (default tab): an "overdue balance" / "payment due" / "fully paid up" banner with one primary action, then an 8-tile `OverviewMetricCard` grid - due now, paid this period, pending verification, overdue, outstanding balance (due now + overdue, combined), Work & Pay remaining, Work & Pay completion %, open maintenance. Every tile links to the tab where its detail lives.
- **Payments**: one `ObligationCard` per vehicle remittance and per Work & Pay contract, showing the exact obligation, current period, due date, paid-so-far, and remaining balance *before* any payment control - a prominent server-derived "Pay X securely" button when online collections are active (disabled per-obligation, not globally, while that specific obligation already has a payment awaiting Paystack confirmation - see `listPendingOperationalPaymentsForPayer` in `src/lib/payments/operational.ts`), and a clearly secondary "record a payment made outside the app" section below it.
- **Work & Pay**: one dedicated card per contract - value, paid, remaining, completion % (the new `Progress` component), instalment, frequency, next due date (from the Phase 1 obligation layer), status, and its own instalment history. Never merged with vehicle remittance figures.
- **Vehicle**: a read-only operational card per assigned vehicle (registration, make/model, mileage, remittance schedule, current obligation, open maintenance count and latest status) - no manager-only edit/reassign controls.
- **Maintenance**: unchanged report-and-track flow from the prior iteration.
- **Activity**: the revenue trend chart, a unified payment-activity list (with a "View receipt" link into the enhanced Paystack callback page for confirmed online payments), and a maintenance-activity list.

Duplicate-click prevention is a shared `PaySubmitButton` (`src/app/app/fleet/driver-portal/submit-button.tsx`) used by every payment form on the page - disables itself via `useFormStatus` the instant a submission starts, and separately via a shared `useIsOffline()` hook (`offline-banner.tsx`) whenever the browser reports no network connection. The offline state is detection-and-explanation only, deliberately not a queue-and-replay system like POS's offline sales queue - see `docs/DECISIONS.md` for why. `src/app/app/fleet/driver-portal/loading.tsx` is the app's first real use of the previously-unused `Skeleton` primitive, shaped to match the Overview tab so the loading state doesn't reflow once real data arrives. The Paystack callback/receipt page (`payment/callback/page.tsx`) now shows vehicle, purpose, period, and date alongside the amount/reference/status it already had.

**Phase 3 (manager Drivers roster redesign) has now shipped.** `src/app/app/fleet/drivers/page.tsx`'s roster is no longer just name/licence/phone/status/login - it now shows, per driver, their assigned vehicle(s), a payment-readiness badge (up to date / due / overdue / no obligation, from a new `getFleetDriverRosterSummary()` in `src/modules/fleet/driver-obligations.ts`), current obligation with any overdue amount called out separately, a pending-submissions count linking straight to the verification queue (`/app/fleet/payments`), Work & Pay completion %, and an open-maintenance badge. Two of the summary stat tiles ("Overdue," "Pending verification") are themselves links into a pre-filtered view or the verification queue - a manager can spot who needs attention without opening a single profile. A `<form method="GET">` filter bar (search by name/plate, payment readiness, status, maintenance-attention - the same GET-form pattern already used by School's attendance roster, not a new client-side filtering mechanism) narrows the table in place. The table's secondary columns (current obligation, pending, Work & Pay, maintenance, login) collapse progressively below `md`/`lg`/`xl` breakpoints rather than forcing horizontal scroll for the whole table - confirmed live at 375px width: name, vehicle, and readiness stay visible immediately, everything else is one scroll away.

**Phase 4 (trend visualizations) has now shipped.** Each `ObligationCard` in the Payments tab (used for both vehicle remittance and Work & Pay instalments) now shows an on-time-rate stat line and a collapsed-by-default "Due vs. paid history" chart built directly from that obligation's own `summary.periods` - no new data fetch, reusing what Phase 1 already computed. Each contract's card in the Work & Pay tab separately shows its own on-time-rate line and a "Balance remaining over time" chart, reconstructed by walking the contract's current stored `outstandingBalance` backward through each trailing period's `approvedAmount` (there is no stored balance history to read directly - see `buildBalanceHistory` in `driver-portal/page.tsx`). Both charts reuse the existing accessible `TrendAreaChart`, so they inherit its `sr-only` data table for free. On-time rate is deliberately a stat line, not a chart, per the plan - a single trailing rate isn't a time series worth charting.

A correctness fix went into `driver-obligations.ts` alongside this: `ObligationPeriod` gained an `existedYet` field, because the existing `existsSince` guard only suppressed *overdue*/*on-time* flags for periods before a vehicle or contract existed, not the period's `expectedAmount` itself - a brand-new assignment would otherwise show a flat "due GHS X" line stretching back before the vehicle was ever assigned. Both new charts filter periods on `existedYet` before charting, and are skipped entirely (no chart, no misleading single data point) when fewer than two real periods remain - confirmed live via a temporary scratch route covering a normal mixed-history obligation, a Work & Pay contract with five weekly instalments, and a same-day-assigned vehicle with no history yet.

**All five phases are now complete.** Against the original redesign brief's acceptance criteria: a driver's assignment, obligation, progress, and next action are all visible on the Overview tab without digging; a normal payment is a single obligation-scoped "Pay securely" click with duplicate-submission protection and clear pending/confirmed/failed feedback; vehicle remittance and Work & Pay are never mixed (separate tabs, separate totals, separate trend charts); every KPI reads from `getFleetDriverObligations`/`getFleetDriverRosterSummary`, so it is driver-scoped and derived, not org-wide or hand-copied; trend charts answer real questions (am I keeping up, is my balance shrinking) rather than decorating the page, and are skipped rather than shown empty or misleading when there isn't enough real history yet; the manager roster surfaces who needs attention (readiness badge, overdue amount, pending count, maintenance flag) without opening every profile; the existing payment/webhook/idempotency/accounting-posting invariants were read and preserved, never re-implemented; and empty, loading, offline, and no-assignment states are each intentionally designed rather than left to fall through to a blank screen or a raw error. The one disclosed, unresolved gap across all five phases: no authenticated Driver-role or Fleet-Manager-role test-tenant credentials exist in this environment, so every phase was verified via a temporary fabricated-data scratch route plus production health/redirect checks, never a live signed-in click-through - see `OPERATOR_HANDOFF.md`'s Phase 1-4 entries for the specifics of what each phase's browser verification did and did not cover.

## Delivered capabilities

- Fleet overview dashboard with vehicles, drivers, owners, maintenance, document expiry, pending remittances, weekly and monthly verified revenue, outstanding Work & Pay balances, and recent payments
- Vehicle-owner management with optional portal-login linkage, vehicle totals, verified revenue, and append-only ownership history
- Vehicle and asset registry
- Driver registry and vehicle assignment
- Insurance and roadworthy certificate tracking
- Expiry and renewal status calculation
- In-app renewal reminders for insurance and roadworthy documents approaching
  expiry, with duplicate-notification protection
- Maintenance request workflow with optional signature-validated fault photos
- Work & Pay agreements with daily or weekly payment schedules
- Daily and weekly vehicle remittances, Work & Pay instalments, owner payouts, driver payments, and maintenance payments
- Management reports
- Investor dashboard
- A dedicated Vehicle Owner role limited to the linked owner portfolio and owner approvals
- A driver-only workspace limited to assigned vehicles, assigned contracts, maintenance tasks, and the driver's own payment records
- A task-oriented driver workspace with assignment, pending-verification, and open-maintenance summaries; readable obligation cards; explicit payment evidence guidance; pending submit feedback; and touch-friendly controls
- Permission-controlled navigation and server-side authorization
- In-app maintenance completion notifications
- Audit events and shared platform audit logging
- Vehicle Make/Model entry uses a searchable reference list covering major global manufacturers and major Chinese manufacturers, with the make's real emblem shown for ~30 common Western/Japanese/Korean makes (`@cardog-icons/react`, MIT-licensed SVG redraws) and a colored initials badge fallback for everything else - most Chinese manufacturers included, since no comparably-licensed real-logo source was found for them; an "Other" free-text fallback covers anything not listed at all
- Driver and Vehicle Owner invite-by-email, reusing the platform's existing invitation/acceptance lifecycle so the roster entry links and the person's status becomes active automatically once they accept
- Reports gets a vehicles-by-status donut chart and a verified-payments revenue trend chart (day/week/month switcher); the Investor dashboard gets a collections trend chart scoped to whichever owner portfolio is visible; the Driver Workspace gets its own "My revenue" trend, scoped to that driver's own vehicle remittances and Work & Pay contract only
- The Driver Workspace has a clearly labeled "Overview" section - status tiles, assigned vehicle(s) with balance and what's left to pay, and the "My revenue" trend - covering everything the driver needs to *see* on login, followed by two action-only tabs, "Record a completed payment" (online-pay buttons, the manual payment form, payment history) and "Maintenance" (report an issue and the driver's own report history), covering everything they need to *do*. The revenue trend originally shipped inside the payment tab; moved to Overview after direct user feedback ("why is the revenue trend showing below the tabs... design a proper dashboard") - insight to view and actions to take are now kept in visually distinct zones instead of mixed together
- In-app notifications for the driver's own payment and maintenance activity: a payment they submit, a payment approved or rejected, a maintenance report submitted, reviewed, or completed. These are separate from the organization-wide notifications (document renewal, etc.) other Fleet roles see

## Maintenance workflow

The workflow is enforced as a state machine:

1. A driver or permitted fleet user submits a request.
2. A Fleet Manager approves or rejects the request.
3. If owner approval is required, only the login linked to the vehicle owner can approve or reject it.
4. A Fleet Manager assigns a mechanic or workshop.
5. Repair starts and the vehicle moves to `MAINTENANCE`.
6. Repair completion records cost and completion notes.
7. A Fleet Manager verifies completion.
8. The vehicle returns to `ASSIGNED` or `AVAILABLE`, the owner receives a notification, and the notification time is retained.

Every step writes an immutable `FleetMaintenanceEvent` containing actor, event type, status transition, note and timestamp.

## Financial behavior

- New Work & Pay agreements calculate amount paid, outstanding balance and completion percentage from the contract value and deposit.
- A new Work & Pay agreement can be created only for a vehicle with an active assigned driver. The server selects that driver as the client, stores the driver relationship and a historical name snapshot, and ignores any attempt to supply a different client name. The contract selector shows the assigned driver beside each eligible vehicle.
- Driver self-service accepts a Work & Pay remittance only when both the vehicle and the contract are linked to the authenticated driver. Reassigning a vehicle therefore does not give the new driver access to the previous driver's contract.
- Deposits are written to the central Fleet payment ledger.
- A vehicle can be configured with no required remittance, a daily remittance amount, or a weekly remittance amount. Work & Pay remains controlled by its own daily or weekly contract schedule.
- The driver first pays the company outside the application by cash, mobile money, bank transfer, card, cheque, or another supported method. The driver then records the completed payment for manager verification. The application does not claim that initiating the form itself transfers money.
- Non-cash payment records require a transaction reference. Cash may use an optional receipt reference. The server validates the supported method and evidence rule rather than relying on the form alone.
- Driver records preserve the assigned vehicle, obligation type, payment period, required amount, actual amount, method, reference, and variance.
- A pending or approved remittance cannot be recorded twice for the same driver, vehicle, type, and period. Weekly periods are normalized to Monday through Sunday on the server, so choosing another day in the same week cannot bypass duplicate protection.
- Completed-payment and obligation dates must be today or earlier. This is enforced by the service layer as well as the form.
- Approved daily and weekly driver submissions become verified `WEEKLY_SALES` ledger entries related to the assigned vehicle. The type name is retained for backward compatibility while submission metadata preserves whether the period was daily or weekly.
- Approved Work & Pay submissions become verified `WORK_AND_PAY` entries and atomically update amount paid, outstanding balance, completion percentage, and contract completion status.
- A Fleet Manager can also record a payment received directly by the office, including payment date, method, and reference. This path writes a verified ledger entry because the authorized manager is confirming receipt at entry time.
- Management reporting includes weekly remittances, verified payments, pending payments, documents due and repairs awaiting verification.
- Manager approval and rejection are explicit submit actions. While a review is being processed, the chosen control is disabled and shows progress. A successful approval creates the verified Fleet payment and marks the driver submission approved in the same database transaction. The tenant audit event is attempted inside that transaction and commits with it when written. The page then confirms the outcome. Repeated or failed reviews return a visible error instead of appearing to do nothing.
- Investor reporting shows each owner's vehicles, active agreements, contract value, remittances, outstanding balance, maintenance cost and net cash position.

## Access control

- Page navigation is filtered by Fleet permissions.
- Server Components and Server Actions independently verify permissions.
- The Driver system role does not hold `fleet.view`. It uses `fleet.driver.self_service`, so it cannot open organization-wide vehicles, drivers, owners, payments, reports, settings, or summary dashboards.
- The Driver Workspace shows only the current driver's assigned vehicles, open maintenance work, active contracts, targets, and submissions; the main workspace dashboard redirects the Driver role there instead of rendering its own (organization-wide) content.
- Work & Pay contracts shown inside the Driver Workspace are filtered by the stored contract driver, not only by the vehicle's current assignment.
- The exact system Driver role sees only Overview and Notifications in the workspace sidebar. The organization module catalogue, cross-module Reports page, and header module launcher are hidden, and direct requests to the two organization-wide pages return the driver to the assignment-scoped dashboard. Custom roles are not restricted by name alone. The sidebar's "Modules" link is gated by the same `isFleetDriverRole` check as "Reports" - both used to be a single unconditional `items.splice`/`items.push` pair with only "Reports" actually excluded, so a Driver saw a "Modules" link that always redirected them straight back to Overview, a dead click rather than a real destination.
- `/app/dashboard` (the main workspace "Overview" page) redirects the Driver role to the Driver Workspace instead of rendering, matching the redirect already used by `/app/fleet`, `/app/modules`, and `/app/reports`. It previously rendered every organization's full revenue-insights trend and per-module breakdown to any signed-in tenant member with no role check at all, so a Driver landing on Overview saw the organization's aggregate revenue, not just their own.
- The floating workspace-status badge ("Subscribed workspace" / "Trial workspace" / "Subscription inactive") is hidden for the Driver role - it communicates organization-level billing status a Driver has no reason to see or act on.
- The Driver Workspace itself shows a "My revenue" card driven by `getFleetDriverTrends()`: the driver's own vehicle-remittance trend, and, only when they hold an active Work & Pay contract, a separate contract-payment trend in its own tab. The two are kept apart rather than summed, since a vehicle remittance and a Work & Pay instalment are different obligations on different schedules. Each active contract also shows a pay-down progress bar driven by its stored `completionPercentage`, alongside the remaining balance in plain "left to pay" language.
- `/app/notifications` scopes what a Driver sees: every other role sees their own notifications plus organization-wide broadcasts (`userId: null` rows, e.g. a document-renewal reminder); a Driver sees only rows addressed to them, since an org-wide broadcast is never theirs to act on.
- Maintenance lists and vehicle selectors are filtered on the server to assigned driver vehicles or linked owner vehicles for self-service users. Hiding a menu item is never the privacy boundary.
- The Vehicle Owner system role is available only when Fleet is active. Assigning or accepting that role creates one linked `FleetOwner` profile idempotently.
- Investors require `fleet.investor.view`.
- Owner maintenance approval additionally requires the current user to be linked to the owner of the affected vehicle.
- Maintenance management actions require `fleet.maintenance.manage`.
- Unauthorized vehicle maintenance submissions fail closed.
- The Drivers page's login dropdown and the Owners page's portal-login dropdown are each scoped to the people who can actually hold that login (driver: `fleet.driver.self_service`; owner: the `Vehicle Owner` role), not every active organization member. Previously both dropdowns listed every active member, so unrelated people (including, for example, the Organization Owner) could be selected.
- A workspace login can belong to only one driver profile per organization. The roster hides logins already linked elsewhere and the service rejects conflicting create or update requests.
- Inviting a driver or owner from the Fleet pages reuses the platform's `Role`/`OrganizationMember`/`Invitation` lifecycle at the fixed "Driver" or "Vehicle Owner" role, gated on Fleet's own `fleet.drivers.manage`/`fleet.owners.manage` permission rather than Administration's `organization.settings.manage` - a Fleet manager without full Administration access can still invite. `ensureFleetDriverForUser`/`ensureFleetOwnerForUser` now also link to a pre-existing roster row added manually by name/email (`userId` still null) instead of creating a duplicate when that same email is later invited or accepts.

## Organization as a vehicle owner

A company can own a vehicle directly, not only through an individual owner. `FleetOwner.isOrganizationOwner` (migration `20260828063600_fleet_owner_organization_flag`) marks the one lazily-provisioned FleetOwner row per organization that represents the organization itself - `ensureOrganizationFleetOwner()` (`src/modules/fleet/service.ts`) creates it on first read and keeps its name in sync with the organization's own name on every later read, so a rename never needs a manual fix. It appears in the Owners list (badged "Organization") and in the Vehicles form's owner dropdown (suffixed "(Organization)") exactly like any other owner, and can be assigned to a vehicle the same way.

## Known gap: mechanic self-service (part of the maintenance workflow)

The maintenance state machine already covers driver report, Fleet Manager review, owner approval when required, and manager-driven mechanic assignment/repair/completion/verification (see "Maintenance workflow" above). What is missing is a mechanic acting as their own logged-in actor: today `FleetMaintenanceRequest.mechanicAssigned` is a free-text name a manager types in, not a linked `User`, so a mechanic cannot log in, see requests assigned to them, accept one, or record a scheduled repair date themselves. Building that properly needs a schema change (a `User`-linked mechanic field and a scheduled-date field, plus a new role and a self-service view mirroring the existing Driver Workspace pattern), so it carries the same disposable-test-database blocker described above and was not started this round.

## HR integration

When Human Resources & Payroll is enabled, an active internal organization member is also represented by one linked `HrEmployee` record. The integration runs when an invitation is accepted, an active member's role changes, a suspended member is reactivated, HR is enabled for an existing organization, or the HR employee register performs its compatibility backfill.

The synchronization is tenant-scoped, transaction-safe, idempotent, and protected by a PostgreSQL advisory lock. It creates only a missing employee and never overwrites job, department, manager, payroll, or other details already maintained by HR. `Vehicle Owner` and `Investor` are external stakeholder roles and are deliberately excluded. Automatic creation writes employee status history and a tenant audit event.

## Maintenance photos

Drivers and other authorized reporters may attach one optional JPEG, PNG, or WebP image up to 1 MB. The upload validates both MIME type and file signature, stores a bounded data URL in the existing tenant-owned `FileAsset` record, and serves it only through an authenticated Fleet route. Driver and Vehicle Owner access to that route is checked against the request vehicle assignment or ownership.

This uses the same bounded database image pattern already established for Inventory and School. No public asset URL or undeclared object-storage dependency is introduced. A later object-storage migration can replace persistence without changing the authorization or workflow contract.

## Owner and vehicle history

Every owner assignment change writes a `FleetVehicleOwnershipHistory` record with the previous owner, new owner, actor, and timestamp. History is not overwritten when a vehicle changes hands. Manager vehicle and owner views expose the current portfolio, ownership trail, vehicle count, and verified revenue.

## Production release checks

- Prisma schema validation and client generation
- TypeScript type check
- Migration deployment
- Production Next.js build
- Authenticated-route response verification
- Production runtime error review
