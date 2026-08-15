/**
 * Rock Frost desktop <-> cloud sync API contract.
 *
 * This is the single source of truth for every shape the desktop client
 * sends to, or expects back from, the cloud sync backend. Codex owns the
 * server implementation of these five endpoints; this file only declares
 * the anticipated request/response shapes the desktop client is built
 * against, per the assignment brief. Do not add fields here that aren't
 * part of that anticipated contract — if a module needs a field the server
 * doesn't support yet, that is a gap to flag in
 * apps/desktop/CLAUDE_HANDOFF.md, not something to invent client-side.
 *
 * Endpoints:
 *   POST /api/desktop/activate
 *   POST /api/desktop/sync/push
 *   GET  /api/desktop/sync/pull?cursor=...
 *   POST /api/desktop/sync/conflicts/{conflictId}/resolve
 *   POST /api/desktop/deactivate
 */

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

/** The business modules this desktop client has offline adapters for. Kept intentionally narrow to what's actually implemented — see src/modules/. */
export type OfflineModuleKey = "fleet" | "installment" | "pos" | "inventory";

/**
 * The write operation a mutation represents. "delete" is included in the
 * contract shape for completeness even though no shipped adapter emits one
 * yet — none of the four offline modules in this pass support offline
 * deletion of a record.
 */
export type MutationOperation = "create" | "update" | "delete";

/**
 * Every offline mutation, regardless of module, carries this exact set of
 * fields — this shape is the one the assignment brief specifies verbatim.
 * `payload` is intentionally `unknown` at the contract layer; each module
 * adapter (src/modules/<key>/) owns and validates its own payload shape.
 */
export interface MutationEnvelope<TPayload = unknown> {
  organizationId: string;
  moduleKey: OfflineModuleKey;
  entityType: string;
  entityId: string;
  /**
   * Client-generated, globally unique per mutation attempt's *logical*
   * write — not per HTTP retry. Retrying the same logical mutation (network
   * failure, 429, 5xx) MUST reuse the same mutationId so the server can
   * deduplicate; see src/sync/mutation-queue.ts's `createMutationId`.
   */
  mutationId: string;
  /**
   * The entity version this mutation was based on, as last observed by this
   * device (from a prior pull, or null for a brand-new offline-created
   * entity). The server uses this for optimistic-concurrency conflict
   * detection — a mismatch is expected to produce a 409.
   */
  baseVersion: number | null;
  operation: MutationOperation;
  /** ISO 8601 UTC timestamp, set on the device at the moment the mutation was recorded locally — not when it's finally sent. */
  changedAt: string;
  payload: TPayload;
}

/** A device-scoped opaque cursor. The client never parses or derives meaning from its contents — only stores and replays it verbatim. */
export type SyncCursor = string;

// ---------------------------------------------------------------------------
// POST /api/desktop/activate
// ---------------------------------------------------------------------------

export interface ActivateDeviceRequest {
  /** The credential the user just entered on the sign-in screen. Sent once, over TLS, for this single activation call — never persisted locally in any form. See src/security/credential-store.ts. */
  email: string;
  password: string;
  /** A stable, locally-generated device identifier (see src/security/device-identity.ts) — not a secret, just a label the server can use to name/list/revoke this installation. */
  deviceId: string;
  deviceName: string;
  platform: "windows";
  appVersion: string;
}

export interface ActivateDeviceResponse {
  organizationId: string;
  userId: string;
  userName: string;
  /** Short-lived bearer token for subsequent sync calls. Held only in memory plus the OS credential store abstraction — see src/security/credential-store.ts. */
  accessToken: string;
  /** ISO 8601 UTC. Drives the offline session-expiry countdown in src/security/device-lock.ts. */
  accessTokenExpiresAt: string;
  /**
   * Opaque, intended to request a fresh accessToken without re-entering a
   * password. IMPORTANT GAP: the five endpoints this contract implements
   * do not include a token-refresh endpoint, so this client currently only
   * ever stores refreshToken (via the credential store) and does not yet
   * consume it anywhere. When a refresh endpoint is added to the shared
   * contract, sync/sync-engine.ts's `expired_auth` handling should call it
   * before falling back to forcing the user through sign-in again — see
   * apps/desktop/CLAUDE_HANDOFF.md.
   */
  refreshToken: string;
  /** The modules this organization/user combination is entitled to sync — the desktop client must not offer a module the user doesn't hold here, even if it has a local adapter built. */
  enabledModuleKeys: OfflineModuleKey[];
  /** Initial cursor to start pulling from. */
  initialCursor: SyncCursor;
}

// ---------------------------------------------------------------------------
// POST /api/desktop/sync/push
// ---------------------------------------------------------------------------

export interface SyncPushRequest {
  deviceId: string;
  /** Bounded batch — the queue drains in batches, never the whole queue in one request. See src/sync/sync-engine.ts's PUSH_BATCH_SIZE. */
  mutations: MutationEnvelope[];
}

export type MutationOutcomeStatus = "applied" | "conflict" | "rejected";

export interface MutationOutcome {
  mutationId: string;
  status: MutationOutcomeStatus;
  /** The entity's new version after this mutation was applied. Present only when status is "applied". */
  newVersion?: number;
  /** Present only when status is "conflict" — enough to open the conflict experience without a separate round trip. */
  conflict?: SyncConflict;
  /** Present only when status is "rejected" (e.g. validation failure the server enforces that the client's own optimistic validation didn't catch). Not a conflict — the mutation is simply invalid and will not be retried automatically. */
  rejectionReason?: string;
}

export interface SyncPushResponse {
  outcomes: MutationOutcome[];
  /** The cursor position after processing this push, to be persisted immediately so a crash mid-sync can't cause a duplicate re-send of already-applied mutations. */
  cursorAfterPush: SyncCursor;
}

// ---------------------------------------------------------------------------
// GET /api/desktop/sync/pull?cursor=...
// ---------------------------------------------------------------------------

/**
 * A single record change the server is pushing down to this device —
 * either a fresh/updated cloud-authoritative record, or a tombstone for one
 * this device previously cached.
 */
export interface SyncPullRecord {
  moduleKey: OfflineModuleKey;
  entityType: string;
  entityId: string;
  version: number;
  /** Absent (and `deleted: true`) for a tombstone; present otherwise. Left as `unknown` for the same reason as MutationEnvelope.payload — each module adapter owns its own shape. */
  payload: unknown;
  deleted: boolean;
  updatedAt: string;
  updatedByUserId: string | null;
  updatedByUserName: string | null;
}

export interface SyncPullResponse {
  records: SyncPullRecord[];
  /** True if there are more records beyond this page — the client must keep pulling with `nextCursor` until this is false before it considers itself caught up. */
  hasMore: boolean;
  nextCursor: SyncCursor;
}

// ---------------------------------------------------------------------------
// POST /api/desktop/sync/conflicts/{conflictId}/resolve
// ---------------------------------------------------------------------------

/**
 * What the server will actually let the client do about a conflict. Never
 * assume "manual merge" or "keep local" is available — the server is the
 * single source of truth for which resolutions a given entity type
 * permits (see docs/HARDENING_PLAN.md-style reasoning in
 * src/conflict/conflict-policy.ts: payments, inventory movements, posted
 * accounting, payroll, prescriptions, and clinical data must never be
 * client-resolved with an implicit last-write-wins).
 */
export type ConflictResolutionChoice = "keep_cloud" | "retry_local" | "manual_merge";

export interface SyncConflict {
  conflictId: string;
  moduleKey: OfflineModuleKey;
  entityType: string;
  entityId: string;
  /** Which resolutions this specific conflict may be closed with — always authoritative over anything the UI might otherwise want to offer. */
  allowedResolutions: ConflictResolutionChoice[];
  localValue: unknown;
  localChangedAt: string;
  localChangedByUserName: string | null;
  cloudValue: unknown;
  cloudChangedAt: string;
  cloudChangedByUserName: string | null;
}

export interface ResolveConflictRequest {
  resolution: ConflictResolutionChoice;
  /** Required, and only meaningful, when resolution is "manual_merge". */
  mergedPayload?: unknown;
}

export interface ResolveConflictResponse {
  conflictId: string;
  entityId: string;
  resultingVersion: number;
  resultingPayload: unknown;
}

// ---------------------------------------------------------------------------
// POST /api/desktop/deactivate
// ---------------------------------------------------------------------------

export interface DeactivateDeviceRequest {
  deviceId: string;
  /** Best-effort context for the audit trail — never a security control by itself. */
  reason: "user_signed_out" | "device_replaced" | "app_uninstalled";
}

export interface DeactivateDeviceResponse {
  acknowledged: true;
}

// ---------------------------------------------------------------------------
// Error taxonomy
// ---------------------------------------------------------------------------

/**
 * The client-side meaning assigned to each HTTP status the sync API can
 * return, per the assignment brief. src/sync/sync-client.ts is the only
 * place these are interpreted; every other module reacts to the resulting
 * SyncClientError, never a raw status code.
 */
export type SyncErrorKind =
  | "expired_auth" // 401
  | "revoked_or_unauthorized" // 403
  | "conflict" // 409
  | "rate_limited" // 429 — retried with backoff
  | "server_error" // 5xx — retried with backoff
  | "network_error" // fetch threw — retried with backoff
  | "invalid_request" // 400/422 — not retried, surfaced as a defect
  | "unknown";

export class SyncClientError extends Error {
  readonly kind: SyncErrorKind;
  readonly status: number | null;
  /** True for exactly the kinds src/sync/retry.ts will schedule a bounded-backoff retry for. */
  readonly retryable: boolean;

  constructor(kind: SyncErrorKind, message: string, status: number | null = null) {
    super(message);
    this.name = "SyncClientError";
    this.kind = kind;
    this.status = status;
    this.retryable = kind === "rate_limited" || kind === "server_error" || kind === "network_error";
  }
}

/** Maps an HTTP response status to the client's error taxonomy. Exported so tests can assert the mapping directly without going through a real fetch. */
export function classifyHttpStatus(status: number): SyncErrorKind {
  if (status === 401) return "expired_auth";
  if (status === 403) return "revoked_or_unauthorized";
  if (status === 409) return "conflict";
  if (status === 429) return "rate_limited";
  if (status === 400 || status === 422) return "invalid_request";
  if (status >= 500) return "server_error";
  return "unknown";
}
