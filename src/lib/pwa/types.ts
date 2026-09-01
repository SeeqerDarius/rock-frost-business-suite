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
}
