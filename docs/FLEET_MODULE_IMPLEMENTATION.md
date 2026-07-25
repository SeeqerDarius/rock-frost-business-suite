# Fleet & Asset Management System Implementation

## Architecture

The Fleet module is implemented as a tenant-scoped module in Rock Frost Business Suite. All records remain in the shared PostgreSQL database and carry `organizationId`; service functions verify organization ownership before reading or mutating records.

The responsive Next.js web application is the system of record. Its server-action/service boundaries can later support native Android and iOS clients through authenticated route handlers without changing the domain model.

## Delivered capabilities

- Fleet overview dashboard
- Vehicle-owner management with optional portal-login linkage
- Vehicle and asset registry
- Driver registry and vehicle assignment
- Insurance and roadworthy certificate tracking
- Expiry and renewal status calculation
- Maintenance request workflow
- Work & Pay agreements
- Weekly sales, Work & Pay, owner, driver and maintenance payments
- Management reports
- Investor dashboard
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
- `WEEKLY_SALES` is a dedicated Fleet payment type.
- Management reporting includes weekly collections, verified collections, pending payments, documents due and repairs awaiting verification.
- Investor reporting shows each owner's vehicles, active agreements, contract value, collections, outstanding balance, maintenance cost and net cash position.

## Access control

- Page navigation is filtered by Fleet permissions.
- Server Components and Server Actions independently verify permissions.
- Investors require `fleet.investor.view`.
- Owner maintenance approval additionally requires the current user to be linked to the owner of the affected vehicle.
- Maintenance management actions require `fleet.maintenance.manage`.
- Unauthorized vehicle maintenance submissions fail closed.

## Production release checks

- Prisma schema validation and client generation
- TypeScript type check
- Migration deployment
- Production Next.js build
- Authenticated-route response verification
- Production runtime error review
