"use client";

import type { OfflineAttachment, OfflineConflictRecord, OfflineDeviceRegistration, OfflineLockConfig, OfflineOperation, OfflineReferenceRecord, OfflineSyncAttempt, OfflineWorkPack, OfflineWorkspaceSnapshot } from "@/lib/pwa/types";

const DATABASE_NAME = "rock-frost-offline-v1";
const DATABASE_VERSION = 2;
const WORKSPACES = "workspaces";
const OPERATIONS = "operations";
const META = "meta";
const RECORDS = "records";
const WORK_PACKS = "workPacks";
const ATTACHMENTS = "attachments";
const SYNC_ATTEMPTS = "syncAttempts";
const CONFLICTS = "conflicts";

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed."));
  });
}

export function openOfflineDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("IndexedDB is unavailable."));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(WORKSPACES)) {
        const store = database.createObjectStore(WORKSPACES, { keyPath: "partitionKey" });
        store.createIndex("userId", "userId");
        store.createIndex("organizationId", "organizationId");
      }
      if (!database.objectStoreNames.contains(OPERATIONS)) {
        const store = database.createObjectStore(OPERATIONS, { keyPath: "operationId" });
        store.createIndex("partition", ["organizationId", "userId"]);
        store.createIndex("status", "status");
      }
      if (!database.objectStoreNames.contains(META)) database.createObjectStore(META, { keyPath: "key" });
      if (!database.objectStoreNames.contains(RECORDS)) {
        const store = database.createObjectStore(RECORDS, { keyPath: "key" });
        store.createIndex("partition", ["organizationId", "userId", "module"]);
        store.createIndex("expiresAt", "expiresAt");
      }
      if (!database.objectStoreNames.contains(WORK_PACKS)) {
        const store = database.createObjectStore(WORK_PACKS, { keyPath: "key" });
        store.createIndex("partition", ["organizationId", "userId", "module"]);
        store.createIndex("expiresAt", "expiresAt");
      }
      if (!database.objectStoreNames.contains(ATTACHMENTS)) {
        const store = database.createObjectStore(ATTACHMENTS, { keyPath: "attachmentId" });
        store.createIndex("partition", ["organizationId", "userId"]);
        store.createIndex("operationId", "operationId");
      }
      if (!database.objectStoreNames.contains(SYNC_ATTEMPTS)) {
        const store = database.createObjectStore(SYNC_ATTEMPTS, { keyPath: "attemptId" });
        store.createIndex("partition", ["organizationId", "userId"]);
      }
      if (!database.objectStoreNames.contains(CONFLICTS)) {
        const store = database.createObjectStore(CONFLICTS, { keyPath: "conflictId" });
        store.createIndex("partition", ["organizationId", "userId"]);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open offline storage."));
    request.onblocked = () => reject(new Error("Offline storage upgrade is blocked by another tab."));
  });
}

async function withStore<T>(storeName: string, mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>) {
  const database = await openOfflineDatabase();
  try {
    const transaction = database.transaction(storeName, mode);
    return await requestResult(work(transaction.objectStore(storeName)));
  } finally {
    database.close();
  }
}

export function workspacePartitionKey(organizationId: string, userId: string) {
  return `${organizationId}:${userId}`;
}

export async function saveWorkspaceSnapshot(snapshot: OfflineWorkspaceSnapshot) {
  await withStore(WORKSPACES, "readwrite", (store) => store.put(snapshot));
}

export async function listWorkspaceSnapshots(): Promise<OfflineWorkspaceSnapshot[]> {
  const snapshots = await withStore(WORKSPACES, "readonly", (store) => store.getAll()) as OfflineWorkspaceSnapshot[];
  const now = Date.now();
  return snapshots.filter((snapshot) => Date.parse(snapshot.expiresAt) > now);
}

export async function enqueueOfflineOperation(operation: OfflineOperation) {
  await withStore(OPERATIONS, "readwrite", (store) => store.add(operation));
}

export async function putOfflineOperation(operation: OfflineOperation) {
  await withStore(OPERATIONS, "readwrite", (store) => store.put(operation));
}

export async function removeOfflineOperation(operationId: string) {
  await withStore(OPERATIONS, "readwrite", (store) => store.delete(operationId));
}

export async function listOfflineOperations(organizationId: string, userId: string): Promise<OfflineOperation[]> {
  const database = await openOfflineDatabase();
  try {
    const transaction = database.transaction(OPERATIONS, "readonly");
    const index = transaction.objectStore(OPERATIONS).index("partition");
    return await requestResult(index.getAll(IDBKeyRange.only([organizationId, userId]))) as OfflineOperation[];
  } finally {
    database.close();
  }
}

async function listByPartition<T>(storeName: string, organizationId: string, userId: string): Promise<T[]> {
  const database = await openOfflineDatabase();
  try {
    const transaction = database.transaction(storeName, "readonly");
    const index = transaction.objectStore(storeName).index("partition");
    return await requestResult(index.getAll(IDBKeyRange.only([organizationId, userId]))) as T[];
  } finally { database.close(); }
}

export async function putOfflineReferenceRecord(record: OfflineReferenceRecord) {
  await withStore(RECORDS, "readwrite", (store) => store.put(record));
}

export async function putOfflineWorkPack(workPack: OfflineWorkPack) {
  await withStore(WORK_PACKS, "readwrite", (store) => store.put(workPack));
}

export async function listOfflineWorkPacks(organizationId: string, userId: string, module?: string): Promise<OfflineWorkPack[]> {
  const database = await openOfflineDatabase();
  try {
    const store = database.transaction(WORK_PACKS, "readonly").objectStore(WORK_PACKS);
    const records = module
      ? await requestResult(store.index("partition").getAll(IDBKeyRange.only([organizationId, userId, module])))
      : await requestResult(store.getAll());
    return (records as OfflineWorkPack[]).filter((record) => record.organizationId === organizationId && record.userId === userId && Date.parse(record.expiresAt) > Date.now());
  } finally { database.close(); }
}

export async function putOfflineAttachment(attachment: OfflineAttachment) {
  await withStore(ATTACHMENTS, "readwrite", (store) => store.put(attachment));
}

export async function listOfflineAttachments(organizationId: string, userId: string): Promise<OfflineAttachment[]> {
  return listByPartition<OfflineAttachment>(ATTACHMENTS, organizationId, userId);
}

export async function removeOfflineAttachment(attachmentId: string) {
  await withStore(ATTACHMENTS, "readwrite", (store) => store.delete(attachmentId));
}

export async function putOfflineSyncAttempt(attempt: OfflineSyncAttempt) {
  await withStore(SYNC_ATTEMPTS, "readwrite", (store) => store.put(attempt));
}

export async function listOfflineSyncAttempts(organizationId: string, userId: string): Promise<OfflineSyncAttempt[]> {
  return listByPartition<OfflineSyncAttempt>(SYNC_ATTEMPTS, organizationId, userId);
}

export async function putOfflineConflict(conflict: OfflineConflictRecord) {
  await withStore(CONFLICTS, "readwrite", (store) => store.put(conflict));
}

export async function listOfflineConflicts(organizationId: string, userId: string): Promise<OfflineConflictRecord[]> {
  return listByPartition<OfflineConflictRecord>(CONFLICTS, organizationId, userId);
}

export async function removeOfflineConflict(conflictId: string) {
  await withStore(CONFLICTS, "readwrite", (store) => store.delete(conflictId));
}

export async function purgeOfflineDataForUser(userId?: string) {
  if (!userId) {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(DATABASE_NAME);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error ?? new Error("Could not clear offline data."));
      request.onblocked = () => reject(new Error("Close other Rock Frost tabs before clearing offline data."));
    });
    return;
  }
  const database = await openOfflineDatabase();
  try {
    for (const storeName of [WORKSPACES, OPERATIONS, META, RECORDS, WORK_PACKS, ATTACHMENTS, SYNC_ATTEMPTS, CONFLICTS]) {
      const transaction = database.transaction(storeName, "readwrite");
      const store = transaction.objectStore(storeName);
      const request = store.openCursor();
      await new Promise<void>((resolve, reject) => {
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor) return resolve();
          if ((cursor.value as { userId?: string }).userId === userId) cursor.delete();
          cursor.continue();
        };
        request.onerror = () => reject(request.error);
      });
    }
  } finally {
    database.close();
  }
}

export async function purgeOfflineModuleData(organizationId: string, userId: string, module: string) {
  const database = await openOfflineDatabase();
  try {
    for (const storeName of [OPERATIONS, RECORDS, WORK_PACKS, ATTACHMENTS, CONFLICTS]) {
      const transaction = database.transaction(storeName, "readwrite");
      const request = transaction.objectStore(storeName).openCursor();
      await new Promise<void>((resolve, reject) => {
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor) return resolve();
          const value = cursor.value as { organizationId?: string; userId?: string; module?: string };
          if (value.organizationId === organizationId && value.userId === userId && value.module === module) cursor.delete();
          cursor.continue();
        };
        request.onerror = () => reject(request.error);
      });
    }
  } finally { database.close(); }
}

export async function estimateOfflineStorage() {
  if (!navigator.storage?.estimate) return null;
  return navigator.storage.estimate();
}

export async function purgeExpiredOfflineData() {
  const database = await openOfflineDatabase();
  try {
    for (const storeName of [RECORDS, WORK_PACKS]) {
      const transaction = database.transaction(storeName, "readwrite");
      const request = transaction.objectStore(storeName).index("expiresAt").openCursor(IDBKeyRange.upperBound(new Date().toISOString()));
      await new Promise<void>((resolve, reject) => {
        request.onsuccess = () => { const cursor = request.result; if (!cursor) return resolve(); cursor.delete(); cursor.continue(); };
        request.onerror = () => reject(request.error);
      });
    }
  } finally { database.close(); }
}

export async function ensureOfflineCapacity(requiredBytes = 0) {
  await purgeExpiredOfflineData();
  const estimate = await estimateOfflineStorage();
  if (estimate?.quota && (estimate.usage ?? 0) + requiredBytes > estimate.quota * 0.8) {
    throw new Error("Offline storage is nearly full. Remove downloaded work packs or synchronize pending work before saving more.");
  }
}

export async function saveOfflineDeviceRegistration(registration: OfflineDeviceRegistration) {
  await withStore(META, "readwrite", (store) => store.put(registration));
}

export async function getOfflineDeviceRegistration(organizationId: string, userId: string): Promise<OfflineDeviceRegistration | null> {
  return (await withStore(META, "readonly", (store) => store.get(`device:${organizationId}:${userId}`)) as OfflineDeviceRegistration | undefined) ?? null;
}

export async function saveOfflineLockConfig(config: OfflineLockConfig) {
  await withStore(META, "readwrite", (store) => store.put(config));
}

export async function getOfflineLockConfig(organizationId: string, userId: string): Promise<OfflineLockConfig | null> {
  return (await withStore(META, "readonly", (store) => store.get(`lock:${organizationId}:${userId}`)) as OfflineLockConfig | undefined) ?? null;
}
