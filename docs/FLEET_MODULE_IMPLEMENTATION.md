# Fleet & Asset Management System Implementation

## Architecture

The Fleet module is implemented as a tenant-scoped module in Rock Frost Business Suite. All records remain in the shared PostgreSQL database and carry `organizationId`; service functions verify organization ownership before reading or mutating records.

The responsive Next.js web application is the system of record. Its server-action/service boundaries can later support native Android and iOS clients through authenticated route handlers without changing the domain model.

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
- Permission-controlled navigation and server-side authorization
- In-app maintenance completion notifications
- Audit events and shared platform audit logging
- Vehicle Make/Model entry uses a searchable reference list covering major global manufacturers and major Chinese manufacturers, with a colored initials badge next to the selected make and an "Other" free-text fallback for anything not listed
- Driver and Vehicle Owner invite-by-email, reusing the platform's existing invitation/acceptance lifecycle so the roster entry links and the person's status becomes active automatically once they accept
- Reports gets a vehicles-by-status donut chart and a verified-payments revenue trend chart (day/week/month switcher); the Investor dashboard gets a collections trend chart scoped to whichever owner portfolio is visible

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
- A pending or approved remittance cannot be recorded twice for the same driver, vehicle, type, and period.
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
- The Driver Workspace and the main workspace dashboard show only the current driver's assigned vehicles, open maintenance work, active contracts, targets, and submissions.
- Work & Pay contracts shown inside the Driver Workspace are filtered by the stored contract driver, not only by the vehicle's current assignment.
- The exact system Driver role sees only Overview and Notifications in the workspace sidebar. The organization module catalogue, cross-module Reports page, and header module launcher are hidden, and direct requests to the two organization-wide pages return the driver to the assignment-scoped dashboard. Custom roles are not restricted by name alone.
- Maintenance lists and vehicle selectors are filtered on the server to assigned driver vehicles or linked owner vehicles for self-service users. Hiding a menu item is never the privacy boundary.
- The Vehicle Owner system role is available only when Fleet is active. Assigning or accepting that role creates one linked `FleetOwner` profile idempotently.
- Investors require `fleet.investor.view`.
- Owner maintenance approval additionally requires the current user to be linked to the owner of the affected vehicle.
- Maintenance management actions require `fleet.maintenance.manage`.
- Unauthorized vehicle maintenance submissions fail closed.
- The Drivers page's login dropdown and the Owners page's portal-login dropdown are each scoped to the people who can actually hold that login (driver: `fleet.driver.self_service`; owner: the `Vehicle Owner` role), not every active organization member. Previously both dropdowns listed every active member, so unrelated people (including, for example, the Organization Owner) could be selected.
- Inviting a driver or owner from the Fleet pages reuses the platform's `Role`/`OrganizationMember`/`Invitation` lifecycle at the fixed "Driver" or "Vehicle Owner" role, gated on Fleet's own `fleet.drivers.manage`/`fleet.owners.manage` permission rather than Administration's `organization.settings.manage` - a Fleet manager without full Administration access can still invite. `ensureFleetDriverForUser`/`ensureFleetOwnerForUser` now also link to a pre-existing roster row added manually by name/email (`userId` still null) instead of creating a duplicate when that same email is later invited or accepts.

## Known gap: organization as a vehicle owner

A company can own a vehicle directly, not only through an individual owner. The design for this (a `FleetOwner.isOrganizationOwner` flag, lazily provisioned per organization) is not yet implemented: it requires a schema migration, and this repository's release rule requires a schema-migration phase's integration suite to pass against the disposable test database (`TEST_DATABASE_URL`, `docs/TESTING_STRATEGY.md`) before it ships. That database's stored credentials are currently rejecting authentication (verified directly against both the test and production connection strings - production authenticates, the test branch does not), which is an external blocker, not a code issue. Once the test branch's credentials are refreshed, this is a small, well-scoped follow-up.

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
