# School customer readiness

**Status:** active production-readiness program. The original School release is
operational, tenant-isolated, and deployed, but this document tracks the work
required to make it complete for day-to-day customer use rather than treating a
broad set of initial pages as the end of product development.

## Delivered foundation

The deployed foundation includes campuses, academic periods, students and
guardians, classes and enrollment, attendance, fee invoices and payments,
exams and publication, timetables, library loans, transport assignments,
education-specific payroll adjustments, settings, reports, RBAC, and
tenant-isolation coverage.

## Customer-readiness tranche 1 — lifecycle and repeatable billing

Migration `20260810103000_school_customer_readiness_foundation` adds:

- `SchoolStudentLifecycleEvent`, an append-only history of explicit student
  transitions. Supported transitions are applicant to active/withdrawn, active
  to suspended/withdrawn/graduated, and suspended to active/withdrawn. Terminal
  transitions close active enrollments rather than deleting history.
- `SchoolFeeStructure`, scoped to an organization, campus, academic year, and
  optional term/class. A structure can issue one invoice per eligible active
  student and repeated issuance skips students already billed.
- A nullable `SchoolFeeInvoice.feeStructureId` link so manually issued invoices
  remain supported and historical data needs no backfill.

This tranche also turns two previously passive campus settings into enforced
behavior:

- `attendanceCloseDays` rejects attendance creation/correction after the
  configured window and rejects future attendance.
- `receiptPrefix` supplies the prefix for new School fee-payment receipts.

Invoice and receipt numbering are serialized per organization with PostgreSQL
transaction advisory locks for bulk issuance and payment receipt creation.
School actions preserve stable rejection codes for customer-readable feedback,
bulk issuance reports issued/skipped counts, and student status claims reject
concurrent stale transitions.

## Remaining customer-readiness program

### Student administration

- Complete admission application, document, emergency-contact, profile-edit,
  transfer, promotion, and academic-year rollover workflows.
- Add bulk import/export with preview, validation, and recoverable error reports.
- Add printable student profiles and enrollment history.

### Fees and finance

- Add fee-structure and bulk-issuance UI, scholarships, credits, refunds,
  reversals, statements, receipt printing, cashier reconciliation, and arrears
  aging.
- Add Accounting posting through the Accounting module's public service.

### Academics

- Add class-register attendance and append-only published-attendance revisions.
- Replace free-text teachers/rooms with School-owned assignments backed by HR
  employees and enforce timetable collisions.
- Add assessment schemes, calculated grading, report cards, transcripts,
  promotion decisions, and published-result revision history.

### Campus services and access

- Expand transport and library operations according to verified customer demand.
- Add separately permissioned health/clinic workflows before storing structured
  health records.
- Design guardian/student self-service as a separate authenticated surface with
  its own threat model.

## Release gates

Every tranche requires Prisma validation/generation, lint, TypeScript, unit
tests, a production build, and School integration tests against the guarded
disposable PostgreSQL database in `docs/TESTING_STRATEGY.md`. UI work also
requires responsive browser verification. A migration is not production-ready
until it has applied cleanly to that disposable database and the complete
integration suite passes.
