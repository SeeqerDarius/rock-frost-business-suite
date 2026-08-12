import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testDb } from "../setup/db";
import { cleanupTestOrg, createTestOrg, type TestOrg } from "../setup/fixtures";
import { createMedicine, dispense, PharmacyNotFoundError, PharmacyStockError, receiveBatch } from "@/modules/pharmacy/service";

let orgA: TestOrg;
let orgB: TestOrg;

beforeAll(async () => {
  [orgA, orgB] = await Promise.all([createTestOrg("pharmacy-a"), createTestOrg("pharmacy-b")]);
});
afterAll(async () => { await cleanupTestOrg(orgA); await cleanupTestOrg(orgB); });

describe("Pharmacy tenant isolation and stock concurrency", () => {
  it("rejects foreign-tenant medicine references", async () => {
    const medicine = await createMedicine(orgA.organizationId, { sku: "A-1", name: "Tenant A medicine", unit: "tablet", medicineClass: "OTC", sellingPrice: "2.00", reorderPoint: 2, requiresPrescription: false });
    await expect(receiveBatch(orgB.organizationId, orgB.userId, { medicineId: medicine.id, batchNumber: "B-FOREIGN", quantity: 2, costPrice: "1.00", expiryDate: new Date(Date.now() + 86_400_000) })).rejects.toBeInstanceOf(PharmacyNotFoundError);
  });

  it("prevents concurrent dispensing from overselling a batch", async () => {
    const medicine = await createMedicine(orgA.organizationId, { sku: "A-2", name: "Concurrency medicine", unit: "tablet", medicineClass: "OTC", sellingPrice: "2.00", reorderPoint: 0, requiresPrescription: false });
    await receiveBatch(orgA.organizationId, orgA.userId, { medicineId: medicine.id, batchNumber: "LOT-1", quantity: 5, costPrice: "1.00", expiryDate: new Date(Date.now() + 86_400_000) });
    const results = await Promise.allSettled([
      dispense(orgA.organizationId, orgA.userId, { dispensingNumber: "DSP-A", discount: "0", lines: [{ medicineId: medicine.id, quantity: 4 }] }),
      dispense(orgA.organizationId, orgA.userId, { dispensingNumber: "DSP-B", discount: "0", lines: [{ medicineId: medicine.id, quantity: 4 }] }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")[0]).toMatchObject({ reason: expect.any(PharmacyStockError) });
    const batch = await testDb.pharmacyBatch.findFirstOrThrow({ where: { organizationId: orgA.organizationId, medicineId: medicine.id } });
    expect(batch.quantity).toBe(1);
  });

  it("does not dispense expired stock", async () => {
    const medicine = await createMedicine(orgA.organizationId, { sku: "A-3", name: "Expired medicine", unit: "tablet", medicineClass: "OTC", sellingPrice: "2.00", reorderPoint: 0, requiresPrescription: false });
    await testDb.pharmacyBatch.create({ data: { organizationId: orgA.organizationId, medicineId: medicine.id, batchNumber: "EXPIRED", quantity: 5, initialQuantity: 5, costPrice: "1", expiryDate: new Date(Date.now() - 86_400_000) } });
    await expect(dispense(orgA.organizationId, orgA.userId, { dispensingNumber: "DSP-EXPIRED", discount: "0", lines: [{ medicineId: medicine.id, quantity: 1 }] })).rejects.toBeInstanceOf(PharmacyStockError);
  });
});
