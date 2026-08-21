# Hospital Management module

**Status:** implemented, merged to `main`, and live in production since 2026-08-12 (merge commit `c5f626b`, public landing page published the same day in `0c8d626`). This
document is the product and architecture contract for the vertical, written to the same standard as
`docs/HOTEL_AND_SCHOOL_MODULES.md` and following the isolation rules in `docs/MODULE_BOUNDARIES.md`: every owned
record carries `organizationId`, every lookup and mutation is tenant-scoped, and the one deliberate cross-module
integration (medication orders reaching Pharmacy) goes through an explicit versioned contract rather than a direct
table reference.

## Regulatory and product boundary

Rock Frost Hospital Management is **operational record-keeping software**. It is not a medical device, not a
diagnosis or clinical-decision engine, and does not itself grant a facility licence, validate a clinician's
professional registration, or certify regulatory compliance. There is no diagnosis or treatment suggestion engine
anywhere in this module — diagnosis and care-plan entry are always a clinician typing free text, never system-
generated. Every deploying organization remains responsible for Ghana Health Service/HeFRA facility licensing, the
Data Protection Commission's data-protection obligations, NHIA claims requirements, professional review of clinical
content, consent practice, and record-retention policy appropriate to its jurisdiction. `HospitalSettings.retentionYears`
is metadata the organization configures for its own policy — the application does not enforce a retention period or
automatically delete records at expiry.

## Delivery order relative to Pharmacy

Per `docs/PHARMACY_AND_HOSPITAL_ROADMAP.md`, Pharmacy was delivered and released to production first; Hospital's
production *activation* (merge, deploy) followed only after Pharmacy cleared its own release gates. This was
satisfied by construction: Hospital was developed on its own isolated branch/worktree, merged and deployed only
after Pharmacy was already live. Development happened concurrently with Pharmacy (two agents, two branches) because
nothing about writing and validating Hospital's own code depended on Pharmacy being live — only the two verticals'
*simultaneous production activation* was what the roadmap guarded against, and this sequencing avoided that. Both
verticals are merged to `main` and live in production as of 2026-08-12.

## Scope delivered

1. **Facility configuration** — facilities, departments, a billable service-item catalogue, and a provider
   (clinician) directory, each scoped to a facility and optionally a department.
2. **Patients** — organization-unique MRN (generated the same `count()` + `createWithUniqueRetry` way Hotel
   generates confirmation codes: the database unique constraint plus a retry is the actual safety net under
   concurrency, not the count itself), demographics, contacts, next of kin, emergency contact, allergies, free-text
   alerts, national ID, blood group, consent-on-file flag, and status. `findHospitalPatientDuplicates()` is a real,
   tested, **advisory-only** duplicate check (same first/last name + date of birth) — it never blocks registration,
   because two real patients can legitimately share both. The registration dialog
   (`src/app/app/hospital/patients/patient-registration-dialog.tsx`) now calls this check via a `useActionState`
   button before submit and shows any matches inline; the actual submit still goes straight to
   `createPatientAction` whether or not a check was run, so registration itself is still never blocked.
3. **Appointments** — provider/department scheduling with a transactional overlap check
   (`assertProviderAvailable`) that rejects a new or edited appointment whose time window overlaps another active
   appointment for the same provider. Check-in, cancellation (with reason), and no-show are explicit state
   transitions, not arbitrary status edits.
4. **Encounters** — outpatient/inpatient/emergency visits with an append-only vitals history
   (`HospitalVitals`, one new row per observation, never edited), clinical notes that become immutable once
   `signedAt` is set (a correction is a new `ADDENDUM`-type note referencing the original via `correctsNoteId`, never
   an edit to signed content), diagnoses, append-only care-plan entries, referrals, and an explicit disposition set
   only when the encounter is closed.
5. **Admissions, wards, and beds** — admission claims a bed inside a `db.$transaction` using the same
   `updateMany({ where: { status: "AVAILABLE" } })`-with-count-check pattern Hotel uses for room check-in, so two
   concurrent admissions into the same bed can never both succeed. Transfers release the old bed, claim the new one,
   and record an append-only `HospitalBedTransfer` row. Discharge closes the admission, the encounter, and frees the
   bed in one transaction.
6. **Laboratory** — a test catalogue, orders with one line item per test, a specimen/result/verification status
   workflow, and abnormal flags. A verified result (`verifiedAt` set) can never be edited — `enterHospitalLabResult`
   throws `HospitalStateError` if called against a verified item; a correction always calls
   `correctHospitalLabResult`, which inserts a **new** `HospitalLabResult` row with `supersedesResultId` pointing at
   the row it corrects. The prior verified row's `value` is never touched — see the "immutable clinical records"
   integration test for a direct database assertion of this. Entry (`hospital.lab.enter`) and verification
   (`hospital.lab.verify`) are separate permissions (see "Permissions and roles"), and `verifyHospitalLabResult`
   additionally enforces a configurable maker-checker rule: when `HospitalSettings.labImagingMakerCheckerEnforced`
   is true (the default), the person who entered a result cannot also verify it, checked by comparing
   `enteredById`/`verifiedById` — a role-level permission split alone doesn't stop this in a small clinic where one
   role (e.g. Laboratory Scientist) legitimately holds both permissions, so the actor-identity check is the real
   enforcement, exactly like `HrTerminationRequest`'s maker-checker for terminations. A verifier who is not ready to
   confirm a result can `rejectHospitalLabResult` it instead of verifying: this reopens the order item for a fresh
   entry (never mutates or deletes the rejected row) and requires a reason. Both `verifyHospitalLabResult` and
   `rejectHospitalLabResult` use a conditional `updateMany` (not a plain `update`) so two concurrent verify/reject
   attempts on the same result can never both succeed. Every entry, verification, rejection, and correction writes a
   focused `logAuditEvent` row (`lab_result.entered` / `.verified` / `.rejected` / `.corrected`) inside the same
   transaction as the mutation.
7. **Imaging** — the same order → schedule → finding → verify → correct-by-supersession pattern as laboratory, now
   with the identical `hospital.imaging.enter`/`hospital.imaging.verify` split, maker-checker enforcement, rejection
   workflow, concurrency-safe conditional updates, and audit events as laboratory (`imaging_finding.*` actions).
   `enterHospitalImagingFinding` also now blocks re-entry once the order's current finding is verified (parity with
   lab's item-status guard — previously it had no such check and could silently insert an orphaned second finding).
   `externalAccessionNumber` and `externalSystemReference` are the explicit, deliberately opaque boundary to an
   outside PACS/imaging system; this schema stores no DICOM or other binary imaging payload anywhere.
8. **Medication orders** — `HospitalMedicationOrder` is a Hospital-owned, versioned contract
   (`contractVersion: Int`). The service layer never reads or writes a Pharmacy table — there is no foreign key,
   Prisma relation, or service call into anything Pharmacy owns anywhere in this branch.
   `externalDispenseReference` is a plain nullable string field a future integration is expected to populate with
   its own dispensing-record identifier; until then it simply records manual dispensing reference text if a clinic
   enters one by hand. This matches `docs/PHARMACY_AND_HOSPITAL_ROADMAP.md`'s "Medication orders will cross into
   Pharmacy through a versioned prescription/dispensing contract." The clinical-upgrades tranche
   (this document's "Clinical upgrades tranche" section below) deliberately does not build that connection — it only
   documents that the eventual contract must also be **idempotent**: whichever side initiates the cross-module call
   needs to include a client-generated request id so a retried call (e.g. after a timeout) applies once, not twice.
   No such request-id field or call exists yet on either side; this is a documented requirement for whoever builds
   the real integration, not a delivered mechanism.
9. **Billing** — service charges, invoices with line items, `Decimal(12,2)` money throughout (never JS floating
   point), payments, void (only permitted before any payment is recorded), and insurance claims.
   `recordHospitalPayment` recomputes the invoice's paid-to-date total and validates the new payment against the
   *current* balance inside the same `db.$transaction` used to insert the payment row, so two concurrent payments
   that would together overpay an invoice can never both succeed — the same discipline Accounting's
   `recordInvoicePayment` uses.
10. **Nursing, alerts, referrals, consent, attachments** — nursing tasks with an assignment/status lifecycle;
    active/resolved clinical alerts; referrals with a status lifecycle; append-only consent records (a withdrawn
    consent is recorded via `revokedAt`, never deleted); and reference-only attachment metadata
    (`externalReference`, no binary file storage — the same deliberate boundary as imaging).
11. **Settings** — per-facility MRN/encounter/appointment/admission/invoice/receipt numbering prefixes, currency,
    timezone, a result-verification-required flag, a bed-transfer-reason flag, and `retentionYears` policy metadata.
12. **Dashboard, navigation, RBAC, backups** — a real `getHospitalSummary()`-backed dashboard widget and overview
    page (not a static mock), a full 13-item sidebar navigation tree, 13 least-privilege `hospital.*` permissions
    across 9 seeded roles, and inclusion in the active-module JSON/Excel backup and merge-restore system via the
    same generic `Hospital`-prefix auto-discovery every other module uses (`src/lib/backup/scopes.ts`,
    `src/lib/backup/tenant-backup.ts`) — no bespoke backup code was needed.

## Safety invariants and where they're enforced

| Invariant | Enforcement |
|---|---|
| MRN uniqueness under concurrency | `@@unique([organizationId, mrn])` + `createWithUniqueRetry` |
| Appointment-number / encounter-number / admission-number / invoice-number / receipt-number uniqueness | Same pattern, one `@@unique` per number field |
| No provider double-booking | `assertProviderAvailable()` overlap query before create; DB-level race closed by `createWithUniqueRetry` retrying the whole create-with-fresh-count operation |
| No bed double occupancy | `db.$transaction` + `updateMany({ where: { status: "AVAILABLE" } })` count check, exactly like Hotel's room check-in |
| Verified lab/imaging results are immutable | Service layer throws `HospitalStateError` on any attempt to re-enter a result on a `VERIFIED` item; corrections only ever insert a new row via `supersedesResultId`/`supersedesFindingId` |
| Signed clinical notes are immutable | Service layer throws `HospitalStateError` on `signHospitalClinicalNote` for an already-signed note; content edits after signing are not exposed by any function |
| No destructive deletion of signed notes, verified results, finalized encounters, issued invoices, payments, consents, medication orders, or admissions | No `delete` call exists anywhere in `src/modules/hospital/service.ts` for any of these models — closing/voiding/cancelling/revoking are all status transitions on the existing row |
| Invoice/payment concurrency | `recordHospitalPayment` recomputes balance and validates inside one `db.$transaction` |
| Every record is traceable to who/when | Every mutating table carries an actor id field (`*ById`) populated from the authenticated `tenant.userId` in `src/app/app/hospital/actions.ts`, plus a timestamp; Server Actions additionally flow through the platform's shared `AuditLog` for cross-cutting audit trail, not a bespoke second log |
| Cross-tenant access | Every service function filters by `organizationId` on every read and write, verified per-record (not just on the initial list query) — see the tenant-isolation integration test |

## Permissions and roles

15 `hospital.*` permission keys (`view`, `facility.manage`, `patients.manage`, `appointments.manage`,
`encounters.manage`, `admissions.manage`, `lab.enter`, `lab.verify`, `imaging.enter`, `imaging.verify`,
`medications.manage`, `nursing.manage`, `billing.manage`, `reports.view`, `settings.manage`), added identically to
`src/lib/auth/permissions.ts` and `prisma/seed-data.ts` (the latter is a deliberate duplicate per that file's own
documented reason: it can't import the former's `server-only` module from a plain `tsx`/Vitest context). The
clinical-upgrades tranche replaced the original single `lab.manage`/`imaging.manage` keys with the `enter`/`verify`
split described above.

Nine least-privilege system roles, each holding only the `hospital.*` keys its job actually needs:

| Role | Key permissions |
|---|---|
| Hospital Administrator | all 15 `hospital.*` keys |
| Receptionist | patients, appointments |
| Doctor | patients, encounters, admissions, lab.enter, imaging.enter, medications, reports |
| Nurse | patients, encounters, admissions, nursing |
| Laboratory Scientist | lab.enter, lab.verify |
| Radiology Staff | imaging.enter, imaging.verify |
| Hospital Pharmacist | medications (the dispensing-integration boundary role) |
| Billing Officer | billing, reports |
| Records Officer | patients, reports |

Laboratory Scientist and Radiology Staff each hold both halves of their split (today's clinics run this as one
role), so maker-checker enforcement (see item 6/7 above) is what actually prevents self-verification for those
roles, not the permission split alone. Doctor only holds `lab.enter`/`imaging.enter` (ordering tests), not `verify`.

## Clinical upgrades tranche (branch `agent/claude-clinical-upgrades`)

Delivered on top of the scope above, in an isolated branch, without merging or deploying: the inline
duplicate-patient advisory (item 2), the `lab.enter`/`lab.verify` and `imaging.enter`/`imaging.verify` permission
split with maker-checker enforcement and a rejection workflow (items 6–7), and the "Permissions and roles" table
update. See `OPERATOR_HANDOFF.md`'s dated entry for this branch for exact files, the migration name, and validation
results. This tranche intentionally does not touch Pharmacy's tables or build the medication-order integration —
see item 8's note on the future idempotent contract requirement.

## Known gaps / follow-ups

- **No E2E/browser verification was performed on this branch.** No tenant login credentials were available in this
  session. `tsc`, ESLint, the full mocked unit suite, and a production build all pass; the real-Postgres integration
  suite could not be executed in this environment (no `TEST_DATABASE_URL` configured) — see
  `OPERATOR_HANDOFF.md`'s entry for this branch for the exact commands to run before merge.
- **Reports are operational summaries, not exportable/printable clinical or regulatory report formats** (e.g. no
  NHIA claim file format, no ICD-coded diagnosis export). This module records diagnoses as free text with an
  optional code field; it does not validate against any specific coding system.
- **A correction does not reset the order item's status.** After `correctHospitalLabResult`/
  `correctHospitalImagingFinding` inserts a new (unverified) row superseding a verified one, the parent
  `HospitalLabOrderItem`/imaging order status stays whatever it was (typically `VERIFIED`) rather than reopening for
  re-verification of the corrected value. This is a pre-existing characteristic of the correction-by-supersession
  design, not something this tranche changed; flagged for a future decision on whether a correction should also
  require re-verification.
- **`docs/PHARMACY_AND_HOSPITAL_ROADMAP.md`** existed only as an uncommitted draft in the shared working tree at the
  time the Hospital module's original branch was created from `origin/main`, so it was not part of that branch's
  history either. Whoever integrates this branch should still reconcile that document's "Hospital production
  boundary" section against the scope actually delivered across both branches.
