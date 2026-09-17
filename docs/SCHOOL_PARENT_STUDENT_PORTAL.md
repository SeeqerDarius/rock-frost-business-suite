# School: Ghana grading/broadsheet, SMS notifications, and the Parent/Student portal

Three additive features on top of the existing School Management module
(`docs/HOTEL_AND_SCHOOL_MODULES.md`). All three are optional and off by
default; enabling any of them changes no existing behavior for an
organization that doesn't opt in.

## 1. Ghana-style grading and the exam broadsheet

`SchoolSettings.gradingScale` (`Settings > Grading scale`) already let a
campus convert marks to a letter grade. This pass:

- Extended each band's shape to `{ grade, min, max, remark? }` and taught
  `resolveGradeFromScale()` (`src/modules/school/service.ts`) to return the
  remark alongside the grade. `recordSchoolExamResult()` uses it to
  auto-fill both when a teacher doesn't type them explicitly.
- Added a "Ghana (WASSCE/BECE) 9-point scale" preset to
  `GradingScaleField` (`A1`-`F9`, 75-100 down to 0-39, with the standard
  Excellent/Very Good/Good/Credit/Pass/Fail remarks) alongside the existing
  generic A-F preset. Either preset is just a starting point a school can
  edit freely — the scale itself was already fully tenant-configurable.
- Gave `allowRanking` (`Settings > Grading scale`, previously stored but
  unconsumed — see the now-resolved SC-6 in
  `docs/SCHOOL_UI_CUSTOMER_READINESS.md`) a real effect: it gates the new
  **broadsheet** at `/app/school/exams/broadsheet`
  (`src/modules/school/broadsheet-service.ts`).

### Broadsheet aggregation rules

Given a class and a term:

1. Only `PUBLISHED` exams count. A subject can have more than one exam in
   the same term (e.g. mid-term + end-of-term); each result's weighted
   percent (`marks / totalMarks * exam.weight`) is combined per subject
   using `weight` as the combining factor, the same field exams already
   carry for exactly this purpose.
2. A student's **Average** is the mean of their percent across only the
   subjects they were actually examined in — a missing subject is left
   blank, never scored as zero, so one missed exam doesn't unfairly tank a
   student's ranking.
3. When `allowRanking` is on, rows are sorted by Average descending, ties
   broken by Total then by last/first name, and **Position** uses standard
   competition ranking (a tie shares the same position; the next distinct
   score skips ahead accordingly). When it's off, the same table is shown
   sorted alphabetically with no Position column.
4. The pure ranking/aggregation core (`computeBroadsheetRows()`) is
   deliberately separate from the Prisma-fetching wrapper
   (`getSchoolBroadsheet()`) so it's unit-tested without a database — see
   `test/school-broadsheet.test.ts`.

## 2. SMS notifications: a paid, per-organization add-on

Two independent gates, both must be on for any School text to send:

- **Per-organization entitlement** (`Organization.smsNotificationsGranted`,
  default **off** for every organization). SMS notifications is a paid
  add-on: a platform operator grants or revokes it for one organization at
  a time from the "SMS notifications" card on that organization's own
  detail page (`/app/platform/organizations/[organizationId]`), via
  `toggleOrganizationSmsNotifications()`
  (`src/app/app/platform/actions.ts`) — the same shape as the existing
  `offlineAccessGranted` entitlement. Checked directly in `sendSms()`
  (`src/lib/sms.ts`) for every non-OTP send across every module (Hotel,
  Pharmacy, Payroll, Hospital, School), scoped to that specific
  organization — granting it to one school never affects any other
  organization. **Never** gates 2FA OTP codes; login must keep working
  even for an organization that hasn't purchased this add-on.
- **Per-campus** (`SchoolSettings.smsNotificationsEnabled`, `Settings >
  SMS notifications`, default **off**) — an organization that *has* the
  add-on still opts in per campus, same convention as
  `HotelSettings`/`PharmacySettings`/`PayrollSettings`/`HospitalSettings`'s
  existing `smsNotificationsEnabled` flags (`docs/SMS_INTEGRATION.md`). The
  School Settings page shows an amber note when the organization doesn't
  hold the entitlement yet, so an admin can pre-configure the toggle
  without it doing anything until Rock Frost enables the add-on.

Three School trigger points, each calling the shared
`notifySchoolGuardians()` helper (`src/modules/school/service.ts`), which
texts every guardian linked to a student who has a phone number:

| Event | Purpose code | Fires in |
|---|---|---|
| Student marked `ABSENT` | `SCHOOL_ATTENDANCE_ABSENT` | `recordSchoolAttendance()`, `recordSchoolAttendanceBulk()` |
| Fee payment recorded | `SCHOOL_FEE_PAYMENT_RECEIVED` | `recordSchoolFeePayment()` |
| Exam published | `SCHOOL_EXAM_RESULTS_PUBLISHED` | `publishSchoolExam()` |

Every trigger fires only after its write has already committed (never
inside the same transaction, matching the existing Hotel/Pharmacy/Payroll/
Hospital convention), and `sendSms()` never throws — a slow or failed text
never blocks or fails the underlying attendance/payment/publish action.

## 3. Parent and Student self-service portal

The portal is also a **paid, per-organization add-on**
(`Organization.schoolPortalGranted`, default **off**), independent of the
SMS entitlement above. A platform operator grants or revokes it from the
"School: Parent/Student portal" card on that organization's detail page
(shown only once School is enabled for that organization), via
`toggleSchoolPortalAccess()` (`src/app/app/platform/actions.ts`). Until
granted, `/app/school/portal` and `/app/school/portal-access` both show a
"not available, contact Rock Frost" state regardless of role or
permission — enforced server-side in both pages and in the two invite
actions (`inviteGuardianToPortalAction`/`inviteStudentToPortalAction`),
not just hidden from navigation. Revoking a granted organization's access
doesn't delete any existing guardian/student links; it simply makes the
portal and Portal Access unreachable again until re-granted.

Two new seeded system roles, **Parent** and **Student**
(`prisma/seed-data.ts`), each holding only
`[DASHBOARD_VIEW, SCHOOL_PORTAL_VIEW, AI_ASSISTANT_USE]` — never
`SCHOOL_VIEW` or any staff permission, and deliberately **not** run through
`moduleRolePermissions()`'s staff-seat accounting: a portal account never
counts against a paid School staff seat, since a school can have hundreds
of guardians.

### Linking a person to their portal account

- `SchoolGuardian.userId` / `SchoolStudent.userId` (both optional, unique)
  link a guardian or student record to a login-capable `User`, exactly the
  same shape as `FleetDriver`/`FleetOwner`'s existing `userId` link to a
  driver or vehicle-owner portal account.
- Staff with `SCHOOL_STUDENTS_MANAGE` (or read-only with
  `SCHOOL_STUDENT_PROFILE_VIEW`) manage this from **Portal Access**
  (`/app/school/portal-access`, `src/app/app/school/portal-access/`):
  invite a guardian (using their existing email on file) or a student
  (typing an email at invite time, since `SchoolStudent` has no email
  field of its own — the email only ever becomes the new `User.email`) to
  the portal, or revoke an existing link. Invitation reuses the same
  `createInvitation`/`sendEmail` primitives as School Staff invites
  (`src/app/app/school/staff/actions.ts`), just without the seat check.

### What the portal shows

`/app/school/portal` (`src/app/app/school/portal/page.tsx`) resolves the
signed-in user's own scope via `resolveSchoolPortalScope()`
(`src/modules/school/portal-service.ts`) — **never** from a client-supplied
student id:

- A **Student** account sees only their own record.
- A **Parent** account sees every student linked via
  `SchoolStudentGuardian` to their own `SchoolGuardian` row, with a
  child-switcher when there's more than one.

Each student's summary (`getSchoolPortalStudentSummary()`): current class,
attendance rate and last 10 days, last 10 published exam results (grade +
remark), class broadsheet position when computable and ranking is allowed,
outstanding fee balance and last 10 invoices, last 10 conduct records, and
current digital ID status. This is a deliberately trimmed self-service
view — not the same shape as the staff-only, permission-gated
`getSchoolStudentProfile()` (`student-profile-service.ts`), and it never
exposes medical notes or documents.

### Navigation

`src/modules/school/navigation-access.ts` (mirroring
`src/modules/fleet/navigation-access.ts`'s existing pattern for
Driver/Mechanic self-service roles) filters the School sidebar by
permission **and** the organization's `schoolPortalGranted` entitlement
per route — the layout fetches the grant once
(`src/app/app/school/layout.tsx`) and passes it into
`getSchoolNavigationForTenant(tenant, schoolPortalGranted)`. A
Parent/Student account sees only **My Portal**, and only once the
organization holds the entitlement; every staff nav item requires its own
staff permission, so a portal account can never even see a locked link to
data it can't open. This filtering is a UX convenience only — the pages
and invite actions re-check the entitlement independently, which is the
real boundary. The School layout also hides the cross-module launcher for
a narrow portal role (`isNarrowSchoolPortalRole()`,
`src/lib/auth/permissions.ts`), same treatment Fleet's Driver/Mechanic
roles already get.

## Testing

- `test/school-broadsheet.test.ts` — pure ranking/aggregation and
  grade-resolution unit tests (ties, missing-subject handling, ranking
  on/off).
- `test/sms.test.ts` — the per-organization entitlement: blocks a
  notification send for an ungranted organization, allows it for a
  granted one, never checks it for an OTP send.
- `test/integration/sms/organization-sms-entitlement.test.ts` —
  real-Postgres proof that revoking/regranting
  `Organization.smsNotificationsGranted` actually changes `sendSms()`'s
  behavior for that organization.
- `test/platform-sms-and-portal-grants.test.ts` — mocked-db suite for
  `toggleOrganizationSmsNotifications()`/`toggleSchoolPortalAccess()`:
  operator-only, rejects a missing/nonexistent organization, stamps and
  clears who-and-when on grant/revoke.
- `test/school-portal-access.test.ts` — `isSchoolParentRole`/
  `isSchoolStudentRole`/`isNarrowSchoolPortalRole` classification, and
  `getSchoolNavigationForTenant()`'s per-role **and** per-entitlement
  filtering.
- `test/integration/tenant-isolation/school.test.ts` — real-Postgres proof
  that `resolveSchoolPortalScope()` is organization-scoped, not just
  keyed by the globally-unique `userId` (a user linked in one organization
  never resolves under another organization's id).

## Known follow-ups (not built in this pass)

- No single-student, printable "report card" document (the broadsheet
  covers the whole-class view; the portal covers the individual view; a
  one-page-per-student PDF is still open, same gap as the historical
  `docs/SCHOOL_UI_CUSTOMER_READINESS.md` SC-10 note).
- No PDF/Excel export of the broadsheet itself (Reports pages elsewhere
  use `/api/reports/[moduleKey]`, which is a module-summary export, not a
  fit for an arbitrary class/term broadsheet without new work).
- Portal Access has no bulk-invite action; it's one guardian/student at a
  time from `/app/school/portal-access`.
- SMS notification events are fixed to the three listed above — no UI to
  choose which events text guardians independently of the single
  campus-level toggle.
