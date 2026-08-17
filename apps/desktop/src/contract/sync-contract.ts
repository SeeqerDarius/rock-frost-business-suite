/** Exact wire contract exposed by the Rock Frost offline sync backend. */
export type OfflineModuleKey = "fleet" | "installment" | "inventory" | "pos" | "school";

export type OfflineEntityType =
  | "fleet.maintenance_request"
  | "fleet.driver_payment_submission"
  | "installment.payment"
  | "inventory.movement"
  | "pos.sale"
  | "pos.register"
  | "pos.session_open"
  | "pos.session_close"
  | "pos.sale_refund"
  | "pos.settings_receipt_footer"
  | "pos.settings_sale_prefix"
  // Pulled-only reference rows: never used as a mutation entityType, only
  // as the entityType of a pulled OfflineSnapshotRow. pos.session_record and
  // pos.sale_record are deliberately distinct from pos.session_open/close
  // and pos.sale, matching the server-side snapshot builder's naming.
  | "pos.session"
  | "pos.sale_record"
  | "pos.settings"
  // School foundational slice (milestone 6): campus, academic year, and
  // term. All three are CREATE-only, matching the web app - there is no
  // edit action for any of them today.
  | "school.campus"
  | "school.academic_year"
  | "school.term"
  // Milestone 7: students, guardians, classes, subjects, enrollment,
  // attendance. school.student_status_transition is the second genuine
  // UPDATE case (after pos.register).
  | "school.student"
  | "school.student_status_transition"
  | "school.guardian"
  | "school.guardian_link"
  | "school.class"
  | "school.subject"
  | "school.enrollment"
  | "school.attendance"
  // Milestone 8: fees. school.fee_structure_issuance is a bulk fan-out
  // event; school.fee_invoice_record is pulled-only, distinct from the
  // school.fee_invoice mutation for the same reason pos.sale_record is
  // distinct from pos.sale - most invoices come from the bulk fan-out,
  // not the ad-hoc mutation.
  | "school.fee_invoice"
  | "school.fee_payment"
  | "school.fee_structure"
  | "school.fee_structure_issuance"
  | "school.fee_invoice_record";

/** UPDATE is real: pos.register edits and both pos.settings_* actions carry the cached record's own version as baseVersion, and the server rejects a stale one as a conflict rather than silently overwriting. Every other action still queues CREATE with baseVersion 0. */
export type MutationOperation = "CREATE" | "UPDATE";

export interface MutationEnvelope<TPayload extends Record<string, unknown> = Record<string, unknown>> {
  mutationId: string;
  organizationId: string;
  moduleKey: OfflineModuleKey;
  entityType: OfflineEntityType;
  entityId: string;
  operation: MutationOperation;
  /** 0 for every CREATE queued today. For a future UPDATE, this is the cached record's own `version` at the moment the edit was made - the server rejects a stale one as a conflict rather than silently overwriting. */
  baseVersion: number;
  changedAt: string;
  payload: TPayload;
}

/** Kept as a local snapshot marker. The server currently returns full snapshots and does not consume cursors. */
export type SyncCursor = string;

export interface ActivateDeviceRequest {
  activationCode: string;
  installationId: string;
  name: string;
  platform: "windows" | "macos" | "linux";
  moduleKeys: OfflineModuleKey[];
}

export interface ActivateDeviceResponse {
  deviceId: string;
  organizationId: string;
  userId: string;
  userName: string;
  token: string;
  tokenExpiresAt: string;
  offlineAccessUntil: string;
  moduleKeys: OfflineModuleKey[];
}

export interface SyncPushRequest { mutations: MutationEnvelope[] }
export type MutationOutcomeStatus = "processing" | "applied" | "conflict" | "rejected";
export interface MutationOutcome {
  mutationId: string;
  status: MutationOutcomeStatus;
  result: Record<string, unknown> | null;
  errorCode: string | null;
}
export interface SyncPushResponse {
  results: MutationOutcome[];
  offlineAccessUntil: string;
}

/** One entity in a pull response. `payload` holds every field except the ones already promoted to `entityId`/`version` - mirrors OfflineSnapshotRow server-side (src/lib/offline-sync/snapshot-builders/types.ts). `version` is 0 for models with no updatedAt column server-side; that is not a client-trust gap, since any subsequent mutation against the row is still fully re-validated server-side regardless of what version the client last saw. */
export interface OfflineSnapshotRow {
  entityType: string;
  entityId: string;
  version: number;
  payload: Record<string, unknown>;
}
export interface SyncPullResponse {
  generatedAt: string;
  offlineAccessUntil: string;
  fullSnapshot: true;
  truncated: boolean;
  rows: OfflineSnapshotRow[];
}

export type ConflictResolutionChoice = "KEEP_CLOUD";
export interface ResolveConflictRequest { resolution: "KEEP_CLOUD" }
export interface ResolveConflictResponse { conflictId: string; status: string; resolution: "KEEP_CLOUD" }
export type SyncConflict = never;

export type DeactivateDeviceRequest = Record<string, never>;
export interface DeactivateDeviceResponse { deactivated: true }

export type SyncErrorKind =
  | "expired_auth"
  | "revoked_or_unauthorized"
  | "conflict"
  | "rate_limited"
  | "server_error"
  | "network_error"
  | "invalid_request"
  | "unknown";

export class SyncClientError extends Error {
  readonly retryable: boolean;
  constructor(public readonly kind: SyncErrorKind, message: string, public readonly status: number | null = null) {
    super(message);
    this.name = "SyncClientError";
    this.retryable = kind === "rate_limited" || kind === "server_error" || kind === "network_error";
  }
}

export function classifyHttpStatus(status: number): SyncErrorKind {
  if (status === 401) return "expired_auth";
  if (status === 403) return "revoked_or_unauthorized";
  if (status === 409) return "conflict";
  if (status === 429) return "rate_limited";
  if (status === 400 || status === 422) return "invalid_request";
  if (status >= 500) return "server_error";
  return "unknown";
}
