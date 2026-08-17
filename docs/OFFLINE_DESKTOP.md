# Offline desktop and synchronization

## Status

The cloud synchronization foundation is implemented for the first controlled offline release. The desktop client is a separate deliverable under `apps/desktop/`. Offline support is not a general copy of the cloud database. The cloud remains authoritative and every device receives only the records and operations allowed for its tenant, user, role, subscription, and activated module set.

The first updater-enabled Windows package is version `0.2.0`. Version `0.1.1`
requires one final manual upgrade to `0.2.0`; subsequent releases can use the
authenticated in-app update flow.

Version `0.2.1` corrects the packaged startup guard. The guard is cancelled as
soon as React commits the activation, lock, or workspace screen, and it also
refuses to show a timeout error after the original startup marker has gone.

Version `0.2.2` fixes device activation itself. `SyncClient` stored WebView2's
native `fetch` as a bare function reference and called it as `this.fetchFn(...)`.
WebView2's `fetch` is receiver-sensitive: it only works when invoked with
`window`/`globalThis` as the receiver, and rejected the mis-bound call with
`Failed to execute 'fetch' on 'Window': Illegal invocation` before any network
request was attempted. Every field on the activation form (activation code,
selected modules, local passcode) was validated and correct; the failure was
entirely a client-side JavaScript binding defect, not a data problem. Because
the throw happened before `fetch` dispatched anything, no request reached
`POST /api/desktop/activate`, so the single-use activation code was never
checked and never consumed. The fix binds the default fetch function once, in
the constructor, to `globalThis`.

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
| POS | Register create/edit | `pos.registers.manage`; edits use optimistic concurrency (a stale `baseVersion` conflicts instead of overwriting) |
| POS | Session open/close | `pos.sessions.manage`; open requires no existing open session on the register, close requires the session is currently open |
| POS | Sale refund | `pos.sales.manage` (the same permission that authorizes creating a sale); the same atomic `COMPLETED -> REFUNDED` claim `refundSale()` already uses online prevents a duplicate refund even from two racing offline devices |
| POS | Receipt footer / sale-number-prefix settings | `pos.settings.manage`; optimistic concurrency on the underlying settings row |

The server generates authoritative record identifiers, receipts, and sale numbers. A desktop-generated identifier is only a local mapping key.

## Online-only safety boundary

Fleet, Installment, and Inventory remain scoped to the operations above; everything else in those three modules stays online-only, unchanged from the first release:

- Fleet payment approval, maintenance decisions, repairs, verification, and direct work-and-pay ledger posting.
- Installment payment editing or deletion, refunds, credits, account status, pricing, delivery, and reassignment.
- Inventory issues, transfers, absolute stock replacement, item management, warehouse management, and image upload.
- Accounting posting, reconciliation, and approvals.
- Payroll finalization and payment.
- HR termination, reinstatement, and access suspension.
- Pharmacy dispensing and restricted-medicine activity.
- Hospital clinical, medication, laboratory, imaging, admission, billing, and consent decisions.

**POS is a deliberate exception, not a relaxation of the underlying safety mechanism.** Every POS action, including register edits, session lifecycle, refunds, and settings, is offline-capable, reflecting a considered decision that the target field-operations use case needs full POS parity offline. This does not mean the desktop is trusted: every action still goes through the same ledger-first write and full server-side re-validation as every other offline mutation (see Push above), and a conflicting or now-invalid action (a refund attempted twice, a stale register edit) is rejected and surfaced to the user as a conflict to resolve when back online, never silently applied or overwritten. The other modules' operations remain excluded above because stale information, double application, or silent conflict resolution in those specific areas could create financial, employment, inventory, or patient-safety harm that this project has not (yet) taken through the same expansion.

## Server-side adapter architecture

`src/lib/offline-sync/adapters.ts` no longer contains per-entity-type business logic directly. It is a thin dispatcher over a registry (`src/lib/offline-sync/registry.ts`): each supported module registers its own handlers from `src/lib/offline-sync/modules/<module>.adapters.ts` (currently `fleet`, `installment`, `inventory`, `pos`), keyed by `(entityType, operation)`. A handler declares a coarse, payload-independent `checkPermission`, a `payloadSchema`, and an `apply` function that performs any payload-dependent checks and then calls the same service-layer function the web UI itself calls (for example `createFleetMaintenanceRequest` from `@/modules/fleet/service`) - the offline path never reimplements business logic, it re-validates and re-invokes it. Adding a new offline-capable action means adding one handler to the relevant module file (or a new module file for a new module), not editing `adapters.ts`.

`processOfflineMutation` in `service.ts` is unchanged by this: the ledger-first write, idempotency check, and conflict-on-error handling still wrap `applyOfflineMutation` exactly as before.

## Desktop client: POS

`apps/desktop/src/modules/pos/screens/PosModuleShell.tsx` is POS's real offline terminal, replacing the generic one-button demo view (`ModuleDetailView.tsx`) that Fleet, Installment, and Inventory still use. It has six tabs, all reading from one shared hook (`pos-data.ts`'s `usePosSnapshot`) over the decomposed cached rows so every tab reflects the same state without a manual refresh:

- **Overview** - register/session/sales counts and totals, and a pending-sync summary.
- **Registers** - list, create, and edit registers; edits carry the cached record's own version as `baseVersion` and surface a `STALE_VERSION` conflict on the next sync if it has moved.
- **Sell** - the terminal. A cart accepts either a catalog line (from the same `inventory.item`/`inventory.stock` rows a POS-only device already receives, see the Pull section) or a free-text line, matching `createSale`'s payload exactly. A non-authoritative `local-stock-overlay.ts` subtracts what has been rung up offline from the last-synced stock quantity for the low-stock hint only; it blocks nothing, and the real check remains `createSale`'s server-side stock validation at sync time.
- **Sales history** - lists cached sales and offers Refund on any `COMPLETED` sale not already queued for refund.
- **Reports** - read-only figures derived from the same cached rows the other tabs use; on a device that has not synced recently, these reflect only this device's own activity plus its last pull, not the whole organization.
- **Settings** - receipt footer and sale-number prefix, each with its own independent `baseVersion` (see below).

**A session must sync once before it can be sold against.** `openSession`/`closeSession`/`refundSale` are modeled as events with a client-generated correlation id (see the Push section); the server assigns the session's or sale's real id, which the device does not know until the next pull. `createSale` requires a real `sessionId`. The practical model this supports: open the day's register session while online (typical - most sites have connectivity at open), then sell offline against that already-synced session for the rest of the day even if connectivity drops, syncing sales and any session close whenever it returns. The Sell screen only offers sessions present in the last-pulled `pos.session` rows for this reason, and shows a queued-but-unsyncable notice for a session opened while already offline.

**The sale-number prefix has its own version, separate from the settings row's version.** The single pulled `pos.settings` row carries one `version` (the receipt footer's `baseVersion`, from `PosSettings.updatedAt`) and a separate `saleNumberPrefixVersion` payload field (the prefix's own `baseVersion`, from the `OrganizationModule` assignment row's `updatedAt` - see `pos.settings_sale_prefix`'s `loadCurrentVersion` in `pos.adapters.ts`). These two settings live on different server-side rows with independent update times; sending the row's own version as the prefix's `baseVersion` would fail nearly every offline prefix edit as a false `STALE_VERSION` conflict. `snapshot-builders/pos.ts` now fetches both.

## API contract

All responses containing tenant or device data use `Cache-Control: private, no-store`.

The desktop client's WebView origin is cross-origin from `https://app.rockfrostgroup.com`, so every request is browser-preflighted with `OPTIONS`. All five endpoints below answer that preflight and set `Access-Control-Allow-Origin` on every response, success and error alike (`src/lib/offline-sync/desktop-cors.ts`). A CSP `connect-src` allowance alone is not sufficient: without these headers, WebView2 still blocks the request client-side after a correctly-answered preflight, and `fetch()` rejects with a generic `Failed to fetch` that looks identical to a real network outage.

`Access-Control-Allow-Origin` must exactly equal the request's real `Origin` header; it is not a free-form value the server can return regardless of who is asking. `desktop-cors.ts` matches the incoming `Origin` against the general shape of a Tauri WebView2 origin (`http(s)://<host>.localhost`) and echoes back that exact value rather than a hardcoded guess. A guessed constant that happens not to match the real desktop app's origin still gets silently rejected client-side, with the same `Failed to fetch` symptom as a missing header entirely. The confirmed real origin, taken from a production log line rather than assumed, is `http://tauri.localhost`: plain HTTP, unlike the `https://asset.localhost` and `https://ipc.localhost` helper origins Tauri also uses.

### Activation

`POST /api/desktop/activate` accepts the single-use activation code, installation identifier, device name, supported desktop platform, and requested module keys. Requested keys are intersected with the code, subscription, module, and role scope. The response returns the one-time device token, device ID, organization and user display metadata, token expiry, offline lease expiry, and final module keys. The organization identifier populates the defense-in-depth assertion on queued mutations; the server still derives the authoritative tenant from the device token.

### Push

`POST /api/desktop/sync/push` accepts at most 50 mutations per batch and 64 KiB per payload. Each mutation contains a UUID `mutationId`, checked `organizationId`, `moduleKey`, `entityType`, local `entityId`, `CREATE` or `UPDATE` operation, `baseVersion`, `changedAt`, and a schema-validated payload.

An `UPDATE` mutation's `baseVersion` must match the target record's current version (its `updatedAt` as epoch milliseconds) or the server rejects it as a `STALE_VERSION` conflict rather than overwrite a change it never saw; a target that no longer exists conflicts as `ENTITY_DELETED`. `pos.register` is the first entity type to use `UPDATE`. Actions modeled as an event rather than an entity edit (opening/closing a POS session, refunding a sale) stay `CREATE`: there is no pre-existing local row to hold a `baseVersion` against before the server assigns the real target its id, and their safety comes from the same service-layer guard the web UI already relies on (an atomic status claim, a one-open-session-per-register check), not from optimistic concurrency.

`OfflineMutation` has a unique `(organizationId, mutationId)` constraint. A retry returns the stored outcome and never reapplies an already completed mutation. The server creates the ledger entry before touching a business record. If a process stops while a record is marked `PROCESSING`, automatic replay remains blocked to prefer manual recovery over duplicating a payment, sale, or stock movement.

### Pull

`GET /api/desktop/sync/pull` returns a bounded full reference snapshot and a renewed offline lease. Collections are capped at 500 rows and return `truncated: true` when a complete safe snapshot cannot be supplied. A client must not offer an incomplete workflow when `truncated` is true. Fleet driver snapshots are limited to assigned vehicles. Installment accounts retain the staff ownership scope. POS-only users receive stock only for warehouses linked to their own open register sessions and do not receive item cost prices.

The response's `rows` field is a flat list of `{entityType, entityId, version, payload}` (one entry per pulled record, e.g. `fleet.vehicle`, `installment.account`, `inventory.item`, `inventory.warehouse`, `inventory.stock`, `pos.session`), not one nested object per module. Each module's row-level scoping and row assembly lives in its own file under `src/lib/offline-sync/snapshot-builders/`; `buildOfflineSnapshot` in `service.ts` only decides which builders run for a device's `authorizedModuleKeys` and flattens their results. `version` is the source row's `updatedAt` as epoch milliseconds, or `0` for models with no `updatedAt` column (their staleness is always re-validated server-side on the next mutation regardless, so a meaningless version number is not a safety gap).

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

### Automatic update release path

- The client checks at startup, after connectivity returns, and every six
  hours. Update-service failure does not block offline work.
- The Rock Frost endpoint validates and proxies the newest public GitHub
  `latest.json`, or returns HTTP 204 when no release exists.
- The user starts the download. Tauri verifies its signature before passive
  installation and application restart.
- Local SQLCipher data and queued operations remain outside the installation
  directory and survive updates.
- `.github/workflows/desktop-release.yml` builds Windows installers, updater
  signatures, and `latest.json`, then publishes a public GitHub release.
- The Tauri private key must be configured as a GitHub Actions secret and must
  never be committed.
- Windows Authenticode signing remains pending. Public distribution stays
  enabled, but Windows may show Unknown publisher or SmartScreen warnings until
  Rock Frost configures a trusted certificate.

The offline product cannot be offered to customers until the integrated desktop package passes Windows installer testing, local encryption and credential-store verification, signed update configuration, online-to-offline workflow tests, loss-of-network tests, conflict tests, stolen-device tests, and a controlled customer pilot. Code-signing certificates and the final desktop update channel are external operational requirements and must not be claimed until configured and verified.

The packaged Vite frontend must use relative asset URLs. Root-relative asset
URLs are invalid for the installed Tauri application and result in a blank
native window even though the application process starts normally. A
packaging test guards the generated HTML before installer release.

WebView2 browser timer functions are receiver-sensitive. Desktop services
that retain `setInterval` or `clearInterval` must bind them to `globalThis`.
Calling an unbound timer as an object method raises `Illegal invocation` and
can prevent the initial activation screen from rendering.

The same rule applies to `fetch`. `SyncClient` is the only module that calls
`fetch` directly; its default fetch function is bound to `globalThis` in the
constructor (`apps/desktop/src/sync/sync-client.ts`) so device activation and
every other sync call work under WebView2. A repository-wide audit of
`apps/desktop/src` found no other retained, receiver-sensitive native
function besides this one and the already-fixed timer pair.

Version `0.2.3` fixes a second, previously-hidden defect that live testing of
`0.2.2` uncovered: the packaged app's Content-Security-Policy `connect-src`
allowed only `'self'`, `ipc:`, and `https://ipc.localhost`, and never
included the real sync API origin. WebView2 enforces the page's CSP exactly
like a browser would, so every `fetch()` to `https://app.rockfrostgroup.com`
was silently blocked and rejected with `Failed to fetch`, indistinguishable
in the UI from a genuine network outage. This was invisible before `0.2.2`
because the `Illegal invocation` defect always threw before the CSP check
was ever reached. The CSP's `connect-src` now also allows
`https://app.rockfrostgroup.com`, in both `apps/desktop/index.html` (used by
`vite dev`) and `apps/desktop/src-tauri/tauri.conf.json` (the built app's
`security.csp`). `apps/desktop/.env.example` previously documented the wrong
origin (`https://api.rockfrostgroup.com`, which does not exist); it now
matches the real one. A packaging test
(`apps/desktop/src/packaging/bundled-assets.test.ts`) now asserts the built
`dist/index.html`'s CSP `connect-src` includes the real API origin, so this
class of regression fails CI instead of only surfacing in a live install.
