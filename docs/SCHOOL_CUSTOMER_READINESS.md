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

## Customer-readiness tranche 2 — capacity, lifecycle controls, teacher scoping, and UX fixes

Migration `20260818160000_add_school_class_teacher` adds `SchoolClassTeacher`,
a class-to-user assignment table. This tranche also delivered, without a
schema change:

- **Class capacity is now editable after creation** (`updateSchoolClassCapacity`,
  Classes & Enrollment's per-row Edit-capacity dialog). Refuses to set
  capacity below the number of students already actively enrolled.
- **Academic years can be archived or deleted.** Archiving
  (`closeSchoolAcademicYear`) sets the existing `closedAt` column and clears
  `current`; it's available to anyone with `school.academics.manage`. Hard
  deletion (`deleteSchoolAcademicYear`) additionally requires the
  organization-admin permission (`org.settings.manage`) and the acting
  user's account password re-entered in the delete dialog, and only
  succeeds when the year has zero terms, enrollments, fee invoices, fee
  structures, or exams attached — real academic history must be archived,
  not deleted.
- **Teacher class scoping.** `SchoolClassTeacher` lets an admin (Classes &
  Enrollment's Manage-teachers dialog) assign specific staff to specific
  classes. A user with at least one assignment can only record attendance
  or exam results for their assigned class(es); `recordSchoolAttendance`
  and `recordSchoolExamResult` enforce this in the service layer itself
  (both the web action and the desktop offline-sync adapter pass the
  acting user through), and the attendance/exam pages filter the Class
  picker to match. A user with zero assignments is unrestricted, matching
  the existing seeded "Teacher" role's design (view + attendance + exams +
  timetables, org-wide) unless an admin opts them into class scoping.
- **Admitting a student can add their guardian in the same step**
  (`admitSchoolStudent`): optional guardian fields on the admission dialog
  create and link a guardian transactionally, instead of requiring the
  separate "Add guardian" then "Link guardian" flow first. That separate
  flow still exists for a guardian who already has other children on
  record.
- **Selecting a student on the exam-results form now defaults the Class
  field** to their current active enrollment (`StudentClassFields`,
  progressive client-side enhancement over the two native selects; the
  server action still validates the submitted class independently).
- **Fixed a dialog-overflow bug**: `DialogContent`
  (`src/components/ui/dialog.tsx`) had no max-height or scroll, so a tall
  dialog (e.g. admission with the new guardian section) could render fields
  and the submit button below the visible viewport with no way to reach
  them. Now `max-h-[calc(100vh-2rem)] overflow-y-auto`. This is the shared
  Dialog every module uses, not School-specific.

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
