"use client";

import { enqueueOfflineOperation, getOfflineDeviceRegistration, listOfflineOperations, putOfflineOperation, removeOfflineOperation } from "@/lib/pwa/indexed-db";
import type { OfflineOperation } from "@/lib/pwa/types";

export interface QueuedSaleLine { itemId: string | null; description: string; quantity: number; unitPrice: string }
export interface QueuedSalePayment { method: string; amount: string; reference: string | null }
export interface QueuedSale {
  clientRequestId: string;
  sessionId: string;
  customerName: string | null;
  lines: QueuedSaleLine[];
  payments: QueuedSalePayment[];
  mode: "COMPLETED" | "SUSPENDED";
  occurredAt: string;
  lastError?: string;
}

const LEGACY_KEY_PREFIX = "rf-pos-offline-queue:";

async function asOperation(organizationId: string, userId: string, sale: QueuedSale): Promise<OfflineOperation> {
  const registration = await getOfflineDeviceRegistration(organizationId, userId);
  if (!registration || !registration.moduleKeys.includes("pos") || registration.mutationKillSwitch || Date.parse(registration.offlineAccessUntil) <= Date.now()) {
    throw new Error("Offline POS is not authorized on this device.");
  }
  return {
    operationId: sale.clientRequestId,
    organizationId,
    userId,
    deviceId: registration.deviceId,
    module: "pos",
    entityType: "pos.sale",
    entityId: sale.clientRequestId,
    operationType: sale.mode === "SUSPENDED" ? "draft" : "record",
    clientTimestamp: sale.occurredAt,
    baseServerVersion: 0,
    idempotencyKey: sale.clientRequestId,
    payloadSchemaVersion: 1,
    payload: sale,
    attachmentReferences: [],
    dependencyIds: [],
    status: sale.lastError ? "rejected" : "pending",
    attempts: 0,
    nextAttemptAt: sale.occurredAt,
    lastError: sale.lastError,
  };
}

function asSale(operation: OfflineOperation): QueuedSale {
  return { ...(operation.payload as QueuedSale), lastError: operation.lastError };
}

async function migrateLegacyQueue(organizationId: string, userId: string) {
  const key = `${LEGACY_KEY_PREFIX}${organizationId}`;
  const raw = window.localStorage.getItem(key);
  if (!raw) return;
  let sales: QueuedSale[] = [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) sales = parsed as QueuedSale[];
  } catch {
    return;
  }
  for (const sale of sales) {
    try {
      await enqueueOfflineOperation(await asOperation(organizationId, userId, sale));
    } catch (error) {
      if (!(error instanceof DOMException) || error.name !== "ConstraintError") throw error;
    }
  }
  window.localStorage.removeItem(key);
}

export async function listQueuedSales(organizationId: string, userId: string): Promise<QueuedSale[]> {
  await migrateLegacyQueue(organizationId, userId);
  const operations = await listOfflineOperations(organizationId, userId);
  return operations.filter((operation) => operation.module === "pos" && operation.entityType === "pos.sale")
    .sort((left, right) => left.clientTimestamp.localeCompare(right.clientTimestamp)).map(asSale);
}

export async function enqueueSale(organizationId: string, userId: string, sale: QueuedSale) {
  await enqueueOfflineOperation(await asOperation(organizationId, userId, sale));
}

export async function removeQueuedSale(organizationId: string, userId: string, clientRequestId: string) {
  const operations = await listOfflineOperations(organizationId, userId);
  if (operations.some((operation) => operation.operationId === clientRequestId && operation.module === "pos")) {
    await removeOfflineOperation(clientRequestId);
  }
}

export async function markQueuedSaleError(organizationId: string, userId: string, clientRequestId: string, error: string) {
  const operations = await listOfflineOperations(organizationId, userId);
  const operation = operations.find((entry) => entry.operationId === clientRequestId && entry.module === "pos");
  if (operation) await putOfflineOperation({ ...operation, status: "rejected", attempts: operation.attempts + 1, lastError: error });
}

export async function synchronizeQueuedSales(organizationId: string, userId: string) {
  const operations = (await listOfflineOperations(organizationId, userId)).filter((operation) => operation.module === "pos" && operation.entityType === "pos.sale" && operation.status === "pending" && Date.parse(operation.nextAttemptAt) <= Date.now());
  if (!operations.length) return [];
  const response = await fetch("/api/offline/sync", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ operations }) });
  if (!response.ok) throw new Error(`Offline synchronization failed with HTTP ${response.status}.`);
  const payload = await response.json() as { results: Array<{ operationId: string; status: "applied" | "rejected" | "conflict" | "synchronizing"; errorCode?: string }> };
  for (const result of payload.results) {
    const operation = operations.find((entry) => entry.operationId === result.operationId);
    if (!operation) continue;
    if (result.status === "applied") await removeOfflineOperation(result.operationId);
    else if (result.status === "rejected" || result.status === "conflict") await putOfflineOperation({ ...operation, status: result.status, attempts: operation.attempts + 1, lastError: result.errorCode ?? result.status });
  }
  return payload.results;
}

export function generateClientRequestId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
