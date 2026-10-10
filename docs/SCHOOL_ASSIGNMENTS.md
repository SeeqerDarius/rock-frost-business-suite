# School: Assignments & Assessments (paid add-on)

Added 2026-10-10. Teachers set class work, students submit from My Portal,
deterministic question types are marked on the server, and a teacher decides
per assignment whether its results count towards the existing cumulative
record. There is no second gradebook and no AI marking.

## Entitlement and access

- **Add-on grant**: `Organization.schoolAssignmentsGranted` (default off),
  granted per organization by a platform operator under Modules and features
  on the organization's Configuration pane (`toggleSchoolAssignments()` in
  `src/app/app/platform/actions.ts`, audited as
  `school_assignments.platform_granted` / `_revoked`). Declared
  `scope: "module"` in `src/platform/organizations/feature-addons.ts`, so it is
  nested under School.
- **Server-side gate**: every exported function in
  `src/modules/school/assignments-service.ts` calls `assertAvailable()`, which
  requires both the grant and a current School entitlement
  (`entitledModuleKeysForOrganization`). Pages show a "not enabled" state and
  navigation hides the links, but neither is the security boundary.
  `test/school-assignments-access.test.ts` asserts every service entry point
  and every Server Action keeps its check.
- **Teachers**: the existing `school.exams.manage` permission (Teacher,
  Academic Head, School Administrator). Class scope reuses
  `SchoolClassTeacher` / `resolveTeacherClassScope()`, exactly like exam result
  entry: a teacher assigned to classes reaches only those classes; staff with
  no class assignment are unrestricted. The current system has no per-subject
  teacher assignment, so subject access follows the class rule (same as
  exams).
- **Students**: the seeded Student portal role (`school.portal.view`) linked to
  a `SchoolStudent` through `userId`. The student is always resolved from the
  session (`resolveSchoolPortalScope`), never from form input. Students need
  the Parent and Student portal add-on as well, because My Portal is how they
  sign in. Guardians do not see assignments in this release.
- No new permission keys and no seed changes were needed.

## Assignment lifecycle

| Stored status | Teacher sees | Meaning |
|---|---|---|
| `DRAFT` | Draft | Editable, invisible to students. A never-published draft can be deleted. |
| `PUBLISHED` | Scheduled, Open, or Past due (from `availableFrom` / `dueAt`) | Students in the class see it. Late submissions are accepted after the due date only if `allowLateSubmissions` is on, and are labelled late. |
| `CLOSED` | Closed | No submissions. Settings and questions are locked until reopened. |
| `GRADED` | Graded | Requires no submission pending review. Releases results set to "when I mark the assignment graded". Reopen to change marks. |

Fields: title, instructions, class, subject, academic year and term (from the
term), opens, due (entered in the organization's timezone through
`zonedDateTime()`), attempts allowed (1 to 10), attempt scoring (`HIGHEST` or
`LATEST`), result release (`IMMEDIATE`, `AFTER_DUE`, `ON_RELEASE`), and
whether correct answers are shown at release. Class, subject, and term are
fixed after the first publish and while the assignment is in the cumulative
record. The maximum score is the sum of question points of the published
version.

Every lifecycle change, inclusion change, gradebook write, and mark change is
written to `SchoolAssignmentEvent` (shown on the assignment and submission
pages) and mirrored to `AuditLog` as `school.assignment.<action>`.

## Questions, versions, and marking

The teacher edits a working copy (`SchoolAssignmentQuestion`). Publishing
snapshots it into an immutable `SchoolAssignmentVersion` (questions with
answer keys, maximum score). Students are only ever served, and marked
against, a version. Publishing changes creates version N+1 for new attempts;
existing submissions keep their `versionId`, questions, and scores. A student
form rendered from an older version is refused with `version-changed` rather
than being marked against different questions.

Rules (`src/modules/school/assignment-grading.ts`, pure and unit tested in
`test/school-assignment-grading.test.ts`, decimal arithmetic throughout):

| Type | Marking |
|---|---|
| Single choice, True or false | Automatic. Full points for the one correct option, else zero. |
| Multiple select | Automatic. Full points only for an exact match of the correct set. No partial credit. The rule is shown to teachers and students. |
| Numeric | Automatic. Strict number parsing (no exponents or separators); full points when `abs(answer - expected) <= tolerance`. Students see the tolerance, never the answer. |
| Short written answer, Essay | Always teacher-marked. Never auto-marked, never sent to an AI model. Optional marking guide is staff-only. |

Grading statuses: `AUTO_GRADED` (all objective), `PENDING_REVIEW` (any
written answer unmarked), `REVIEWED` (a teacher saved marks). Teacher marks
must be between 0 and the question's points with at most two decimals; a
teacher may also correct an auto-marked question, which is recorded in the
history with the optional reason.

Answers are normalized against the version (unknown questions and options are
dropped, text is capped at 10,000 characters) and marked on the server.
Answer keys are stripped by `toStudentQuestions()`; per-question results,
scores, feedback, and correct answers are only returned to the student once
`isResultReleased()` allows it.

### Repeated submissions and retries

Each rendered student form carries a random idempotency key. Submission runs
in a transaction holding a per-student advisory lock. The same key always
resolves to the existing submission (`unique(assignmentId, studentId,
idempotencyKey)`); different concurrent submits are serialized, and
`unique(assignmentId, studentId, attemptNumber)` plus the attempt count check
mean attempts can never exceed the limit or be duplicated.

Counting mark per student (`resolveCountingAttempt`): `LATEST` uses the latest
attempt (pending if it awaits marking); `HIGHEST` uses the best final attempt
by percentage, and is pending while any attempt awaits marking.

## Cumulative record (gradebook) opt-in

The existing cumulative record is `SchoolExam` + `SchoolExamResult`, combined
per subject and term by each published exam's `weight` on the broadsheet
(`docs/SCHOOL_PARENT_STUDENT_PORTAL.md`). Assignments plug into that, unchanged:

- **Off by default.** An assignment writes nothing to `SchoolExamResult` until a
  teacher links it.
- **Opting in** requires choosing one existing exam in the same academic year,
  term, and subject that is still `DRAFT`, `OPEN`, or `MODERATION`, has no
  results yet, and is not linked to another assignment (`gradebookExamId` is
  unique). If none exists, the teacher is pointed to Exams & Grading to create
  one (for example "Class assignment 1" with the school's continuous-assessment
  weight). No weighting is invented.
- **What is written**: for each student with a final counting mark,
  `marks = score / maxScore × exam.totalMarks` (two decimals), with the grade
  and remark from the campus grading scale, exactly as manual entry does.
  Pending marks remove any earlier recorded value. Students who did not submit
  get no result, never an automatic zero (the broadsheet already skips missing
  results).
- **When it counts**: only after the exam is moderated and published through the
  existing exam workflow. The teacher interface explains this and shows the
  exam's weight share among the subject's exams for the term.
- **One source per mark**: `recordSchoolExamResult()` refuses manual entry into
  an exam an included assignment feeds (`assignment-linked`).
- **Opting out** deletes the results the assignment wrote and clears the link.
  It is refused once the linked exam is published or closed, because that
  record has been released. Assignment marks themselves are never deleted.
- Re-marks, attempt-scoring changes, and new final submissions resync the
  affected students while the exam still accepts results. After publication the
  teacher sees "Exam already published" for any mark that can no longer change.

## Routes

Staff (`requireModuleAccess("school")` + `school.exams.manage`):
`/app/school/assignments`, `/app/school/assignments/[assignmentId]`,
`/app/school/assignments/[assignmentId]/preview`,
`/app/school/assignments/[assignmentId]/submissions/[submissionId]`.
Students: `/app/school/portal/assignments`,
`/app/school/portal/assignments/[assignmentId]`. All are under `/app/`, which
`robots.ts` disallows, and none are in the sitemap. Server Actions live in
`src/app/app/school/assignments/actions.ts`.

## Pricing

The add-on is advertised inside the School Management card on `/pricing` and
on `/modules/school`. Its price lives only in `AddonPricingPlan` (operator
editable at `/app/platform/subscriptions#addon-pricing`, audited). No row is
seeded: as of 2026-10-10 the owner chose to ship without a price, so the
public page says "Priced on request" until an operator publishes a confirmed
amount. Suite prices and contents are unchanged and do not include the add-on.

## Data and retention

Submissions follow the School record retention convention: they cascade with
the organization and the assignment, and a student with submissions cannot be
hard-deleted (`onDelete: Restrict`, same as exam results). File uploads are
not supported in this release, so no new storage path exists.

## Tests

- `test/school-assignment-grading.test.ts`: marking rules, numeric tolerance
  boundaries, multi-select exact match, teacher mark boundaries, attempt policy,
  scaling, release and availability windows, answer-key stripping.
- `test/school-assignments-access.test.ts`: navigation gating, add-on catalogue,
  service and action guard coverage, pricing copy ("Starting from", "Priced on
  request", no seeded add-on price), no AI claims, robots/sitemap, em dash rule.
- `test/integration/tenant-isolation/school-assignments.test.ts` (real
  Postgres): grant and School-module enforcement, cross-tenant isolation for
  assignments, questions, submissions, and inclusion, teacher class scope,
  student class scoping and answer privacy, release gating, idempotent retry and
  concurrent attempts, version immutability, and gradebook opt-in, scaling,
  manual-entry block, regrade, opt-out, and published-exam lock.

## Known gaps

- Guardians cannot view their child's assignments yet.
- No file uploads or partial credit for multiple select (by design).
- Missing work is never converted to a zero in the linked exam, matching the
  broadsheet's existing "missing result is blank" rule. Recording a zero for
  non-submission would need a deliberate, separately agreed follow-up.
- If a teacher republishes while a student is answering, the student's
  unsubmitted answers are not kept; they are told to reload.
