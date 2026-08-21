import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as pos from "@/modules/pos/service";
import * as inventory from "@/modules/inventory/service";
import { testDb } from "../setup/db";
import { createTestOrg, cleanupTestOrg, type TestOrg } from "../setup/fixtures";

/**
 * Real-Postgres concurrency proof for the POS module: genuinely simultaneous
 * requests (real Promise.all, not sequential awaits) against createSale()
 * and refundSale(), verifying the final committed state.
 *
 * createSale()'s own pre-check (a getStockGrid() read before the
 * transaction opens) is a friendly UX shortcut, not the real safety
 * mechanism — under true concurrency both callers can pass that pre-check
 * before either has committed, so the actual protection against overselling
 * is Inventory's atomic guarded decrement inside the shared transaction.
 * pos.InsufficientStockError is the exact same class as
 * inventory.InsufficientStockError (POS re-exports it, doesn't subclass
 * it — see the `export { InsufficientStockError, NotFoundError }` in
 * src/modules/pos/service.ts), so whichever layer's check the loser trips
 * on, `instanceof pos.InsufficientStockError` holds either way.
 *
 * createSale() also retries the whole transaction on a saleNumber
 * collision via createWithUniqueRetry (generateSaleNumber() is a
 * count()-then-format that's racy under real concurrency) — test 2 proves
 * that retry actually yields two distinct sale numbers instead of a crash.
 */

let org: TestOrg;

beforeAll(async () => {
  org = await createTestOrg("pos-concurrency");
});

afterAll(async () => {
  await cleanupTestOrg(org);
});

async function setupRegisterAndSession(initialStock: number) {
  const warehouse = await inventory.createWarehouse(org.organizationId, { name: `POS Race Warehouse ${Date.now()}-${Math.random()}` });
  const item = await inventory.createItem(org.organizationId, {
    sku: `POS-RACE-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: "POS Race Item",
    costPrice: "10.00",
  });
  const register = await pos.createRegister(org.organizationId, {
    name: `POS Race Register ${Date.now()}-${Math.random()}`,
    warehouseId: warehouse.id,
  });
  const session = await pos.openSession(org.organizationId, { registerId: register.id, openingFloat: "0" });

  if (initialStock > 0) {
    await inventory.recordMovement(org.organizationId, {
      itemId: item.id,
      warehouseId: warehouse.id,
      type: "RECEIPT",
      quantity: initialStock,
    });
  }

  return { warehouse, item, register, session };
}

async function stockQuantity(itemId: string, warehouseId: string) {
  const row = await testDb.inventoryStock.findUnique({
    where: { itemId_warehouseId: { itemId, warehouseId } },
  });
  return row?.quantity ?? 0;
}

describe("POS concurrency (real Postgres)", () => {
  it("two concurrent sales competing for the same limited stock: exactly one succeeds, final stock reflects only the winner", async () => {
    const { warehouse, item, session } = await setupRegisterAndSession(5);

    const saleInput = {
      sessionId: session.id,
      paymentMethod: "CASH" as const,
      lines: [{ itemId: item.id, description: "Race Item", quantity: 4, unitPrice: "10.00" }],
    };

    const results = await Promise.allSettled([pos.createSale(org.organizationId, saleInput), pos.createSale(org.organizationId, saleInput)]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    // Same class either way: pos.InsufficientStockError re-exports
    // inventory.InsufficientStockError rather than subclassing it.
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(pos.InsufficientStockError);

    // Only the winning sale's 4-unit deduction landed: 5 - 4 = 1.
    const finalQuantity = await stockQuantity(item.id, warehouse.id);
    expect(finalQuantity).toBe(1);
  });

  it("two concurrent sales with plenty of stock: both succeed with distinct sale numbers, exactly 2 PosSale rows", async () => {
    const { item, session } = await setupRegisterAndSession(100);

    const saleInput = {
      sessionId: session.id,
      paymentMethod: "CASH" as const,
      lines: [{ itemId: item.id, description: "Plentiful Item", quantity: 1, unitPrice: "10.00" }],
    };

    const [saleA, saleB] = await Promise.all([pos.createSale(org.organizationId, saleInput), pos.createSale(org.organizationId, saleInput)]);

    expect(saleA.saleNumber).not.toBe(saleB.saleNumber);

    const salesForSession = await testDb.posSale.findMany({ where: { sessionId: session.id } });
    expect(salesForSession).toHaveLength(2);
    const saleNumbers = new Set(salesForSession.map((s) => s.saleNumber));
    expect(saleNumbers.size).toBe(2);
  });

  it("two concurrent refunds on the same completed sale: exactly one succeeds, stock RECEIPT posted only once", async () => {
    const { warehouse, item, session } = await setupRegisterAndSession(20);

    const sale = await pos.createSale(org.organizationId, {
      sessionId: session.id,
      paymentMethod: "CASH" as const,
      lines: [{ itemId: item.id, description: "Refund Item", quantity: 5, unitPrice: "10.00" }],
    });

    const quantityAfterSale = await stockQuantity(item.id, warehouse.id);
    expect(quantityAfterSale).toBe(15); // 20 - 5

    const results = await Promise.allSettled([
      pos.refundSale(org.organizationId, sale.id),
      pos.refundSale(org.organizationId, sale.id),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(pos.SaleStateError);

    const finalSale = await testDb.posSale.findUniqueOrThrow({ where: { id: sale.id } });
    expect(finalSale.status).toBe("REFUNDED");

    // Stock returned exactly once: 15 + 5 = 20 (not 25 from a double refund).
    const finalQuantity = await stockQuantity(item.id, warehouse.id);
    expect(finalQuantity).toBe(20);

    // Exactly one RECEIPT movement was posted for the refund (plus the one
    // original RECEIPT that seeded stock, and the one ISSUE from the sale).
    const receiptCount = await testDb.inventoryMovement.count({
      where: { itemId: item.id, warehouseId: warehouse.id, organizationId: org.organizationId, type: "RECEIPT" },
    });
    expect(receiptCount).toBe(2); // seed RECEIPT + refund RECEIPT
  });

  it("two concurrent partial returns cannot return more than the sold quantity", async () => {
    const { warehouse, item, session } = await setupRegisterAndSession(20);
    const sale = await pos.createSale(org.organizationId, {
      sessionId: session.id,
      paymentMethod: "CASH",
      lines: [{ itemId: item.id, description: "Partial return item", quantity: 5, unitPrice: "10.00" }],
    });
    const line = await testDb.posSaleLine.findFirstOrThrow({ where: { saleId: sale.id } });
    const attempts = await Promise.allSettled([
      pos.returnSaleLines(org.organizationId, sale.id, { lines: [{ saleLineId: line.id, quantity: 4 }], reason: "First return", refundMethod: "CASH" }),
      pos.returnSaleLines(org.organizationId, sale.id, { lines: [{ saleLineId: line.id, quantity: 4 }], reason: "Second return", refundMethod: "CASH" }),
    ]);
    expect(attempts.filter((attempt) => attempt.status === "fulfilled")).toHaveLength(1);
    expect(attempts.filter((attempt) => attempt.status === "rejected")).toHaveLength(1);
    const returned = await testDb.posReturnLine.aggregate({ where: { saleLineId: line.id }, _sum: { quantity: true } });
    expect(returned._sum.quantity).toBe(4);
    expect(await stockQuantity(item.id, warehouse.id)).toBe(19);
  });
});
