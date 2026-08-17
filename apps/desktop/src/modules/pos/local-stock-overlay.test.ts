import { describe, expect, it } from "vitest";
import { LocalStockOverlay } from "@/modules/pos/local-stock-overlay";

describe("LocalStockOverlay", () => {
  it("subtracts quantities sold offline from the cached quantity", () => {
    const overlay = new LocalStockOverlay();
    overlay.recordSaleLines([{ itemId: "i1", quantity: 3 }]);
    expect(overlay.projectedQuantity("i1", 10)).toBe(7);
  });

  it("accumulates across multiple sales for the same item", () => {
    const overlay = new LocalStockOverlay();
    overlay.recordSaleLines([{ itemId: "i1", quantity: 3 }]);
    overlay.recordSaleLines([{ itemId: "i1", quantity: 4 }]);
    expect(overlay.projectedQuantity("i1", 10)).toBe(3);
  });

  it("ignores lines with no itemId (custom, non-catalog lines)", () => {
    const overlay = new LocalStockOverlay();
    overlay.recordSaleLines([{ itemId: null, quantity: 5 }]);
    expect(overlay.projectedQuantity("i1", 10)).toBe(10);
  });

  it("floors at 0 rather than going negative", () => {
    const overlay = new LocalStockOverlay();
    overlay.recordSaleLines([{ itemId: "i1", quantity: 50 }]);
    expect(overlay.projectedQuantity("i1", 10)).toBe(0);
  });

  it("reset() clears all tracked consumption", () => {
    const overlay = new LocalStockOverlay();
    overlay.recordSaleLines([{ itemId: "i1", quantity: 3 }]);
    overlay.reset();
    expect(overlay.projectedQuantity("i1", 10)).toBe(10);
  });

  it("tracks distinct items independently", () => {
    const overlay = new LocalStockOverlay();
    overlay.recordSaleLines([{ itemId: "i1", quantity: 3 }, { itemId: "i2", quantity: 1 }]);
    expect(overlay.projectedQuantity("i1", 10)).toBe(7);
    expect(overlay.projectedQuantity("i2", 5)).toBe(4);
  });
});
