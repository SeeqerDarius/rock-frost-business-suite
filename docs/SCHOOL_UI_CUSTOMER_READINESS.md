# School Module — Customer-Facing UI Readiness

**Date:** 2026-08-10
**Scope:** Customer-facing School UI/UX and information architecture only.
**Author lane:** School pages, School navigation, and new reusable School components.

This report covers a UI-only pass over the School Management module. It was
produced concurrently with backend work by another agent (Codex), who owns
`prisma/schema.prisma`, migrations, `src/modules/school/service.ts`,
`src/app/app/school/actions.ts`, permissions, seed data, shared validation,
tests, and the authoritative documents (`README.md`, `OPERATOR_HANDOFF.md`,
`docs/HOTEL_AND_SCHOOL_MODULES.md`, `docs/SCHOOL_CUSTOMER_READINESS.md`).
No file in that set was modified here.

---

## 1. Pages inspected

All 14 School routes were read in full and rewritten. Each was reviewed for
page hierarchy, form labelling, empty states, feedback, responsive behaviour,
and whether the workflow could actually be completed by a non-technical user.

| # | Route | File |
|---|---|---|
| 1 | `/app/school` | `src/app/app/school/page.tsx` |
| 2 | `/app/school/students` | `src/app/app/school/students/page.tsx` |
| 3 | `/app/school/classes` | `src/app/app/school/classes/page.tsx` |
| 4 | `/app/school/campuses` | `src/app/app/school/campuses/page.tsx` |
| 5 | `/app/school/academic-periods` | `src/app/app/school/academic-periods/page.tsx` |
| 6 | `/app/school/attendance` | `src/app/app/school/attendance/page.tsx` |
| 7 | `/app/school/fees` | `src/app/app/school/fees/page.tsx` |
| 8 | `/app/school/exams` | `src/app/app/school/exams/page.tsx` |
| 9 | `/app/school/timetables` | `src/app/app/school/timetables/page.tsx` |
| 10 | `/app/school/transport` | `src/app/app/school/transport/page.tsx` |
| 11 | `/app/school/library` | `src/app/app/school/library/page.tsx` |
| 12 | `/app/school/payroll` | `src/app/app/school/payroll/page.tsx` |
| 13 | `/app/school/reports` | `src/app/app/school/reports/page.tsx` |
| 14 | `/app/school/settings` | `src/app/app/school/settings/page.tsx` |

`src/app/app/school/layout.tsx` and `src/modules/school/navigation.tsx` were
reviewed and left unchanged — the navigation grouping (Overview / People /
Academics / Finance / Services / Administration) and the module-access guard
were already correct.

---

## 2. Findings in the pre-existing UI

These are the problems the pass was written to fix.

1. **No success or error feedback anywhere in the module.** Every School
   Server Action already redirected to `?saved=1` or
   `?error=forbidden|invalid|state|not-found`, but **no School page read
   `searchParams`**. A submit that was rejected for a permission failure, a
   validation failure, or a business-rule violation looked identical to one
   that succeeded. This was the single largest customer-readiness defect.
2. **Form controls had no accessible names.** Native `<select>` elements were
   rendered with no `<label>` at all, and text inputs carried only a
   `placeholder`. A placeholder is not an accessible name, and it disappears
   on input.
3. **Raw technical inputs in the customer experience.** School Settings asked
   a registrar to type a JSON document into a single-line text box labelled
   "Grading scale JSON".
4. **Dead-end forms.** Pages rendered create/enroll forms with empty
   dropdowns when the prerequisite records (campus, academic year, class,
   subject) did not exist, with nothing explaining what to do first.
5. **Three Server Actions had no UI at all** — `transitionStudentAction`,
   `createFeeStructureAction`, and `issueFeeStructureAction` were exported
   and fully implemented but unreachable from the application.
6. **Operational records rendered as unstructured `<div>` lists** rather than
   tables, with no column headers, so records could not be scanned.
7. **Machine values shown to users.** `PART_PAID`, `MOBILE_MONEY`, and
   `Day 3` were printed raw. Money was printed as a bare `toFixed(2)` on
   every page except the Overview.
8. **Bulk create forms occupied the top of each page**, pushing the actual
   operational records below the fold.
9. **Source formatting.** 11 of the 14 pages were compressed to 2–3
   extremely long lines with single-character identifiers, which made review
   and safe modification impractical.

---

## 3. Files changed

### New reusable components (`src/components/school/`)

| File | Purpose |
|---|---|
| `form-feedback.tsx` | `FormFeedback` renders the success/error banner from the action's redirect params; `ReadOnlyNotice` states why a page is read-only. |
| `form-fields.tsx` | `TextField`, `SelectField`, `CheckboxField`, `FieldGrid` — always-labelled native controls that survive a no-JavaScript Server Action submit. |
| `section-card.tsx` | `SectionCard` section framing; `PrerequisiteNotice` states which setup records are missing and links to them. |
| `status-badge.tsx` | Single mapping from every School status enum to a badge colour. |
| `format.ts` | `formatMoney`, `formatDate`, `formatDayOfWeek`, `DAY_OPTIONS`, `humanizeStatus`. |
| `grading-scale-field.tsx` | Structured grade-band editor replacing the raw JSON text box. |
| `record-search.tsx` | GET-form search/filter bar for record lists. |

### Modified pages

All 14 files listed in section 1. No other file was modified.

### Explicitly not modified

`src/app/app/school/actions.ts`, `src/modules/school/service.ts`,
`prisma/schema.prisma`, `prisma/migrations/**`, permissions, seed data,
shared validation, tests, `README.md`, `OPERATOR_HANDOFF.md`, and existing
docs under `docs/`.

---

## 4. UI improvements completed

**Feedback.** Every page now awaits `searchParams` and renders `FormFeedback`.
Success states name what changed. Error states are written per page, because
the action collapses every distinct `SchoolStateError` into one `state` code
(see contract SC-1). Roles without write permission now see an explicit
read-only notice instead of a page with silently missing buttons.

**Forms.** Every control has a real `<label for>`, and optional fields say so.
Create forms moved into `EntityDialog` (the pattern already used by
Accounting and Fleet), so each page opens on its records rather than its
forms. Native `<select>`/`<input>` elements were kept deliberately: the
Base UI `Select` is a client component that does not post a value in a plain
Server Action form.

**Removed technical inputs.**
- Grading scale: the JSON text box is replaced by `GradingScaleField`, which
  edits grade bands as rows and serialises them into the hidden
  `gradingScaleText` field the action already parses. The action contract is
  unchanged.
- Payroll period: free-text `YYYY-MM` replaced with `<input type="month">`,
  which produces exactly that format natively.
- Payroll type: free text replaced with a list of standard adjustment types.
- Timetable day: `dayOfWeek` is chosen by day name and displayed as
  "Wednesday" rather than "Day 3".
- Exam results: the subject is no longer a dropdown the user can get wrong.
  Result entry now happens from the exam's own row, with the exam's
  `subjectId` passed as a hidden field, because the service requires the two
  to match. `marks` now carries `max={totalMarks}`.

**Newly reachable functionality.** All 27 Server Actions are now wired:
- Student lifecycle transitions on the students table, offering only the
  target statuses the service will accept and capturing an optional reason.
- Fee structures section on the fees page, with "Issue to students" to
  generate invoices for every actively enrolled student.

**Records.** Lists became tables with headers, status badges, and
`tabular-nums` on figures. Fees gained Billed/Collected/Outstanding totals;
Reports was regrouped into Enrollment / Attendance / Fee collection /
Services with derived attendance and collection rates; Overview gained an
attendance snapshot and a fee position.

**Search and filters.** Added only where the page already holds the data:
students (name/admission number + status), attendance (student/class +
status), fee invoices (number/student/description + status), and the library
catalogue. Each is a GET form, so results are shareable URLs that work
without JavaScript, and each states "Showing X of Y". The attendance page
now discloses that the service returns only the 250 most recent records.

**Empty and prerequisite states.** Empty states explain the rule that governs
the page rather than restating the title, and carry the create action where
one is available. `PrerequisiteNotice` appears on Overview, Students,
Classes, Attendance, Exams, Timetables, Transport, and Fees.

---

## 5. Backend contracts Codex still needs to supply

Nothing below is faked in the UI. Resolved coordination items are marked;
the remaining entries are still real gaps.

**SC-1 — Specific rejection reasons (resolved in the coordinated backend lane).**
`SchoolStateError` now carries a stable code. Server Actions preserve that
code in the redirect and `FormFeedback` maps supported reasons to specific,
customer-readable guidance while retaining a safe generic fallback.

**SC-2 — Bulk issuance result feedback (resolved in the coordinated backend lane).**
`issueFeeStructureAction` now preserves the service's issued/skipped counts in
the redirect, and the Fees page reports both values after bulk issuance.

**SC-3 — School payroll is not linked to HR.**
`SchoolPayrollAdjustment.employeeId` is a plain `String` with **no relation**
to `HrEmployee`, and no School service function lists employees. The field is
therefore still a typed ID, labelled honestly as unverified and not linked to
HR. A dropdown was deliberately not built, because it would imply a
referential guarantee the schema does not make. Requested: a relation from
`SchoolPayrollAdjustment.employeeId` to `HrEmployee`, a
`listSchoolPayrollEmployees(organizationId)` service function, and employee
name included in `listSchoolPayrollAdjustments` for display.

**SC-4 — No server-side filtering or pagination.**
Every list function takes only `organizationId` and returns the full set
(`listSchoolAttendance` alone caps at 250). All search and filtering added in
this pass runs in the page over rows already fetched. This is honest but does
not scale. Requested: filter/pagination parameters on
`listSchoolStudents`, `listSchoolFeeInvoices`, `listSchoolAttendance`, and
`listSchoolLibrary`.

**SC-5 — Grading scale has no reader.**
`GradingScaleField` writes
`[{ "grade": "A", "min": 80, "max": 100 }, …]` into `SchoolSettings.gradingScale`.
Nothing reads it back — exam results still take a free-text `grade`. Requested:
either validate this shape in `upsertSchoolSettingsAction` and use it to derive
`grade` in `recordSchoolExamResult`, or confirm a different shape and this
component will be aligned to it.

**SC-6 — `allowRanking` has no effect.** The setting is stored but no
ranking is computed or displayed anywhere.

**SC-7 — Library loans never become `OVERDUE`.** No job transitions
`BORROWED` to `OVERDUE`. The UI compares `dueAt` to the current time at
render and badges those rows "Overdue", but the stored status stays
`BORROWED`, and `getSchoolSummary.overdueLoans` counts by date rather than
status. `LOST` and `DAMAGED` exist in the schema with no action to set them,
and no fines are modelled despite the page previously advertising them.

**SC-8 — No per-organization currency.** `formatMoney` is hard-coded to GHS,
matching the previous Overview card. Hotel stores currency per property;
School has no equivalent field.

**SC-9 — No edit or deactivate anywhere.** Campuses, classes, subjects,
books, and routes can be created but never edited or deactivated, though
`active` flags exist on several models. Transport assignments cannot be
removed. Refunds exist in the schema (`refundedAt`) with no action.

**SC-10 — Report cards are not implemented.** Exam results can be published,
but nothing assembles a per-student report card, and there is no
student-detail route.

---

## 6. Accessibility findings

Fixed in this pass:
- Every form control has a programmatic label. Placeholder-only inputs and
  entirely unlabelled `<select>` elements were the previous norm.
- Optional/constraint text is associated with its control via
  `aria-describedby`.
- Action-only table columns use `<TableHead><span className="sr-only">` so
  the column is announced.
- The destructive row control in the grading-scale editor has an
  `aria-label` naming the grade it removes.
- Result counts are `aria-live="polite"`, so filtering is announced.
- Status is never conveyed by colour alone — every badge carries text.
- Focus rings come from the shared `Input`/`Button` styles; the native
  `<select>` was given a matching `focus-visible` ring.
- Disabled selects state why they are empty ("Create a campus first") instead
  of presenting an empty control.

Outstanding, needing a real browser and assistive technology to confirm:
- Contrast of `text-muted-foreground` on `bg-card` in dark mode across the
  new tables has not been measured.
- `EntityDialog` focus-trap and focus-restore behaviour was not verified
  interactively.
- The `?error=` banner is rendered after a redirect but is not focused or
  announced on arrival; a `role="status"` live region or programmatic focus
  may be needed for screen-reader users.

---

## 7. Responsive findings

Layouts were written mobile-first and reviewed by breakpoint, but **not
verified in a real browser** (see section 8).

- Page bodies use `mx-auto max-w-screen-2xl` (Settings uses `max-w-4xl`),
  consistent with other modules.
- The shared `Table` already wraps itself in an `overflow-x-auto` container,
  so no table forces horizontal page scroll.
- Rather than relying on that scroll, secondary columns are progressively
  disclosed with `hidden md:table-cell` / `hidden lg:table-cell`, and the
  hidden value is repeated beneath the primary cell on small screens — so
  campus, class, and author remain visible on a phone.
- `PageHeader` actions wrap via `flex-col sm:flex-row`; multiple dialog
  triggers wrap rather than overflow.
- `FieldGrid` collapses to one column below `sm`.
- `RecordSearch` stacks the input, filter, and buttons on narrow screens.
- Inputs use `text-base` below `md` to avoid iOS zoom-on-focus.

Not addressed: on a very narrow viewport the fees invoice table still shows
seven columns; if it proves cramped on a real device, Balance and Status
should collapse into the invoice cell.

---

## 8. Validation results

Run at the repository root on 2026-08-10, against a working tree that also
contained Codex's concurrent backend changes.

| Command | Result |
|---|---|
| `npx tsc --noEmit --incremental false` | **Pass** — no output, no errors. Re-run after Codex's later `actions.ts`/`service.ts` edits landed; still clean. |
| `npm run lint` | **Pass** — no errors, no warnings. (One `no-unused-vars` warning was introduced and fixed during the pass.) |
| `npm run test` | **Pass** — 34 files, 213 tests passed, 0 failed, 12.07s. |
| `npm run build` | **Pass** — "Compiled successfully in 28.5s". All 14 School routes emitted as `ƒ` (dynamic), which is correct now that each reads `searchParams`. |

Additional check: every one of the 27 exported Server Actions in
`src/app/app/school/actions.ts` is referenced by a School page. Before this
pass, three were unreachable.

### Browser check — not performed, and why

**This is a genuine blocker, not an omission.**

1. `DATABASE_URL` in `.env` points at a shared remote Neon instance
   (`ep-crimson-star-...aws.neon.tech`), not a local or disposable database.
   Exercising the School forms against it would mutate real tenant data,
   which the working agreement for this task forbids.
2. No non-production credentials or a seeded test tenant were provided, so
   authenticating past `requireModuleAccess("school")` was not possible.
3. Codex's migration
   `prisma/migrations/20260810103000_school_customer_readiness_foundation/`
   was still unapplied in this working tree. It creates `SchoolFeeStructure`
   and `SchoolStudentLifecycleEvent`. The fees and students pages query both,
   so those routes cannot render until that migration is applied — and
   running migrations was also out of scope here.

Everything verifiable without a live authenticated session was verified:
type checking, linting, the full unit suite, and a production build.

**Still required before customer release:** an authenticated pass over all 14
routes at ~375px and ~1440px, against a disposable database with the new
migration applied, exercising each form's success and rejection paths. Items
in section 6 marked outstanding can only be closed there.

---

## 9. Notes for the operator handoff

`OPERATOR_HANDOFF.md`, `README.md`, and the existing authoritative docs were
deliberately left untouched, since another agent owns them and was editing
them concurrently. This report is standalone and should be referenced from
the next handoff entry.

Concurrent modifications observed in `git status` at handoff, all belonging
to the backend lane and none touched here: `prisma/schema.prisma`,
`prisma/migrations/20260810103000_school_customer_readiness_foundation/`,
`src/modules/school/service.ts`, `src/app/app/school/actions.ts`,
`test/integration/tenant-isolation/school.test.ts`, `README.md`,
`OPERATOR_HANDOFF.md`, `docs/HOTEL_AND_SCHOOL_MODULES.md`, and
`docs/SCHOOL_CUSTOMER_READINESS.md`.
