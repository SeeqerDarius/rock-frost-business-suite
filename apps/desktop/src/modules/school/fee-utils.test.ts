import { describe, expect, it } from "vitest";
import { computeFeeInvoiceOutstanding } from "@/modules/school/fee-utils";
import type { SchoolFeeInvoiceRecord } from "@/modules/school/types";

function invoice(overrides: Partial<SchoolFeeInvoiceRecord> = {}): SchoolFeeInvoiceRecord {
  return {
    academicYearId: "y1", termId: null, studentId: "s1", feeStructureId: null,
    invoiceNumber: "INV-00001", description: "Term 1 fees", amount: "500.00", discount: "0",
    status: "ISSUED", dueDate: null, issuedAt: null, voidedAt: null, payments: [],
    ...overrides,
  };
}

describe("computeFeeInvoiceOutstanding", () => {
  it("returns the full amount when there are no payments", () => {
    expect(computeFeeInvoiceOutstanding(invoice({ amount: "500.00" }))).toBe(500);
  });

  it("subtracts a discount", () => {
    expect(computeFeeInvoiceOutstanding(invoice({ amount: "500.00", discount: "50.00" }))).toBe(450);
  });

  it("subtracts non-refunded payments", () => {
    const record = invoice({
      amount: "500.00",
      payments: [{ id: "p1", amount: "200.00", method: "CASH", reference: null, receivedAt: "2026-08-01", refundedAt: null }],
    });
    expect(computeFeeInvoiceOutstanding(record)).toBe(300);
  });

  it("does not subtract refunded payments", () => {
    const record = invoice({
      amount: "500.00",
      payments: [{ id: "p1", amount: "200.00", method: "CASH", reference: null, receivedAt: "2026-08-01", refundedAt: "2026-08-02" }],
    });
    expect(computeFeeInvoiceOutstanding(record)).toBe(500);
  });

  it("floors at 0 rather than going negative", () => {
    const record = invoice({
      amount: "500.00",
      payments: [{ id: "p1", amount: "500.00", method: "CASH", reference: null, receivedAt: "2026-08-01", refundedAt: null }],
    });
    expect(computeFeeInvoiceOutstanding(record)).toBe(0);
  });
});
