# UI/UX quality audit: 2026-08-25

## Scope

A batch of user-reported issues covering manual-input fields that should be
selects, missing loading/success feedback, Pharmacy patient management, a
database-ID leak in entity pickers, the repeating cookie-consent banner,
confusing Dispensing form placeholder copy, and a manually-typed payment
method field. Investigated with read-only research agents before making any
change, then fixed by pattern where the same bug class repeated across
modules. Two additional production crashes (service-layer domain errors
reaching Next.js's generic error page instead of the form) were reported
mid-fix and are covered here as well.

## Corrections

### Pharmacy patients: could not be edited, and Notes was silently dropped

- `src/modules/pharmacy/service.ts`: added `updatePatient(organizationId, id, data)`,
  scoped by `{ where: { id, organizationId } }` so a patient id from another
  tenant 404s instead of being edited (same pattern as CRM's `updateContact`).
- `src/app/app/pharmacy/actions.ts`: replaced `addPatient` with `upsertPatient`,
  which creates or updates depending on whether a hidden `id` field is present,
  the same upsert-dialog pattern already used by CRM contacts.
- `src/app/app/pharmacy/patients/page.tsx`: rewritten with a shared
  `PatientFields` component, a per-row Edit dialog, a Sex select
  (Male/Female/Other) in place of a free-text input, `notes`/`allergies`
  upgraded to `Textarea`, and required-field asterisks.
- Root cause of the Notes bug: `notes: shortText.optional()` still ran a blank
  submitted `""` through `shortText`'s `.min(1)`, failing the *entire* form
  parse (not just that field). `Object.fromEntries(formData)` produces `""`
  for an empty input, never `undefined`, so `.optional()` alone never
  triggers. Fixed at the root by adding `optionalShortText`, `optionalLongText`,
  `optionalEmail`, and `optionalCoercedDate` to `src/lib/validation.ts`
  (`z.preprocess` blank/whitespace-only strings to `undefined` first) and
  applying them across every optional field in Pharmacy's Server Actions.
  The same latent bug affected `sex`, `dateOfBirth`, `phone`, `email`, `address`,
  `allergies`, plus similar fields in `addSupplier`, `addBatch`, `addPrescriber`,
  `addPrescription` (`clinicalNotes` also upgraded to `Textarea`), and
  `completeDispensing`. Eleven other action files outside Pharmacy share the
  same `shortText.optional()`/`email.optional()` pattern and were flagged as a
  separate follow-up rather than changed in this pass.

### Database ID leaking into closed select triggers

Base UI's `<Select>` only reads a `<SelectValue>`'s label via an `items`
prop passed to the `<Select>` root; without it, once a value is selected the
closed trigger falls back to printing the raw stored value: a database id
for every entity picker. Added `items={...}` (an `{id: label}` map) to every
affected select:

- `src/app/app/pharmacy/prescriptions/page.tsx` (patient, prescriber, medicine)
- `src/app/app/pharmacy/dispensing/page.tsx` (patient, prescription, medicine, prescription line)
- `src/app/app/pharmacy/stock/page.tsx` (medicine, supplier, batch status)
- `src/app/app/pharmacy/medicines/page.tsx` (medicine class)
- `src/app/app/(overview)/organization/backups/backup-controls.tsx` (backup scope)
- `src/app/app/(overview)/organization/settings/page.tsx` (theme, backup frequency)

Modules using a plain native `<select>` (e.g. School, Hostel, Hospital) were
never affected: the browser always renders the selected `<option>`'s text
regardless of any wrapper prop.

### Service-layer domain errors crashing to Next.js's generic error page

Reported live in production while this audit was underway: submitting the
Stock "Receive batch" form with an already-expired expiry date, and
completing a Dispensing sale that needed a prescription, both crashed with an
unhandled request error instead of showing the (already user-safe) rejection
message. Every Pharmacy Server Action called its service function directly,
with no `try`/`catch` around calls that can throw `PharmacyStockError`,
`PharmacyNotFoundError`, `PharmacyPrescriptionRequiredError`, or
`PharmacyWorkflowError`. Added a shared `runOrRedirect()` helper in
`src/app/app/pharmacy/actions.ts` that catches those four error classes and
redirects back to the originating page with `?error=<message>`, applied to
all twelve call sites that can throw. Added `src/app/app/pharmacy/status-banner.tsx`
(a shared `PharmacyStatusBanner`) and wired it into every Pharmacy page so the
message is actually visible instead of a silent redirect.

### Dispensing form: confusing placeholders, free-text payment method

- "OTC/optional" (Prescription, Prescription line) and "Walk-in/optional"
  (Patient) were real, working optional-select placeholders with unclear
  copy, not bugs. Reworded to "None (over-the-counter sale)" and "Walk-in
  (no patient on file)".
- Payment method was a free-text `<Input>` on a field with no schema
  constraint. Converted to a `<Select>` (Cash/Card/Mobile money/Insurance/Other),
  matching the fixed set POS already uses for its own (correctly-implemented)
  payment method field. Zod schema updated to a blank-string-safe
  `optionalEnum(...)` restricted to the same five values.

### Cookie consent banner reappearing across www/app/admin

`serializeCookieConsent()` never set a `Domain` attribute, so the consent
cookie was implicitly host-only even though `docs/COMPLIANCE_AND_ASSURANCE.md`
already documented "applies site-wide" as the intent: a visitor accepting on
`www.rockfrostgroup.com` was asked again on `app.rockfrostgroup.com`. Added
`Domain=.rockfrostgroup.com` whenever the current hostname is one of the three
production surfaces (never on localhost or a preview deployment, where it
would make the browser reject the cookie outright). Also fixed a separate SSR
flash: `ConsentManagedAnalytics`'s `getServerSnapshot` was hardcoded to
`() => null`, so a returning visitor's already-accepted preference was
briefly ignored on first paint. `src/app/layout.tsx` now reads the consent
cookie server-side and passes it down as `initialConsent`.

### Other manual-input-to-select conversions

- `src/app/app/school/students/page.tsx`: Gender was a free-text `TextField`;
  replaced with the module's existing `SelectField` (Male/Female/Other).
- `src/app/app/hostel/buildings/page.tsx`: Gender policy was a free-text
  `Input` with a `"Male, Female, Mixed"` placeholder as the only guidance;
  replaced with a native select in both the create and edit dialogs.

### Loading state and required-field markers (shared components)

- `src/components/forms/entity-dialog.tsx`: the shared submit button used by
  every module's create/edit dialogs now shows a spinner and disables itself
  while the form action is pending (`useFormStatus`), instead of giving no
  feedback between click and redirect.
- `src/components/ui/label.tsx`: added an opt-in `required` prop that renders
  a red asterisk; applied to every required field touched in this pass.
  Existing `<Label>` usage elsewhere is unaffected (the prop defaults to
  falsy).

### Confirmed correct: no change needed

- POS payment method (`src/app/app/pos/sell/sale-cart.tsx`) is already a
  proper `<select>` (Cash/Card/Mobile money/Other) matching the
  `PosPaymentMethod` Prisma enum and its Zod schema exactly.
- POS barcode scanning works via a plain text input plus an Enter-keydown
  handler, a standard keyboard-wedge pattern compatible with any USB/Bluetooth
  barcode scanner that types the code and presses Enter. No cash drawer or
  card-reader/payment-terminal integration exists anywhere in the codebase;
  that remains a real capability gap, not something silently patched in this
  pass.

### Addendum (same day, follow-up requests): Prescriber management and a receipt

Live follow-up on this same audit surfaced three more items, addressed the
same day - see the `Prescriber management`/`Receipt printing` entry in
`OPERATOR_HANDOFF.md` for the full writeup:

- Prescribers had create-only, no list or edit - fixed with the same
  list-plus-edit-dialog pattern as Patients.
- A walk-in with a paper prescription from an unregistered patient or an
  outside prescriber had no path through the New Prescription form without
  first leaving it to register them - fixed with an inline "+ New
  patient"/"+ New prescriber" option that reveals quick-add fields in place.
- The "no receipt printer... exists anywhere in the codebase" finding above
  is now specifically about POS; Pharmacy Dispensing gained a printable
  receipt (a plain browser print view, no PDF generation or physical printer
  integration) reachable from a "Receipt" button on each completed dispense.

Validated separately from the numbers below - see the same-day
`OPERATOR_HANDOFF.md` entry for this addendum's own test/lint/build results
and production deploy verification.

## Verification

- `npx tsc --noEmit`: passed.
- `npm run lint`: passed, zero warnings.
- `npm run test`: 664/664 passed across 95 files, including new coverage for
  `optionalShortText`/`optionalLongText`/`optionalEmail`/`optionalCoercedDate`,
  the `updatePatient`/`upsertPatient` IDOR-safe pattern, the `runOrRedirect`
  error-routing helper, and the cookie-consent domain-scoping logic.
- `npm run build`: passed.
