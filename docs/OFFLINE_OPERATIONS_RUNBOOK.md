# Offline PWA Operations Runbook and User Guide

## Deployment checklist

1. Keep every organization defaulted to offline disabled and the new-mutation kill switch active.
2. Apply the migration only after it passes against the disposable `rockfrost_test` database.
3. Verify TypeScript, ESLint, focused and full Vitest, Playwright, complete guarded integration, production build, editorial punctuation, and migration status.
4. Deploy to preview. Verify health, manifest validation, worker headers and scope, offline fallback, work-pack authorization, signed sync rejection, attachment limits, conflict responses, and logs.
5. Promote the same validated commit to production. Do not enable a customer tenant during deployment.
6. Use a dedicated production canary tenant and non-customer records for installed-browser acceptance.
7. Monitor production errors and sync latency for at least 15 minutes. Roll back on any trigger below.

## Controlled tenant rollout

1. In Organization settings, enable offline access for the canary organization with new mutations still disabled.
2. Select only the modules the tenant is authorized to use. Set a lease between 1 and 24 hours.
3. Register one browser, download bounded work packs, then restart the installed app with networking disabled.
4. Confirm the public shell, protected workspace unlock, snapshot timestamps, expiry labels, and no cross-user or cross-organization records.
5. Reconnect, confirm the lease and device renewal, then enable new mutations.
6. Demonstrate one operation from each enabled adapter, a duplicate replay, a dependency failure, permission removal, device revocation, storage quota refusal, attachment rejection, and protected version conflict.
7. Expand one organization at a time only while errors, conflicts, latency, and storage stay within the agreed baseline.

The kill switch stops new local mutations but preserves authorized replay of already queued work. To stop all access, first review pending work, revoke devices, then disable offline access.

## Installation and daily use

Chromium desktop and Android users may choose the in-app Install action or the browser installation menu. On supported iPhone and iPad Safari, choose Share, then Add to Home Screen. Complete an authenticated online load and download the needed work packs before relying on offline mode.

The account Sync Center shows device authorization, lease expiry, storage usage, downloaded work packs, pending actions, conflicts, attempts, retry controls, data clearing, device removal, and the optional platform biometric or device-PIN lock.

Status meanings:

- Online: server access is available.
- Offline: the server cannot confirm actions.
- Synchronizing: a signed batch is in progress.
- Partially synchronized: some work is still pending.
- Conflict requires attention: a protected server record changed.
- Sync failed: retryable transport failure or permanent rejection needs review.
- Session expired: authorization ended and inaccessible local data was purged.
- Update available: the user may activate a fully installed replacement worker.

Offline payment declarations are recorded offline or awaiting synchronization. They are never shown as paid or verified. Stock counts do not move stock. Accounting and clinical captures are drafts only.

## Conflict response

Open the Conflict Center and compare local and server values, timestamps, workflow, and permitted resolutions. `KEEP_SERVER` discards the local mutation after the user confirms it. `MANAGER_REVIEW` preserves the conflict and writes an audit event. There is no general client-wins option for money, stock, assignments, approvals, periods, journals, invoices, payroll, billing, prescriptions, dispensing, laboratory or imaging results, clinical records, or occupancy.

## Rollback triggers

- Any cross-tenant or cross-user exposure
- Duplicate financial, attendance-period, payment-period, or stock events
- A protected conflict overwritten automatically
- Invalid-signature or revoked-device requests accepted
- Service-worker update preventing online startup or offline restart
- Production sync error rate above 2 percent for 15 minutes
- P50 sync latency more than twice the established canary baseline for 15 minutes
- Unbounded retries, storage growth, or attachment retention

Disable new mutations first. Roll back the application artifact through Vercel while leaving idempotency, conflict, attachment, and audit ledgers intact. Keep compatible queued browser data for review. Do not clear user devices as a blanket rollback step.

## Disaster recovery

The production database and audit history remain authoritative. Browser data is never a backup. After server recovery:

1. Keep new offline capture disabled.
2. Restore and verify the approved database recovery point under `docs/BACKUP_AND_RECOVERY.md`.
3. Verify migrations, health, memberships, subscriptions, device revocation state, and error logs.
4. Replay one canary device with a single non-financial draft.
5. Replay idempotency and protected-conflict canaries.
6. Review every conflict and permanently rejected item before widening replay.
7. If idempotency cannot be proven, retain the operation for manual reconciliation and never force it through.

Expired staged attachments may be deleted. Consumed staging blobs are removed after 24 hours. Do not delete mutation or audit records needed to prove whether a financial or stock action ran.
