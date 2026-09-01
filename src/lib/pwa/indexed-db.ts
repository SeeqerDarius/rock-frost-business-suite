"use client";

import type { OfflineDeviceRegistration, OfflineOperation, OfflineWorkspaceSnapshot } from "@/lib/pwa/types";

const DATABASE_NAME = "rock-frost-offline-v1";
const DATABASE_VERSION = 1;
const WORKSPACES = "workspaces";
const OPERATIONS = "operations";
const META = "meta";

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
    for (const storeName of [WORKSPACES, OPERATIONS, META]) {
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

export async function estimateOfflineStorage() {
  if (!navigator.storage?.estimate) return null;
  return navigator.storage.estimate();
}

export async function saveOfflineDeviceRegistration(registration: OfflineDeviceRegistration) {
  await withStore(META, "readwrite", (store) => store.put(registration));
}

export async function getOfflineDeviceRegistration(organizationId: string, userId: string): Promise<OfflineDeviceRegistration | null> {
  return (await withStore(META, "readonly", (store) => store.get(`device:${organizationId}:${userId}`)) as OfflineDeviceRegistration | undefined) ?? null;
}
