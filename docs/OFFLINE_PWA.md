# Offline Progressive Web App

## Current implementation status

The browser PWA rollout is in progress and is not yet a complete offline product. The current implementation provides an installable manifest, a controlled service-worker lifecycle, a public offline fallback, tenant-and-user-partitioned IndexedDB, registered browser devices, organization feature flags, a Sync Center, and a session-authenticated synchronization API. POS sales are the first connected mutation type. All other mutation types remain unavailable until their module-specific adapters and conflict tests ship.

Do not describe an action as posted, paid, verified, approved, reconciled, or otherwise server-confirmed until its synchronization response is authoritative.

## Cache policy

| Resource category | Policy | Reason |
| --- | --- | --- |
| Service worker | Network, never HTTP-cached | Updates must be checked on every registration. |
| Manifest and icons | Cache first in the versioned shell cache | Public, immutable enough for offline installation UI. |
| Offline fallback | Cache first after installation | Provides a safe restart target without connectivity. |
| Authenticated HTML and React Server Component responses | Network only | Prevents shared CacheStorage from retaining personalized or cross-tenant content. |
| API and mutation requests | Network only | Server authorization and authoritative state must remain current. |
| Workspace identity, permissions, module navigation, and future work packs | IndexedDB, partitioned by organization and user | Keeps operational data out of shared CacheStorage and supports targeted purge. |

## Service-worker lifecycle and rollback

The worker precaches the public shell during installation. A new worker remains waiting while the existing worker continues controlling the app. The UI exposes an update action which sends `ACTIVATE_UPDATE`; only then does the new worker call `skipWaiting`. Failed or redundant installations are surfaced as an offline-support error. Activation removes older Rock Frost shell-cache versions and claims clients. The service-worker response is served with `no-cache, no-store` and a restricted CSP.

## Local storage boundaries

The IndexedDB database is versioned and contains separate stores for workspace snapshots, offline operations, and metadata. Workspace records use an `organizationId:userId` partition key. Operations also carry organization, user, module, entity, device, idempotency, base-version, schema-version, attachment, and dependency fields.

The current browser storage is not encrypted at rest. Browser origin isolation reduces casual exposure but does not protect a compromised operating-system account, malicious browser extension, XSS, device administrator, or a user who can inspect their own browser profile. Authentication secrets, payment credentials, TOTP secrets, and unrestricted clinical data must never be stored there. Offline leases currently expire workspace snapshots after 12 hours.

Signing out invokes a user-scoped IndexedDB purge before the NextAuth sign-out request. A user may clear local data or revoke the current registered browser in the Sync Center. The synchronization endpoint rechecks the active session, membership, browser device, module subscription/access, module permission, payload, dependency order, and idempotency ownership. Role-change polling, remote-session-revocation push purge, organization-switch purge, attachments, and non-POS conflict interfaces remain required.

## Synchronization API

`POST /api/offline/sync` accepts at most 100 operations and a 1 MB request. Requests must be same-origin and use the current authenticated session. One request may contain operations for only one registered browser device. POS replays delegate to the existing transactional `createSale` service, which revalidates register state, catalog references, payments, current stock, and the organization-scoped request identifier. Applied, rejected, and conflicted outcomes are persisted and audited. Dependencies must already be applied or become applied earlier in the submitted batch; failed, missing, and cyclic dependencies do not run.

`POST /api/offline/devices` registers or refreshes the current browser only when the organization has explicitly enabled offline access for at least one module available to the user. `DELETE /api/offline/devices` revokes the current user-owned installation. The local authorization record is not an authentication secret and cannot substitute for a live session during synchronization.

## Retention

Workspace snapshots expire at the offline lease boundary, currently configurable from 1 to 24 hours. Applied POS operations are removed locally after the authoritative response. Rejected and conflicted operations remain visible for review. Server mutation and audit ledgers are retained under the organization data-retention policy. Blob attachment retention is not implemented yet, so attachments are not accepted by the current POS adapter.

## Release acceptance

This work must not be called a complete offline PWA until the production installation has been reopened after a browser restart with the network disabled, queued records have replayed idempotently after reconnection, protected conflicts have been demonstrated, and tenant and user isolation have been verified in real browsers and guarded disposable PostgreSQL tests.
