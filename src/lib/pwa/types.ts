export type PwaConnectivityState =
  | "online"
  | "offline"
  | "synchronizing"
  | "partially-synchronized"
  | "conflict"
  | "sync-failed"
  | "session-expired"
  | "update-available";

export interface OfflineWorkspaceSnapshot {
  partitionKey: string;
  organizationId: string;
  organizationName: string;
  userId: string;
  role: string | null;
  permissions: string[];
  moduleKeys: string[];
  branch: { id: string; name: string; code: string } | null;
  capturedAt: string;
  expiresAt: string;
}

export interface OfflineReferenceRecord {
  key: string;
  organizationId: string;
  userId: string;
  module: string;
  deviceId: string;
  entityType: string;
  entityId: string;
  serverVersion: number;
  value: unknown;
  capturedAt: string;
  expiresAt: string;
}

export interface OfflineWorkPack {
  key: string;
  organizationId: string;
  userId: string;
  module: string;
  deviceId: string;
  workPackType: string;
  workPackId: string;
  title: string;
  records: unknown[];
  serverVersion: number;
  downloadedAt: string;
  expiresAt: string;
  sizeBytes: number;
}

export interface OfflineAttachment {
  attachmentId: string;
  organizationId: string;
  userId: string;
  module: string;
  deviceId: string;
  operationId: string;
  fileName: string;
  mimeType: string;
  size: number;
  blob: Blob;
  createdAt: string;
  status: "pending" | "uploading" | "uploaded" | "rejected";
  uploadToken?: string;
  lastError?: string;
}

export interface OfflineSyncAttempt {
  attemptId: string;
  organizationId: string;
  userId: string;
  deviceId: string;
  startedAt: string;
  finishedAt?: string;
  operationCount: number;
  outcome: "running" | "succeeded" | "partial" | "failed";
  errorCode?: string;
}

export interface OfflineConflictRecord {
  conflictId: string;
  operationId: string;
  organizationId: string;
  userId: string;
  deviceId: string;
  module: string;
  entityType: string;
  workflow: string;
  localValue: unknown;
  serverValue: unknown;
  localChangedAt: string;
  serverChangedAt?: string;
  serverChangedBy?: string;
  allowedResolutions: string[];
  status: "open" | "resolved";
}

export interface OfflineOperation {
  operationId: string;
  organizationId: string;
  userId: string;
  deviceId: string;
  module: string;
  entityType: string;
  entityId: string;
  operationType: string;
  clientTimestamp: string;
  baseServerVersion: number;
  idempotencyKey: string;
  payloadSchemaVersion: number;
  payload: unknown;
  attachmentReferences: string[];
  dependencyIds: string[];
  status: "pending" | "synchronizing" | "rejected" | "conflict";
  attempts: number;
  nextAttemptAt: string;
  lastError?: string;
}

export interface OfflineDeviceRegistration {
  key: string;
  deviceId: string;
  installationId: string;
  organizationId: string;
  userId: string;
  moduleKeys: string[];
  offlineAccessUntil: string;
  mutationKillSwitch: boolean;
  syncSecret?: string;
  signingPrivateKey?: JsonWebKey;
}

export interface OfflineLockConfig {
  key: string;
  organizationId: string;
  userId: string;
  credentialId: string;
  enabled: boolean;
}
