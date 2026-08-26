# SMS Integration (mNotify)

Rock Frost sends SMS through mNotify's Quick Bulk SMS API (`https://api.mnotify.com/api/sms/quick`, confirmed against the current v2.0 docs at https://developer.bms.africa). `src/lib/sms.ts` is the only place that calls the provider - every feature that needs to send an SMS goes through `sendSms()`, the same way every email goes through `src/lib/email.ts`'s `sendEmail()`.

## Status

**Phase 1 (this doc's current scope): core sending capability only.** `sendSms()` exists and is fully tested (unit + real-Postgres integration), but nothing calls it yet - no 2FA, no per-module notifications, no Support alert, no marketing tool. Those are separate, later phases; update this doc as each one ships.

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

## Testing

- `test/phone.test.ts` - pure normalization table tests.
- `test/sms.test.ts` - mocked-db suite (`npm run test`), mocks `fetch` and `@/lib/db`, covers the unconfigured/invalid-phone/success/provider-error/network-error branches and confirms the API key is sent as a query param (never in the body).
- `test/integration/sms/sms-message.test.ts` - real-Postgres suite (`npm run test:integration`), proves `SmsMessage` rows persist correctly scoped to the sending organization, stay invisible cross-tenant, and cascade-delete with their organization. Only the network call to mNotify is mocked here; the database write is real.
