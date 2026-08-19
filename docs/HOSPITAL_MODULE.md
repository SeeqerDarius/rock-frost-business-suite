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
   because two real patients can legitimately share both. It is not yet wired into the registration form's UI as an
   inline warning; see "Known gaps" below.
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
   integration test for a direct database assertion of this.
7. **Imaging** — the same order → schedule → finding → verify → correct-by-supersession pattern as laboratory.
   `externalAccessionNumber` and `externalSystemReference` are the explicit, deliberately opaque boundary to an
   outside PACS/imaging system; this schema stores no DICOM or other binary imaging payload anywhere.
8. **Medication orders** — `HospitalMedicationOrder` is a Hospital-owned, versioned contract
   (`contractVersion: Int`). The service layer never reads or writes a Pharmacy table — there is no foreign key,
   Prisma relation, or service call into anything Pharmacy owns anywhere in this branch.
   `externalDispenseReference` is a plain nullable string field Codex's Pharmacy branch is expected to populate with
   its own dispensing-record identifier after both branches merge; until then it simply records manual dispensing
   reference text if a clinic enters one by hand. This matches `docs/PHARMACY_AND_HOSPITAL_ROADMAP.md`'s "Medication
   orders will cross into Pharmacy through a versioned prescription/dispensing contract."
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

13 `hospital.*` permission keys (`view`, `facility.manage`, `patients.manage`, `appointments.manage`,
`encounters.manage`, `admissions.manage`, `lab.manage`, `imaging.manage`, `medications.manage`, `nursing.manage`,
`billing.manage`, `reports.view`, `settings.manage`), added identically to `src/lib/auth/permissions.ts` and
`prisma/seed-data.ts` (the latter is a deliberate duplicate per that file's own documented reason: it can't import
the former's `server-only` module from a plain `tsx`/Vitest context).

Nine least-privilege system roles, each holding only the `hospital.*` keys its job actually needs:

| Role | Key permissions |
|---|---|
| Hospital Administrator | all 13 `hospital.*` keys |
| Receptionist | patients, appointments |
| Doctor | patients, encounters, admissions, lab, imaging, medications, reports |
| Nurse | patients, encounters, admissions, nursing |
| Laboratory Scientist | lab |
| Radiology Staff | imaging |
| Hospital Pharmacist | medications (the dispensing-integration boundary role) |
| Billing Officer | billing, reports |
| Records Officer | patients, reports |

## Known gaps / follow-ups

- **Duplicate-patient detection is not surfaced inline in the registration form.** `findHospitalPatientDuplicates()`
  is real, tested, and safe to call, but the New Patient dialog doesn't yet call it client-side and show a warning
  before submit. Registration itself is never blocked by it either way, so this is a UX polish gap, not a data-
  integrity gap.
- **No E2E/browser verification was performed on this branch.** No tenant login credentials were available in this
  session. `tsc`, ESLint, the full mocked unit suite, and a production build all pass; the real-Postgres integration
  suite could not be executed in this environment (no `TEST_DATABASE_URL` configured) — see
  `OPERATOR_HANDOFF.md`'s entry for this branch for the exact commands to run before merge.
- **Reports are operational summaries, not exportable/printable clinical or regulatory report formats** (e.g. no
  NHIA claim file format, no ICD-coded diagnosis export). This module records diagnoses as free text with an
  optional code field; it does not validate against any specific coding system.
- **No dedicated `hospital.lab.verify`/`hospital.imaging.verify` permission split.** Entry and verification of a
  result both currently require `hospital.lab.manage` / `hospital.imaging.manage` — a narrower two-person-integrity
  model (one role enters, a different role verifies) would need a new permission key and is a reasonable future
  hardening pass, not something the task brief explicitly required.
- **`docs/PHARMACY_AND_HOSPITAL_ROADMAP.md`** existed only as an uncommitted draft in the shared working tree at the
  time this branch was created from `origin/main`, so it is not part of this branch's history. Whoever integrates
  this branch should reconcile that document's "Hospital production boundary" section against the scope actually
  delivered here.
