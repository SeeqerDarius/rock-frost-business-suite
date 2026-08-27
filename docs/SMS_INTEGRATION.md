# SMS Integration (mNotify)

Rock Frost sends SMS through mNotify's Quick Bulk SMS API (`https://api.mnotify.com/api/sms/quick`, confirmed against the current v2.0 docs at https://developer.bms.africa). `src/lib/sms.ts` is the only place that calls the provider - every feature that needs to send an SMS goes through `sendSms()`, the same way every email goes through `src/lib/email.ts`'s `sendEmail()`.

## Status

**Phase 1: core sending capability.** `sendSms()`, fully tested (unit + real-Postgres integration).

**Phase 2: SMS as an additional 2FA method, alongside TOTP.** See "SMS one-time codes" below.

**Phase 3 (this doc's current scope): per-module transactional notifications** for Pharmacy, Hotel, Payroll, and Hospital. See "Per-module transactional notifications" below. The Support alert and the marketing tool are separate, later phases; update this doc as each one ships.

**Until `MNOTIFY_SENDER_ID` is registered and set, every send - including 2FA codes - degrades to a `console.warn` instead of reaching a phone.** SMS 2FA enrollment and login will complete the request/response flow correctly in this state, but no code actually arrives; treat this as inert until the sender ID is configured (see Configuration below).

## Configuration

- `MNOTIFY_API_KEY` - required. Passed as a query parameter on every request (`?key=...`), per mNotify's documented auth scheme - never as a header or body field.
- `MNOTIFY_SENDER_ID` - required. At most 11 characters; must be registered and approved in your mNotify account first (`POST /api/senderid/register`, then check status via `/api/senderid/status`) or sends will be rejected even with a valid key.

If either is unset, `sendSms()` degrades gracefully: it logs via `console.warn` and returns `{ ok: false, error: "SMS delivery is not configured yet." }` instead of throwing - the same contract `sendEmail()` already uses, so a caller's surrounding flow (e.g. completing a dispense, confirming a booking) never fails just because SMS isn't configured yet.

## Phone number format

mNotify expects the recipient in **local Ghana format** (`0XXXXXXXXX`, 10 digits) - every example in their current docs uses this form, not international `+233.../233...`. Every phone field in this app (`PharmacyPatient.phone`, `HotelGuest.phone`, `HrEmployee.phone`, `User.phone`, etc.) is free text with no format validation, so `sendSms()` always normalizes through `src/lib/phone.ts`'s `normalizeGhanaPhone()` first. A number that can't be normalized returns `{ ok: false, error: "Invalid recipient phone number." }` without ever reaching the provider or writing a log row.

## Delivery log, not the in-app Notification model

Every send (successful or failed) writes a row to `SmsMessage` - a purpose-built audit/dedup log, deliberately separate from the existing `Notification` model. `Notification` has no `channel` filter anywhere it's queried (`src/app/app/(overview)/notifications/page.tsx`), so reusing it for SMS would make every text sent to a patient/guest/employee (none of whom have a `userId`) show up as an org-wide in-app bell entry - a 50-recipient send would flood the bell with 50 entries. `NotificationChannel.SMS` stays intentionally unused for this reason.

`SmsMessage` fields: `to` (normalized), `body`, `purpose` (a short machine-readable code like `PHARMACY_PICKUP_READY`), `relatedType`/`relatedId` (optional - lets a caller ask "has an SMS with this purpose already gone out for this record" via the log, without adding a column to that record's own model - the Hospital appointment-reminder cron, once built, uses this to avoid double-texting on re-runs), `status` (`SENT`/`FAILED`), `providerResponse` (raw mNotify JSON, for debugging), `error`.

## OTP messages cost extra - only set `isOtp` for actual OTP sends

mNotify charges an additional per-campaign fee when `sms_type: "otp"` is included in the request, and explicitly warns against sending it for anything else: *"Do not include the sms_otp field in the payload unless the message blast is specifically for OTP purposes."* `sendSms()`'s `isOtp` argument controls this - it must only be `true` for 2FA-code sends, never for notifications or marketing.

## SMS one-time codes (2FA)

`src/lib/auth/sms-otp.ts` issues and consumes short-lived, hashed one-time codes backed by the `TwoFactorOtpChallenge` model, for three distinct purposes (`TwoFactorOtpPurpose`: `LOGIN`, `ENROLL_VERIFY_PHONE`, `DISABLE`) so a code issued for one can never be replayed against another:

- **Issuing** (`issueSmsOtpChallenge`) normalizes the phone, generates a random 6-digit code, stores only its bcrypt hash with a 5-minute `expiresAt`, and sends it via `sendSms()` with `isOtp: true` and `purpose: "2FA_<PURPOSE>"` (so it lands in the `SmsMessage` audit log too, alongside every other kind of SMS).
- **Consuming** (`consumeSmsOtpChallenge`) looks up the newest unconsumed, unexpired challenge for that user/purpose, fails closed once `attempts` reaches 5 (tracked on the challenge row itself, separate from the account-wide login lockout), and marks it `consumedAt` on success so it can never be reused - a wrong login code additionally increments the account's existing `failedLoginAttempts`/`lockedUntil` counters, exactly like a wrong TOTP code does.
- `User.twoFactorPhone` (the number 2FA codes are actually sent to) is set only once a code sent to it has been verified, and is deliberately independent of the general contact `phone` field - see `docs/DECISIONS.md`'s entry on this for why reusing `phone` would have been a real vulnerability, not just an inconsistency.

## Per-module transactional notifications

Four modules can text a party outside the organization when something completes, each gated by its own `smsNotificationsEnabled` flag on that module's settings (off by default) and its own template in `src/lib/sms-templates.ts`. None of these ever throw or block their surrounding operation - each fires only after its transaction has already committed, so a slow or failing SMS send can never roll back or delay real state (dispensing, a reservation, payroll, an appointment).

- **Pharmacy** (`PHARMACY_PICKUP_READY`): `dispense()`'s immediate-completion path and `approveControlledDispense()`'s completion path both call a shared `notifyPharmacyPickupReady()` after their transaction resolves. No-ops for a walk-in with no registered patient, since there's nowhere to send it.
- **Hotel** (`HOTEL_BOOKING_CONFIRMED`): `createHotelReservation()`, after the reservation is created. `HotelSettings` is scoped **per property**, not per organization (`propertyId @unique`) - a multi-property organization can turn this on for one property and off for another, and the check reads the specific property's own settings.
- **Payroll** (`PAYROLL_PAYSLIP_ISSUED`): `processRun()`, after the run's transaction commits - looping every payslip just created and preferring `HrEmployee.mobilePhone` over `phone` when both are set.
- **Hospital** (`HOSPITAL_APPT_REMINDER`): the only schedule-based trigger in this phase, not action-triggered - a new daily cron (`src/app/api/cron/appointment-reminders/route.ts`, `vercel.json`, `0 8 * * *`) calls `sendDueAppointmentReminders()`, which finds every `SCHEDULED` `HospitalAppointment` whose `scheduledStart` falls on the calendar day after the cron runs, at a facility with the setting on. `HospitalSettings` is scoped **per facility**, not per organization (`facilityId @unique`), same reasoning as Hotel. Deduped against the `SmsMessage` log (`relatedType: "HospitalAppointment"`) before each send, so a second sweep - deliberate re-run or an accidental double-fire - never double-texts the same appointment.

## Testing

- `test/phone.test.ts` - pure normalization table tests.
- `test/sms-templates.test.ts` - pure template-content tests for the four Phase 3 notification bodies.
- `test/appointment-reminders-cron.test.ts` - the same auth-check/success/failure shape as `test/trial-expiry-cron.test.ts`, mocked against `sendDueAppointmentReminders()`.
- `test/integration/sms/pharmacy-pickup-ready-sms.test.ts`, `hotel-booking-confirmed-sms.test.ts`, `payroll-payslip-issued-sms.test.ts`, `hospital-appointment-reminder-sms.test.ts` - real-Postgres suites proving each trigger fires exactly when it should (setting on + phone present), never fires when the setting is off or the phone is missing, and - for the Hospital cron - never double-texts on a second sweep.
- `test/sms.test.ts` - mocked-db suite (`npm run test`), mocks `fetch` and `@/lib/db`, covers the unconfigured/invalid-phone/success/provider-error/network-error branches and confirms the API key is sent as a query param (never in the body).
- `test/sms-otp.test.ts` - mocked-db suite covering issue/consume/attempt-limit/expiry/hashing for `TwoFactorOtpChallenge`.
- `test/nextauth-sms-2fa.test.ts` - exercises `authorize()`'s SMS branch directly. Note: this installed next-auth version's `CredentialsProvider()` factory doesn't preserve the app's `authorize()` as the provider's own `.authorize` property (that's hardcoded to a `() => null` stub) - the real function only survives under `.options.authorize`, confirmed by reading `node_modules/next-auth/providers/credentials.js`. Any future test that needs to call `authorize()` directly must go through `.options.authorize`, not `.authorize`.
- `test/auth-request-login-sms-code.test.ts` - covers `requestLoginSmsCode()`'s generic-response/lockout/leak-prevention behavior.
- `test/account-security-sms-2fa.test.ts` - covers the enrollment, disable-request, and disable actions in `account/security/actions.ts`.
- `test/integration/sms/sms-message.test.ts` - real-Postgres suite (`npm run test:integration`), proves `SmsMessage` rows persist correctly scoped to the sending organization, stay invisible cross-tenant, and cascade-delete with their organization. Only the network call to mNotify is mocked here; the database write is real.
- `test/integration/sms/two-factor-otp-challenge.test.ts` - real-Postgres suite proving the same for `TwoFactorOtpChallenge`: issue/consume, replay rejection, attempt-limit lockout, and cascade-delete on user removal.
