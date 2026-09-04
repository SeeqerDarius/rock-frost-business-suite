# Hotel and School vertical modules

**Status:** implemented and registered as available. Production availability is
conditional on the migration, validation, preview, and deployment evidence in
`OPERATOR_HANDOFF.md`.

School's original operational release is now followed by an explicit
customer-readiness program. `docs/SCHOOL_CUSTOMER_READINESS.md` is authoritative
for the current delivery tranches and remaining gaps; the release lists below
remain the target product contract and must not be read as a claim that every
S2–S4 capability is already implemented.

This document is the product and architecture contract for the Hotel and
School verticals. It applies the isolation rules in `MODULE_BOUNDARIES.md`:
every owned record carries `organizationId`, every lookup and mutation is
tenant-scoped, and integrations call another module's public service rather
than querying its tables directly.

## Delivery principles

- A module is not registered as `available` until its schema, migration,
  permissions, seed data, route/action guards, tests, docs, and core workflows
  pass together.
- Financial amounts use bounded Prisma `Decimal` columns. Inventory, accounting,
  POS, HR, and payroll integrations are opt-in and documented in `DECISIONS.md`.
- Configuration belongs to one organization and, where operationally relevant,
  one branch/property/campus.
- State transitions are explicit service functions, not arbitrary status edits.
- Destructive operations preserve posted financial and historical academic data.
- Personally identifiable guest, guardian, student, and employee data is never
  exposed across tenants or in public routes.

## Hotel Management

### Release H1 — property operations

- Properties and room types; rooms with out-of-service/maintenance state.
- Guests and contact/identity metadata with duplicate-detection support.
- Reservations, room assignment, availability checks, deposits, cancellation,
  no-show handling, check-in, room moves, and check-out.
- Folios, immutable folio charges, payments, refunds, adjustments, balances,
  receipts, and end-of-day summaries.
- Housekeeping boards, room status, assignments, inspections, and maintenance
  escalation.
- Occupancy, arrivals/departures, revenue, outstanding-balance, and housekeeping
  reports.
  - Property-level taxes, service charges, currencies, numbering, check-in/out,
    settlement, automatic checkout-task timing, and mandatory housekeeping-inspection settings.
    Reservation, folio, receipt, and restaurant-order prefixes are enforced when new records are created.

### Release H2 — food, beverage, and guest services

- Restaurant outlets, menus/modifiers, tables, kitchen tickets, room service,
  order lifecycle, split payments, voids, and shift reconciliation.
- Optional POS integration through the POS service; no direct access to POS
  tables. Optional Inventory calls for ingredient/stock movements.
- Banquets/events, packages, add-ons, guest requests, wake-up calls, lost and
  found, maintenance work orders, and service recovery tracking.

### Release H3 — distribution and commercial operations

- Rate plans, seasonal pricing, restrictions, packages, corporate/travel-agent
  accounts, contracts, commissions, and negotiated rates.
- Channels, property/room/rate mappings, allotments, reservations imported with
  idempotency keys, synchronization attempts, reconciliation, and failure queues.
- Channel adapters remain behind an interface; credentials are encrypted and
  never stored in audit payloads or client-visible configuration.
- Revenue management, pickup/pace, source/channel mix, ADR, RevPAR, cancellation,
  and forecast reports.

### Hotel invariants

- A room cannot have overlapping occupying reservations.
- Check-in requires an assigned available room and an eligible reservation.
- Check-out requires every folio item to be posted and any outstanding balance
  to follow the property's settlement policy.
- Posted folio entries are reversed, never edited or deleted.
- Housekeeping clean/inspected state cannot silently override an out-of-service
  or maintenance room state.

## School Management

### Release S1 — student and academic administration

- Campuses, academic years, terms, departments, programs, grade levels/classes,
  streams/sections, subjects, rooms, and calendars.
- Students, guardians and relationships, admissions, documents, medical notes,
  enrollment, class placement, transfers, withdrawals, promotion, and alumni.
- Attendance sessions, student marks, reasons, corrections, late arrival, and
  daily/term summaries.
- Fee structures, student charges, discounts/scholarships, invoices, payments,
  refunds, allocations, statements, arrears, and receipt numbering.
- Enrollment, attendance, collection, outstanding-fee, and demographic reports.

Student admission and primary-guardian capture are one transaction: staff can
select an existing tenant guardian or create one in the admission form, and no
student is admitted if guardian validation or linking fails. Authorized staff
can edit guardian contact, occupation, and address details from the Guardians
tab without breaking existing student relationships. Name-plus-phone duplicate
checks remain organization-scoped and cross-tenant IDs are rejected.

The School Staff page is the School Administrator's staff directory and
onboarding workspace. It can invite teachers, Admissions Officers, Academic
Heads, Bursars, Librarians, Transport Managers, and other School
Administrators; change an existing School staff member's School role; suspend
or restore access; and show assigned classes. The dedicated
`school.staff.manage` permission belongs to the seeded School Administrator
role. Every write rechecks the permission and organization boundary, allows
only the fixed School role set, enforces subscribed seat limits, writes an
audit event, and synchronizes active members to the shared HR employee record.
The invitation acceptance lifecycle remains responsible for activating new
accounts and creating their HR link, so staff identities are not duplicated.

### Release S2 — teaching, assessment, and communication

- Curriculum/syllabus, subject assignments, teacher allocations, lesson plans,
  homework, learning resources, and completion tracking.
- Timetable periods, constraints, room/teacher/class collision prevention,
  substitutions, and published timetable versions.
- Assessment schemes, exams, papers, grading scales, marks entry/moderation,
  calculated grades, rankings where enabled, report cards, transcripts, and
  promotion decisions.
- Notices, announcements, guardian communication preferences, consent, meetings,
  behavior/discipline, counseling, clubs, houses, and extracurricular activities.

### Release S3 — campus services

- Transport routes, stops, vehicles, drivers/attendants, assignments, trips,
  boarding events, incidents, maintenance references, and transport billing.
- Library catalog, authors/categories, copies, barcodes, loans, renewals,
  reservations, fines, lost/damaged items, and inventory audits.
- Hostel/dormitory buildings, rooms/beds, allocation, roll call, visitors,
  incidents, and boarding charges.
- Clinic visits, allergies, medications, immunizations, emergency contacts, and
  tightly permissioned health records.
- Cafeteria plans, meals, dietary restrictions, consumption, and billing.

### Release S4 — workforce and finance integrations

- School staff profiles reference HR employees rather than duplicating identity
  or employment records.
- Teacher workload and subject/class assignments remain School-owned.
- School payroll calls the Payroll module's public service and adds education-
  specific inputs (period load, allowances, substitutes); it does not create a
  second payroll ledger.
- Optional Accounting posting maps fees, payments, refunds, payroll, transport,
  library fines, and other charges through explicit configurable accounts.

### School invariants

- Only one active enrollment per student per academic period/campus unless an
  explicit dual-enrollment policy is enabled.
- Published attendance and assessment results are corrected through audited
  revisions, not deletion.
- Timetables reject teacher, class, and room collisions.
- A fee payment allocation cannot exceed the payment's unapplied balance or an
  invoice's outstanding balance.
- Academic-year closure requires attendance, assessment, and fee-period checks
  and produces an immutable closure record.

## Permissions and roles

Hotel permissions use the `hotel.*` prefix and School permissions use
`school.*`. Each sensitive area gets separate view/manage verbs; financial,
health, assessment publishing, channel credentials, and payroll operations must
not share generic module-wide mutation permissions.

Initial system roles:

- Hotel Manager, Front Desk Agent, Housekeeping Supervisor, Housekeeper,
  Restaurant Manager, Cashier, Revenue Manager.
- School Administrator, Admissions Officer, Teacher, Academic Head, Bursar,
  Librarian, Transport Manager, Nurse/Health Officer.

Organization Owner retains all seeded permissions. Role templates are starting
points; tenant administrators may create narrower organization roles.

## Release gates

Each release requires:

1. Hand-reviewed migration generated with `prisma migrate diff`; deploy only via
   `prisma migrate deploy`.
2. Tenant-isolation and foreign-ID tests for every service mutation.
3. State-machine and financial arithmetic tests for each critical transition.
4. Page and Server Action permission checks using unique module permissions.
5. Zod validation for all untrusted inputs and bounded decimals/dates/counts.
6. Seed parity between `src/lib/auth/permissions.ts` and `prisma/seed-data.ts`.
7. Lint, unit tests, build, and guarded disposable-database integration tests.
8. Updated architecture, boundaries, auth, testing, SEO/marketing, README, and
   `OPERATOR_HANDOFF.md` documentation.

## Explicitly deferred decisions

- Country-specific school grading, tax, payroll, statutory reporting, and data
  retention rules require deployment-country configuration.
- Payment gateways, hotel OTA/channel vendors, messaging providers, biometric
  attendance, GPS tracking, access-control hardware, and government education
  reporting require provider-specific adapters and credentials.
- Parent/student/guest self-service portals and native mobile apps are separate
  authenticated surfaces and must receive their own threat model.
