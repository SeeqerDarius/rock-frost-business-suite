# Fleet & Asset Management System Implementation

## Architecture

The Fleet module is implemented as a tenant-scoped module in Rock Frost Business Suite. All records remain in the shared PostgreSQL database and carry `organizationId`; service functions verify organization ownership before reading or mutating records.

The responsive Next.js web application is the system of record. Its server-action/service boundaries can later support native Android and iOS clients through authenticated route handlers without changing the domain model.

## Delivered capabilities

- Fleet overview dashboard with vehicles, drivers, owners, maintenance, document expiry, pending collections, weekly and monthly verified revenue, outstanding Work & Pay balances, and recent payments
- Vehicle-owner management with optional portal-login linkage, vehicle totals, verified revenue, and append-only ownership history
- Vehicle and asset registry
- Driver registry and vehicle assignment
- Insurance and roadworthy certificate tracking
- Expiry and renewal status calculation
- In-app renewal reminders for insurance and roadworthy documents approaching
  expiry, with duplicate-notification protection
- Maintenance request workflow with optional signature-validated fault photos
- Work & Pay agreements
- Weekly sales, Work & Pay, owner, driver and maintenance payments
- Management reports
- Investor dashboard
- A dedicated Vehicle Owner role limited to the linked owner portfolio and owner approvals
- A driver-only workspace limited to assigned vehicles, assigned contracts, maintenance tasks, and the driver's own collections
- Permission-controlled navigation and server-side authorization
- In-app maintenance completion notifications
- Audit events and shared platform audit logging

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
- Deposits are written to the central Fleet payment ledger.
- Every later Work & Pay payment atomically updates the contract and writes a verified ledger transaction.
- A vehicle can be configured with no normal sales target, a daily target, or a weekly target. Work & Pay remains controlled by its contract rather than the vehicle target.
- Driver submissions preserve the assigned vehicle, collection type, sales period, expected amount, actual amount, and variance.
- A pending or approved collection cannot be submitted twice for the same driver, vehicle, type, and period.
- Approved daily and weekly driver submissions become verified `WEEKLY_SALES` ledger entries related to the assigned vehicle. The type name is retained for backward compatibility while submission metadata preserves whether the period was daily or weekly.
- Approved Work & Pay submissions become verified `WORK_AND_PAY` entries and atomically update amount paid, outstanding balance, completion percentage, and contract completion status.
- Management reporting includes weekly collections, verified collections, pending payments, documents due and repairs awaiting verification.
- Investor reporting shows each owner's vehicles, active agreements, contract value, collections, outstanding balance, maintenance cost and net cash position.

## Access control

- Page navigation is filtered by Fleet permissions.
- Server Components and Server Actions independently verify permissions.
- The Driver system role does not hold `fleet.view`. It uses `fleet.driver.self_service`, so it cannot open organization-wide vehicles, drivers, owners, payments, reports, settings, or summary dashboards.
- The Driver Workspace and the main workspace dashboard show only the current driver's assigned vehicles, open maintenance work, active contracts, targets, and submissions.
- Maintenance lists and vehicle selectors are filtered on the server to assigned driver vehicles or linked owner vehicles for self-service users. Hiding a menu item is never the privacy boundary.
- The Vehicle Owner system role is available only when Fleet is active. Assigning or accepting that role creates one linked `FleetOwner` profile idempotently.
- Investors require `fleet.investor.view`.
- Owner maintenance approval additionally requires the current user to be linked to the owner of the affected vehicle.
- Maintenance management actions require `fleet.maintenance.manage`.
- Unauthorized vehicle maintenance submissions fail closed.

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
