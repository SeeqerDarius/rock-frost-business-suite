# Offline PWA Operations Runbook

## Progressive rollout

1. Deploy with every organization defaulting to offline disabled and the mutation kill switch active.
2. Verify `/manifest.webmanifest`, `/sw.js`, `/offline`, `/api/offline/devices`, `/api/offline/sync`, and `/api/health` in the deployed artifact.
3. Enable read-only access for an internal test organization and keep new mutations disabled.
4. Verify installation, browser restart while offline, lease expiry, logout purge, organization isolation, and device revocation.
5. Enable `pos` and new mutations for the test organization only. Create a real open register online before disconnecting.
6. Demonstrate one applied replay, one duplicate replay, one stock conflict, one stale-session conflict, and one permission revocation.
7. Expand tenant-by-tenant only after error logs, conflict volume, latency, and storage use remain within the agreed baseline.

## Kill switch

In Organization settings, turn off “Allow new offline mutations.” Existing pending operations remain in IndexedDB and the sync endpoint continues to process authorized replay. To stop all access, revoke devices and disable offline access after pending work has been reviewed.

## Rollback triggers

- Any cross-tenant or cross-user local data exposure
- Duplicate financial or stock records
- A protected conflict being overwritten automatically
- Service-worker update preventing online app startup
- Sync error rate above 2 percent for 15 minutes
- Unbounded retry, storage growth, or attachment retention

Rollback the deployment through the hosting provider, leave server idempotency ledgers intact, and keep the previous worker cache available until clients activate a known-good version. Do not delete pending browser data during rollback. Disable new mutations first, then allow safe replay through the compatible endpoint.

## Disaster recovery

The server database and audit ledger remain authoritative. A browser is never a backup source of truth. After server recovery, keep mutation capture disabled, restore the last verified database state, verify migrations and health, then replay a small canary device outbox. Review every conflict before widening replay. If an operation cannot be proven idempotent, retain it for manual reconciliation rather than forcing it through.

## Installation

On Chromium desktop or Android, use the in-app Install action or the browser install menu. On supported iOS Safari, use Share, then Add to Home Screen. Complete one authenticated online load before relying on the offline fallback. The Sync Center under the account menu shows authorization, storage, and pending work.
