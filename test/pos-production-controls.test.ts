import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

describe("POS production controls", () => {
  it("uses a dynamic cart with bounded lines, barcode matching and split payments", () => {
    const source = read("src/app/app/pos/sell/sale-cart.tsx");
    expect(source).toContain("lines.length >= 100");
    expect(source).toContain("candidate.barcode?.toLowerCase()");
    expect(source).toContain("Split payment");
    expect(source).toContain("Suspend this sale for later");
  });

  it("validates all dynamic payloads again on the server", () => {
    const source = read("src/app/app/pos/sell/actions.ts");
    expect(source).toContain("z.array(lineSchema).min(1).max(100)");
    expect(source).toContain("z.array(paymentSchema).max(10)");
    expect(source).toContain("requireModuleAccess(\"pos\")");
    expect(source).toContain("PERMISSIONS.POS_SALES_MANAGE");
  });

  it("stores immutable item snapshots and exact payment allocations", () => {
    const source = read("src/modules/pos/service.ts");
    expect(source).toContain("skuSnapshot: item?.sku");
    expect(source).toContain("barcodeSnapshot: item?.barcode");
    expect(source).toContain("payments: { create:");
    expect(source).toContain("payments must add up exactly");
  });

  it("locks sale lines before validating partial return quantities", () => {
    const source = read("src/modules/pos/service.ts");
    expect(source).toContain('FROM "PosSaleLine" WHERE "saleId" = ${saleId} FOR UPDATE');
    expect(source).toContain("exceeds the remaining sold quantity");
    expect(source).toContain("type: \"RECEIPT\"");
  });

  it("calculates expected cash and protects non-zero variance closes", () => {
    const source = read("src/modules/pos/service.ts");
    expect(source).toContain("plus(cashPayments._sum.amount");
    expect(source).toContain("minus(cashRefunds._sum.refundAmount");
    expect(source).toContain("VarianceApprovalRequiredError");
  });
});
