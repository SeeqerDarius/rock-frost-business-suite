"use client";

/**
 * A tiny localStorage-backed queue for sales completed while offline. Scoped
 * per organization (never global) so a shared/kiosk browser can't mix one
 * tenant's pending sales into another's. Deliberately not IndexedDB - this
 * holds at most a handful of small JSON objects even in a long outage, well
 * within what localStorage is for.
 *
 * Every queued sale carries its own clientRequestId, which the server's
 * createSale() uses to make a sync replay idempotent (see
 * src/modules/pos/service.ts) - a lost response or a double-fired sync never
 * creates two sales for the same queued entry.
 */

export interface QueuedSaleLine {
  itemId: string | null;
  description: string;
  quantity: number;
  unitPrice: string;
}

export interface QueuedSalePayment {
  method: string;
  amount: string;
  reference: string | null;
}

export interface QueuedSale {
  clientRequestId: string;
  sessionId: string;
  customerName: string | null;
  lines: QueuedSaleLine[];
  payments: QueuedSalePayment[];
  mode: "COMPLETED" | "SUSPENDED";
  /** ISO timestamp captured the moment the sale was made, not when it eventually syncs. */
  occurredAt: string;
  /** Set once a sync attempt comes back with a real rejection (e.g. insufficient
   * stock discovered only at sync time) - surfaced to the cashier, never silently
   * retried forever. Absent while still simply waiting for connectivity. */
  lastError?: string;
}

function storageKey(organizationId: string) {
  return `rf-pos-offline-queue:${organizationId}`;
}

export function listQueuedSales(organizationId: string): QueuedSale[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(storageKey(organizationId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as QueuedSale[]) : [];
  } catch {
    return [];
  }
}

function saveQueuedSales(organizationId: string, sales: QueuedSale[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(storageKey(organizationId), JSON.stringify(sales));
}

export function enqueueSale(organizationId: string, sale: QueuedSale) {
  saveQueuedSales(organizationId, [...listQueuedSales(organizationId), sale]);
}

export function removeQueuedSale(organizationId: string, clientRequestId: string) {
  saveQueuedSales(organizationId, listQueuedSales(organizationId).filter((sale) => sale.clientRequestId !== clientRequestId));
}

export function markQueuedSaleError(organizationId: string, clientRequestId: string, error: string) {
  saveQueuedSales(
    organizationId,
    listQueuedSales(organizationId).map((sale) => (sale.clientRequestId === clientRequestId ? { ...sale, lastError: error } : sale)),
  );
}

export function generateClientRequestId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
