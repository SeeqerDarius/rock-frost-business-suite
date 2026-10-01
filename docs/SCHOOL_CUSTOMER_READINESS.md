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

## Customer-readiness tranche 3 — fee-payment Accounting delivery

School fee payments remain recorded and receipted even if optional Accounting
posting fails. Each payment records `PENDING`, `POSTED`, `FAILED`, or
`NOT_REQUIRED`; users with School fee-management permission can retry failed or
previously unposted payments. The retry reloads the payment within the active
organization and reuses the same idempotent Accounting source identity. When
Accounting is inactive the payment is marked `NOT_REQUIRED` and can be retried
after Accounting is enabled. The fee page shows posting status beside each
receipt. Migration `20261001090000_school_fee_accounting_retry` adds the status
and retry index; existing payments start as `PENDING` so they can be reconciled
through the same retry path.

## Customer-readiness tranche 4 — School inputs in Payroll runs

School payroll adjustments are now linked to an active, payroll-eligible HR
employee in the same organization. The School page shows each employee's name
and number, lets authorized users assign or reassign a pending imported row,
and labels each row as an earning or deduction. Existing IDs that cannot be
matched during migration are retained as legacy values for recovery; they are
not discarded or silently attached to another employee.

Payroll consumes pending School inputs only when processing a full calendar
month. Earnings increase gross pay before the organization's configured
default tax rate is applied. Deductions are included in other deductions and
reduce net pay. A matching input with an invalid employee, a non-monthly run,
or deductions exceeding net pay blocks processing with a specific message.
The Payroll run and adjustment claims commit in the same transaction, so a
failed run leaves its inputs pending. The resulting Payroll accrual continues
through the existing idempotent Accounting integration. Statutory deduction
classification, employee disbursement, and partial-month proration remain
separate work.

Migration `20261001120000_school_payroll_run_integration` introduces the
organization-scoped employee and PayrollRun relations and category enum.
`src/modules/school/payroll-integration.ts` is the School-owned contract that
Payroll calls within the run transaction; Payroll does not query School's
Prisma model directly.

## Customer-readiness tranche 5 — scalable student directory

The Students table now searches by student name or admission number in the
tenant-scoped database query and returns stable pages of 50 rows (maximum 100
per page). Status and text filters are applied before counting and paging;
page links preserve active filters and clamp stale page numbers to the last
available page. The existing full student directory service remains available
to forms and workflows that need organization-wide choices. The paged table
selects only displayed identity, campus, active-enrollment, and guardian-contact
fields; it does not fetch medical notes or photo data into the list response.

## Customer-readiness tranche 6 — scalable operational lists

Fee invoices, attendance history, and the library catalogue now use
organization-scoped database search and stable pages of 50 rows, capped at
100. Search terms and valid status filters are applied before counting and
pagination; page links preserve current filters and stale page requests clamp
to the last available page. Fee dashboard totals use database aggregates
across the organization rather than summing only the visible invoice page.
Invoice rows select only the fields rendered by the table and its receipt
actions. Attendance rows omit unrelated student data. Library catalogue rows
use a narrow select; book choices for issuing loans load only IDs, titles, and
available-copy counts. Library loan history now has tenant-scoped search and
stable pages of 50 rows capped at 100, separate search state from the
catalogue, an open/all-loans toggle, and an organization-wide overdue count.
Loan rows select only the book and student fields shown in the table.

The invoice status filter now matches the schema's `VOID` value rather than
offering the nonexistent `CANCELLED` value. Remaining scaling work includes
organization-wide form pickers, followed by
the finance, student lifecycle, and academic workflows listed below.

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
  (the web action passes the acting user through), and the attendance/exam pages filter the Class
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

- Add scholarships, credits, refunds, reversals, statements, receipt printing,
  cashier reconciliation, and arrears aging. Fee structures and bulk issuance,
  plus Accounting delivery status and retry, are implemented.

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
