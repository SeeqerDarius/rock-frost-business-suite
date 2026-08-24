import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

/**
 * offline-queue.ts guards every call with `typeof window === "undefined"`
 * for SSR safety, but this suite runs under vitest's plain "node"
 * environment (no DOM at all - see vitest.config.ts) — so a minimal
 * localStorage stub is installed on globalThis for this file only, giving
 * the module its real window.localStorage rather than reducing this to a
 * source-assertion test.
 */
function installLocalStorageStub() {
  const store = new Map<string, string>();
  (globalThis as { window?: unknown }).window = {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => { store.set(key, value); },
      removeItem: (key: string) => { store.delete(key); },
    },
  };
  return store;
}

describe("POS offline-sync queue (src/app/app/pos/sell/offline-queue.ts)", () => {
  let queue: typeof import("../src/app/app/pos/sell/offline-queue");

  beforeEach(async () => {
    vi.resetModules();
    installLocalStorageStub();
    queue = await import("../src/app/app/pos/sell/offline-queue");
  });

  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
  });

  const sale = (clientRequestId: string) => ({
    clientRequestId,
    sessionId: "sess-1",
    customerName: null,
    lines: [{ itemId: "item-1", description: "Widget", quantity: 1, unitPrice: "10.00" }],
    payments: [{ method: "CASH", amount: "10.00", reference: null }],
    mode: "COMPLETED" as const,
    occurredAt: "2026-08-24T00:00:00.000Z",
  });

  it("starts empty for an organization that has never queued a sale", () => {
    expect(queue.listQueuedSales("org-1")).toEqual([]);
  });

  it("enqueues and lists a sale", () => {
    queue.enqueueSale("org-1", sale("req-1"));
    expect(queue.listQueuedSales("org-1")).toEqual([sale("req-1")]);
  });

  it("scopes the queue per organization — one tenant's queue never leaks into another's", () => {
    queue.enqueueSale("org-1", sale("req-1"));
    queue.enqueueSale("org-2", sale("req-2"));
    expect(queue.listQueuedSales("org-1")).toEqual([sale("req-1")]);
    expect(queue.listQueuedSales("org-2")).toEqual([sale("req-2")]);
  });

  it("removes a queued sale by its clientRequestId once synced", () => {
    queue.enqueueSale("org-1", sale("req-1"));
    queue.enqueueSale("org-1", sale("req-2"));
    queue.removeQueuedSale("org-1", "req-1");
    expect(queue.listQueuedSales("org-1").map((entry) => entry.clientRequestId)).toEqual(["req-2"]);
  });

  it("marks a sync failure on the specific entry without dropping it from the queue", () => {
    queue.enqueueSale("org-1", sale("req-1"));
    queue.markQueuedSaleError("org-1", "req-1", "There isn't enough stock.");
    expect(queue.listQueuedSales("org-1")[0].lastError).toBe("There isn't enough stock.");
  });

  it("generateClientRequestId produces a distinct value on every call", () => {
    const ids = new Set(Array.from({ length: 20 }, () => queue.generateClientRequestId()));
    expect(ids.size).toBe(20);
  });
});

describe("completeSale converted to an RPC-style action (no more redirect)", () => {
  const source = read("src/app/app/pos/sell/actions.ts");

  it("returns a result object instead of redirecting, so the caller can tell a network failure from a validation error", () => {
    expect(source).toContain("export async function completeSale(formData: FormData): Promise<CompleteSaleResult>");
    expect(source).not.toContain('redirect("/app/pos/sell');
    expect(source).toContain("clientRequestId: parsed.data.clientRequestId");
    expect(source).toContain("occurredAt,");
  });

  it("still runs every existing validation, permission check, and revenue posting unchanged", () => {
    expect(source).toContain('requireModuleAccess("pos")');
    expect(source).toContain("PERMISSIONS.POS_SALES_MANAGE");
    expect(source).toContain("postModuleRevenue");
    expect(source).toContain("logAuditEvent");
  });
});

describe("sale-cart.tsx: submit is JS-driven, network failure queues locally", () => {
  const source = read("src/app/app/pos/sell/sale-cart.tsx");

  it("submits via startTransition, not a native form action", () => {
    expect(source).toContain("startTransition(async () => {");
    expect(source).toContain('<Button type="button" size="lg"');
  });

  it("queues the sale on a thrown (network) failure and shows an inline message, distinct from a returned validation error", () => {
    const handleSubmitStart = source.indexOf("function handleSubmit()");
    const body = source.slice(handleSubmitStart);
    expect(body).toContain("catch {");
    expect(body).toContain("enqueueSale(organizationId, queuedEntry)");
    expect(body).toContain("Saved offline");
  });

  it("syncs queued sales on the online event, on a timer, and via a manual button", () => {
    expect(source).toContain('window.addEventListener("online", handleOnline)');
    expect(source).toContain("window.setInterval(() => { if (navigator.onLine) void syncQueuedSales(); }, 20000)");
    expect(source).toContain("Sync now");
  });

  it("marks a real sync-time rejection as needing attention rather than retrying forever", () => {
    const syncStart = source.indexOf("async function syncQueuedSales()");
    const body = source.slice(syncStart, source.indexOf("useEffect(() => {"));
    expect(body).toContain("markQueuedSaleError");
    expect(body).toContain("removeQueuedSale(organizationId, entry.clientRequestId)");
  });
});

describe("product-picker.tsx: creating a new product requires a connection", () => {
  it("disables 'New product' while offline instead of attempting to queue a catalogue write", () => {
    const source = read("src/app/app/pos/sell/product-picker.tsx");
    expect(source).toContain("disabled={!isOnline}");
    expect(source).toContain("Adding a new product needs a connection");
  });
});
