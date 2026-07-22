import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as procurement from "@/modules/procurement/service";
import { testDb } from "../setup/db";
import { createTestOrg, cleanupTestOrg, type TestOrg } from "../setup/fixtures";

/**
 * Real-Postgres concurrency coverage for src/modules/procurement/service.ts
 * (Hardening Pass 4, Milestone B). Every test fires genuinely concurrent
 * requests (Promise.all / Promise.allSettled) into the same service
 * function against the same underlying rows, and asserts the final
 * committed state in the database is correct — not just that the promises
 * resolved/rejected as expected.
 */

let orgReceive: TestOrg;
let orgOrderNumbers: TestOrg;
let orgReceiveCancel: TestOrg;

beforeAll(async () => {
  orgReceive = await createTestOrg("orgReceive-procurement");
  orgOrderNumbers = await createTestOrg("orgOrderNumbers-procurement");
  orgReceiveCancel = await createTestOrg("orgReceiveCancel-procurement");
});

afterAll(async () => {
  await cleanupTestOrg(orgReceive);
  await cleanupTestOrg(orgOrderNumbers);
  await cleanupTestOrg(orgReceiveCancel);
});

describe("Procurement concurrency (real Postgres)", () => {
  it("two concurrent partial receives against the same line: exactly one succeeds, receivedQuantity reflects only the winner", async () => {
    const vendor = await procurement.createVendor(orgReceive.organizationId, { name: "Receive Race Vendor" });
    const order = await procurement.createOrder(orgReceive.organizationId, {
      vendorId: vendor.id,
      orderDate: new Date("2026-01-01"),
      lines: [{ description: "Widget", quantity: 10, unitCost: "1.00" }],
    });
    await procurement.sendOrder(orgReceive.organizationId, order.id);

    const fullOrder = await testDb.procurementOrder.findFirstOrThrow({
      where: { id: order.id },
      include: { lines: true },
    });
    const line = fullOrder.lines[0];

    const results = await Promise.allSettled([
      procurement.receiveOrderLine(orgReceive.organizationId, { orderId: order.id, lineId: line.id, quantity: 6 }),
      procurement.receiveOrderLine(orgReceive.organizationId, { orderId: order.id, lineId: line.id, quantity: 6 }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(procurement.ReceiveQuantityError);

    const finalLine = await testDb.procurementOrderLine.findUniqueOrThrow({ where: { id: line.id } });
    expect(finalLine.receivedQuantity).toBe(6);
  });

  it("two concurrent createOrder calls for the same org both succeed with distinct order numbers", async () => {
    const vendor = await procurement.createVendor(orgOrderNumbers.organizationId, { name: "Order Number Race Vendor" });

    const orderInput = {
      vendorId: vendor.id,
      orderDate: new Date("2026-01-01"),
      lines: [{ description: "Gadget", quantity: 1, unitCost: "5.00" }],
    };

    const [orderA, orderB] = await Promise.all([
      procurement.createOrder(orgOrderNumbers.organizationId, orderInput),
      procurement.createOrder(orgOrderNumbers.organizationId, orderInput),
    ]);

    expect(orderA.orderNumber).not.toBe(orderB.orderNumber);

    const count = await testDb.procurementOrder.count({ where: { organizationId: orgOrderNumbers.organizationId } });
    expect(count).toBe(2);
  });

  it("a receive racing a cancel on the same order never applies both inconsistently", async () => {
    const vendor = await procurement.createVendor(orgReceiveCancel.organizationId, { name: "Receive-Cancel Vendor" });
    const item = await testDb.inventoryItem.create({
      data: { organizationId: orgReceiveCancel.organizationId, sku: "RC-SKU-1", name: "Race Item" },
    });
    const warehouse = await testDb.inventoryWarehouse.create({
      data: { organizationId: orgReceiveCancel.organizationId, name: "Race Warehouse" },
    });

    const order = await procurement.createOrder(orgReceiveCancel.organizationId, {
      vendorId: vendor.id,
      orderDate: new Date("2026-01-01"),
      lines: [{ itemId: item.id, description: "Race Widget", quantity: 10, unitCost: "1.00" }],
    });
    await procurement.sendOrder(orgReceiveCancel.organizationId, order.id);

    const fullOrder = await testDb.procurementOrder.findFirstOrThrow({
      where: { id: order.id },
      include: { lines: true },
    });
    const line = fullOrder.lines[0];

    const results = await Promise.allSettled([
      procurement.receiveOrderLine(orgReceiveCancel.organizationId, {
        orderId: order.id,
        lineId: line.id,
        quantity: 5,
        warehouseId: warehouse.id,
      }),
      procurement.cancelOrder(orgReceiveCancel.organizationId, order.id),
    ]);
    const [receiveResult, cancelResult] = results;

    // Exactly one of the two must win — never both applying, never both
    // failing (one of them must always have a valid state transition
    // available at the moment it runs).
    const fulfilledCount = results.filter((r) => r.status === "fulfilled").length;
    expect(fulfilledCount).toBe(1);

    const finalOrder = await testDb.procurementOrder.findFirstOrThrow({
      where: { id: order.id },
      include: { lines: true },
    });
    const finalLine = finalOrder.lines[0];
    const movementCount = await testDb.inventoryMovement.count({ where: { itemId: item.id } });

    if (receiveResult.status === "fulfilled") {
      // Receive won: cancel must have been rejected because the order can
      // no longer be cancelled once stock has been received against it.
      expect(cancelResult.status).toBe("rejected");
      expect((cancelResult as PromiseRejectedResult).reason).toBeInstanceOf(procurement.OrderStateError);
      expect(finalOrder.status).toBe("PARTIALLY_RECEIVED");
      expect(finalLine.receivedQuantity).toBe(5);
      expect(movementCount).toBe(1);
    } else {
      // Cancel won: receive must have been rejected, and no stock movement
      // (partial or duplicate) may exist for an order that was cancelled.
      expect(receiveResult.status).toBe("rejected");
      expect(finalOrder.status).toBe("CANCELLED");
      expect(finalLine.receivedQuantity).toBe(0);
      expect(movementCount).toBe(0);
    }
  });
});
