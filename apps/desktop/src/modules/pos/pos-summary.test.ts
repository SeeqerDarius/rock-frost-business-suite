import { describe, expect, it } from "vitest";
import { computePosSummary } from "@/modules/pos/pos-summary";
import type { PosRegisterRow, PosSaleRow, PosSessionRow } from "@/modules/pos/pos-data";

function sale(overrides: Partial<PosSaleRow["data"]> = {}, hasPendingLocalChange = false): PosSaleRow {
  return {
    entityId: crypto.randomUUID(),
    hasPendingLocalChange,
    data: {
      registerId: "r1",
      sessionId: "s1",
      saleNumber: "SALE-1",
      customerName: null,
      paymentMethod: "CASH",
      status: "COMPLETED",
      subtotal: "10.00",
      total: "10.00",
      createdAt: new Date().toISOString(),
      lines: [],
      ...overrides,
    },
  };
}

function session(status: "OPEN" | "CLOSED"): PosSessionRow {
  return {
    entityId: crypto.randomUUID(),
    hasPendingLocalChange: false,
    data: { registerId: "r1", status, openedAt: new Date().toISOString(), openingFloat: "0", closingCash: null, closedAt: null, register: { name: "Front", warehouseId: null } },
  };
}

function register(): PosRegisterRow {
  return { entityId: crypto.randomUUID(), version: 0, hasPendingLocalChange: false, data: { name: "Front", warehouseId: null, active: true } };
}

describe("computePosSummary", () => {
  it("counts registers and open sessions directly", () => {
    const summary = computePosSummary([], [register(), register()], [session("OPEN"), session("CLOSED")]);
    expect(summary.registerCount).toBe(2);
    expect(summary.openSessionCount).toBe(1);
  });

  it("excludes refunded sales from totals but counts them separately", () => {
    const summary = computePosSummary([sale({ total: "10.00" }), sale({ status: "REFUNDED", total: "5.00" })], [], []);
    expect(summary.allTimeSalesCount).toBe(1);
    expect(summary.allTimeSalesTotal).toBe(10);
    expect(summary.refundedCount).toBe(1);
  });

  it("only counts sales created today toward today's totals", () => {
    const yesterday = new Date(Date.now() - 86_400_000).toISOString();
    const summary = computePosSummary([sale({ total: "10.00" }), sale({ total: "20.00", createdAt: yesterday })], [], []);
    expect(summary.todaySalesCount).toBe(1);
    expect(summary.todaySalesTotal).toBe(10);
    expect(summary.allTimeSalesTotal).toBe(30);
  });

  it("buckets non-refunded sales by payment method", () => {
    const summary = computePosSummary(
      [sale({ paymentMethod: "CASH", total: "10.00" }), sale({ paymentMethod: "CASH", total: "5.00" }), sale({ paymentMethod: "CARD", total: "20.00" })],
      [],
      [],
    );
    expect(summary.byPaymentMethod.CASH).toEqual({ count: 2, total: 15 });
    expect(summary.byPaymentMethod.CARD).toEqual({ count: 1, total: 20 });
  });
});
