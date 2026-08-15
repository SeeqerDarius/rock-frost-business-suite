/** Exact wire contract exposed by the Rock Frost offline sync backend. */
export type OfflineModuleKey = "fleet" | "installment" | "inventory" | "pos";

export type OfflineEntityType =
  | "fleet.maintenance_request"
  | "fleet.driver_payment_submission"
  | "installment.payment"
  | "inventory.movement"
  | "pos.sale";

export type MutationOperation = "CREATE";

export interface MutationEnvelope<TPayload extends Record<string, unknown> = Record<string, unknown>> {
  mutationId: string;
  organizationId: string;
  moduleKey: OfflineModuleKey;
  entityType: OfflineEntityType;
  entityId: string;
  operation: "CREATE";
  baseVersion: 0;
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

export interface OfflineSnapshot {
  fleet?: Record<string, unknown>;
  installment?: Record<string, unknown>;
  inventory?: Record<string, unknown>;
  pos?: Record<string, unknown>;
}
export interface SyncPullResponse {
  generatedAt: string;
  offlineAccessUntil: string;
  fullSnapshot: true;
  truncated: boolean;
  snapshot: OfflineSnapshot;
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
