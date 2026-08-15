# Offline desktop and synchronization

## Status

The cloud synchronization foundation is implemented for the first controlled offline release. The desktop client is a separate deliverable under `apps/desktop/`. Offline support is not a general copy of the cloud database. The cloud remains authoritative and every device receives only the records and operations allowed for its tenant, user, role, subscription, and activated module set.

## Security model

1. A signed-in tenant user opens `/app/account/desktop` and creates a single-use activation code for selected supported modules.
2. The code is stored only as a SHA-256 hash, expires after ten minutes, and is atomically claimed once by `POST /api/desktop/activate`.
3. Activation returns a device bearer credential once. The server stores only its SHA-256 hash. The desktop must place the credential in the operating system credential store, never in SQLite, logs, source code, or plain-text configuration.
4. Every push, pull, conflict resolution, and deactivation request rechecks token expiry, device revocation, user status, membership status, organization status, current subscriptions, enabled modules, and current role permissions.
5. A successful connection renews the offline lease for 72 hours. The desktop must lock protected offline features when that lease expires. A device token expires after 30 days and then requires a new activation.
6. A user can activate at most five devices per organization. A revoked installation cannot reactivate itself with a new code.

The desktop never connects to Neon/PostgreSQL and never receives database credentials. It communicates only with the authenticated HTTPS API.

## Initial offline operations

| Module | Allowed offline create | Cloud validation on reconnect |
| --- | --- | --- |
| Fleet | Driver maintenance report | Vehicle remains tenant-owned and assigned when driver self-service is used |
| Fleet | Driver payment submission | Active driver, assigned vehicle, and assigned contract are rechecked; submission remains pending for online review |
| Installment | Field collection payment | Current staff ownership, account state, positive amount, balance, and receipt generation are rechecked atomically |
| Inventory | Receipt or stock-count adjustment | Tenant item and warehouse ownership plus non-negative stock rules are rechecked atomically |
| POS | Sale in an existing open session | Session ownership/status, register, stock, line values, and stock deduction are rechecked atomically |

The server generates authoritative record identifiers, receipts, and sale numbers. A desktop-generated identifier is only a local mapping key.

## Online-only safety boundary

The following remain online-only in the first release:

- Fleet payment approval, maintenance decisions, repairs, verification, and direct work-and-pay ledger posting.
- Installment payment editing or deletion, refunds, credits, account status, pricing, delivery, and reassignment.
- Inventory issues, transfers, absolute stock replacement, item management, warehouse management, and image upload.
- POS session opening or closing, refunds, register changes, and settings.
- Accounting posting, reconciliation, and approvals.
- Payroll finalization and payment.
- HR termination, reinstatement, and access suspension.
- Pharmacy dispensing and restricted-medicine activity.
- Hospital clinical, medication, laboratory, imaging, admission, billing, and consent decisions.

These operations are excluded because stale information, double application, or silent conflict resolution could create financial, employment, inventory, or patient-safety harm.

## API contract

All responses containing tenant or device data use `Cache-Control: private, no-store`.

### Activation

`POST /api/desktop/activate` accepts the single-use activation code, installation identifier, device name, supported desktop platform, and requested module keys. Requested keys are intersected with the code, subscription, module, and role scope. The response returns the one-time device token, device ID, organization and user display metadata, token expiry, offline lease expiry, and final module keys. The organization identifier populates the defense-in-depth assertion on queued mutations; the server still derives the authoritative tenant from the device token.

### Push

`POST /api/desktop/sync/push` accepts at most 50 mutations per batch and 64 KiB per payload. Each mutation contains a UUID `mutationId`, checked `organizationId`, `moduleKey`, `entityType`, local `entityId`, `CREATE` operation, zero `baseVersion`, `changedAt`, and a schema-validated payload.

`OfflineMutation` has a unique `(organizationId, mutationId)` constraint. A retry returns the stored outcome and never reapplies an already completed mutation. The server creates the ledger entry before touching a business record. If a process stops while a record is marked `PROCESSING`, automatic replay remains blocked to prefer manual recovery over duplicating a payment, sale, or stock movement.

### Pull

`GET /api/desktop/sync/pull` returns a bounded full reference snapshot and a renewed offline lease. Collections are capped at 500 rows and return `truncated: true` when a complete safe snapshot cannot be supplied. A client must not offer an incomplete workflow when `truncated` is true. Fleet driver snapshots are limited to assigned vehicles. Installment accounts retain the staff ownership scope. POS-only users receive stock only for warehouses linked to their own open register sessions and do not receive item cost prices.

### Conflicts and deactivation

`POST /api/desktop/sync/conflicts/{conflictId}/resolve` currently allows only `KEEP_CLOUD`. Conflict push results include the server conflict identifier and allowed resolutions so the desktop can submit that explicit choice. Financial and stock conflicts never use silent last-write-wins. The user must refresh cloud state and create a new local operation when the server later permits a retry.

`POST /api/desktop/deactivate` revokes the calling device. Users can also revoke installations from `/app/account/desktop`. The desktop must lock and remove protected cached business data when it receives a revocation.

## Storage, conflicts, and operations

- Local SQLite is a device cache and durable outbound queue, not a second authoritative business database.
- Local business payloads must be encrypted at rest. The encryption key must come from the operating system credential store.
- Financial and stock records display Pending sync until the server returns an applied result.
- Desktop logs must not contain tokens, passwords, customer payloads, medical data, or full synchronization bodies.
- Device revocation and conflict actions create tenant-scoped audit events.
- Migration `20260815020000_add_offline_sync_foundation` adds device, activation-code, idempotency-ledger, and conflict tables.

## Remaining launch requirements

The offline product cannot be offered to customers until the integrated desktop package passes Windows installer testing, local encryption and credential-store verification, signed update configuration, online-to-offline workflow tests, loss-of-network tests, conflict tests, stolen-device tests, and a controlled customer pilot. Code-signing certificates and the final desktop update channel are external operational requirements and must not be claimed until configured and verified.
