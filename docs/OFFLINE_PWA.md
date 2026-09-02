# Offline Progressive Web App

## Current status

The browser offline platform is implemented behind organization and module feature flags. The previously released POS phase remains production-active only where an operator enables it. The expanded multi-module release candidate must pass the disposable-database, browser, build, deployment, and production acceptance gates before it can be called production-complete.

Server confirmation is authoritative. An offline action is never described as posted, paid, verified, approved, reconciled, dispensed, fulfilled, or finalized.

## Architecture and cache policy

The public service worker provides a versioned application shell. It never writes authenticated HTML, React Server Component responses, API responses, or tenant data to CacheStorage. Operational data lives in IndexedDB and is partitioned by organization, user, module, and device.

| Resource category | Policy | Reason |
| --- | --- | --- |
| Service worker | Network, no HTTP storage | Every registration checks for an update. |
| Manifest, icons, offline fallback | Precached in the versioned shell cache | Public restart shell and installation assets. |
| Next.js static chunks and fonts | Same-origin cache first after a successful response | Lets the public offline shell start after a browser restart. |
| Authenticated HTML and RSC responses | Network only | Prevents shared personalized or cross-tenant cache entries. |
| API and mutation responses | Network only | Current authorization and authoritative data are required. |
| Workspace snapshots, work packs, references, outbox, attachments, attempts, conflicts, device metadata | IndexedDB | Supports bounded partitioning, expiry, purge, and offline reopening. |

A replacement worker precaches its complete shell before installation succeeds. It waits until the user chooses Update, then receives `ACTIVATE_UPDATE`. A failed installation becomes redundant and the previously active worker remains in control. Activation deletes only older `rf-pwa-*` caches.

## Local data and security model

IndexedDB version 2 has stores for workspaces, operations, reference records, work packs, attachments, synchronization attempts, conflicts, and metadata. Every operation contains its globally unique ID, organization, user, device, module, entity, action, client timestamp, base server version, idempotency key, payload schema version, attachment references, and dependency IDs.

Browser storage is not a secure hardware vault. Origin isolation and an optional platform biometric or device-PIN WebAuthn gate reduce casual access, but they do not defeat a device administrator, a compromised operating-system account, malicious extensions, XSS, browser-profile extraction, or physical access to an unlocked browser. Authentication secrets, payment credentials, TOTP secrets, unrestricted clinical histories, and raw gateway data are prohibited.

Each browser generates an ECDSA P-256 signing key pair. The server stores only the public key. The private key remains inside the account-and-organization IndexedDB partition. Synchronization and attachment staging sign the timestamp and exact body. The server requires a current same-origin authenticated session and rejects stale timestamps, invalid signatures, expired leases, revoked devices, inactive memberships, removed subscriptions, and revoked permissions.

Signing out purges the user's stores. A rejected registration caused by revocation or access removal also purges the user partition. Organization switching uses separate keys. A device may be revoked from the Sync Center. Offline leases last 1 to 24 hours. The organization kill switch blocks new local mutations while retaining safe replay of work already queued.

## Work packs and module rules

Work packs are explicit downloads limited by record count and a 5 MB serialized response. They contain only the user's authorized subset and expire after 12 hours. Accounting data is read-only and timestamped. Pharmacy and Hospital downloads are minimized and visibly stale. Clinical finalization, dispensing, controlled-drug approval, verified laboratory or imaging results, diagnosis finalization, medication fulfilment, and room or bed occupancy changes remain online-only.

See `docs/OFFLINE_CAPABILITY_MATRIX.md` for the authoritative operation list.

## Synchronization API

`POST /api/offline/sync` accepts one signed browser-device batch, at most 100 operations and 1 MB. It authenticates the session, confirms active membership and device state, verifies the lease and ECDSA signature, checks module access and operation ownership, then evaluates dependencies. Missing, failed, or cyclic dependencies never execute.

POS delegates to the existing transactional sale service. Fleet driver declarations, fault reports, and owner maintenance decisions delegate to Fleet services. Inventory count lines, School attendance, and Hotel housekeeping delegate to their authoritative services. Accounting, Pharmacy, Hospital, Hostel, and other permitted safe captures become server-side `OfflineDraft` records that cannot enter posted or finalized states.

Every accepted operation has a tenant-scoped idempotency ledger. Protected version mismatches create an `OfflineConflict` with the local payload, cloud snapshot, timestamps, workflow, and allowed resolution choices. The Conflict Center permits keeping the authoritative server value or requesting manager review. It never offers unrestricted overwrite.

`POST /api/offline/attachments` accepts signed attachment staging before dependent replay. JPEG, PNG, WebP, and PDF files are limited to 5 MB and checked by MIME type and file signature. Successful operations remove local blobs. Server staging expires after seven days; consumed blobs are deleted opportunistically after 24 hours.

`GET /api/offline/work-packs` returns bounded no-store snapshots. `GET` and `POST /api/offline/conflicts` provide user-scoped review and permitted resolutions. `POST` and `DELETE /api/offline/devices` register, renew, and revoke browser installations.

## Storage, retry, and retention

Expired work packs and references are evicted before new writes. Capture fails closed when projected use exceeds 80 percent of the browser-reported quota. Applied operations and their local blobs are removed only after an authoritative response. Conflicts and permanent failures remain visible. Retryable failures use bounded exponential backoff capped at 60 seconds. Permanent validation, permission, revocation, and conflict outcomes are not retried forever. Web Locks serialize synchronization across tabs, and BroadcastChannel announces completion.

Server mutation, conflict, draft, and audit ledgers follow organization retention and deletion policy. A browser is never a backup or authoritative recovery source.

## Release acceptance

The implementation must not be called a complete production offline PWA until an installed production build is reopened after a real browser restart with networking disabled, authorized records are created and replayed idempotently after reconnection, a protected conflict is demonstrated without overwrite, and tenant and user isolation pass both real-browser and disposable-PostgreSQL tests.
