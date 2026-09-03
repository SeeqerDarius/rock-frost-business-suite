# School student profile and digital ID

## Scope and ownership

The student profile is the School module's tenant-scoped record view. Hostel
continues to own buildings, rooms, beds, allocations, wardens, and Hostel fee
records. School reads that data only through
`src/modules/school/hostel-integration.ts`, after the page has established both
School and Hostel permissions.

Profile sections are deep-linkable with the `section` query parameter. The
Hostel section is omitted unless Hostel is enabled and the user holds both
required permissions. Teacher class assignments are enforced in the profile
service, not only in navigation.

## Privacy boundaries

The base profile query explicitly omits blood group, medical notes, allergies,
and accessibility notes. Those columns are queried separately only for a user
with `school.student_medical.view`. Academic results, financial records,
attendance, conduct, and digital ID records are likewise fetched only when the
corresponding permission is present.

The public ID verifier does not query or expose the live student record. It
returns the policy-approved identity snapshot stored when the card was issued.
Medical, finance, conduct, and unrestricted guardian information are never
encoded in the QR payload. Revoked, expired, changed, or malformed tokens fail
closed.

## Digital ID lifecycle

Each card has a random opaque public identifier and an HMAC-signed token. Only
the token hash is stored. A new card revokes any previous active card for the
student. Reissue links the replacement to its predecessor. Issue, reissue,
revoke, and print operations store the acting user and append an audit event.

Card policy is configured per campus with validity duration and optional date
of birth and emergency-contact disclosure. The approved public snapshot is
immutable for the life of a card. Policy changes therefore require reissue.

## Financial definitions

- Billed: issued School invoices excluding draft and void records, net of
  discounts.
- Collected: confirmed, non-refunded School fee payments.
- Outstanding: billed less collected, floored at zero for the current view.
- Hostel billed and collected: calculated from Hostel-owned invoices and
  confirmed, non-refunded payments through the integration service.

Confirmed School payments continue to use the existing idempotent Accounting
posting path. This profile does not create a second journal entry.

## Query and operational limits

Attendance history is bounded to the 400 most recent records. Permission-bound
datasets are loaded concurrently. The profile does not perform per-row data
fetches. Public verification uses a unique indexed public identifier, and card
status and expiry are checked on every request.

## Remaining release gates

The feature must not be described as production-complete until the migration,
automated suites, production build, authenticated desktop and mobile checks,
QR verification, revocation, Hostel conditional visibility, role restrictions,
and post-deploy logs have all passed.
