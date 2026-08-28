import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testDb } from "../setup/db";
import { cleanupTestOrg, createTestOrg, type TestOrg } from "../setup/fixtures";
import {
  approveControlledDispense,
  createMedicine,
  createPatient,
  createPrescriber,
  createPrescription,
  dispense,
  findBatchByBarcode,
  findMedicineByBarcode,
  PharmacyNotFoundError,
  PharmacyStockError,
  PharmacyWorkflowError,
  receiveBatch,
  recordStockAdjustment,
  recordWriteOff,
  rejectControlledDispense,
} from "@/modules/pharmacy/service";

/**
 * Real-Postgres coverage for the Pharmacy clinical-upgrades tranche:
 * tenant-scoped barcode lookup, controlled-drug maker-checker (same-actor
 * block, tenant isolation/IDOR on approve/reject, concurrency), and the
 * append-only stock-reconciliation workflows (negative-stock guard,
 * concurrency, audit trail). Structural (source-string) coverage of the
 * same tranche lives in test/pharmacy-clinical-upgrades.test.ts.
 *
 * Permission-gating (who may call approve/reject/reconcile) is enforced at
 * the Server Action layer, not in these service functions — see the
 * PHARMACY_RESTRICTED_APPROVE wiring covered by
 * test/pharmacy-clinical-upgrades.test.ts, matching this suite's own
 * existing convention of not duplicating RBAC checks at this layer.
 */

let orgA: TestOrg;
let orgB: TestOrg;
let approverAId: string;
let approverBId: string;

beforeAll(async () => {
  [orgA, orgB] = await Promise.all([createTestOrg("pharmacy-clinical-a"), createTestOrg("pharmacy-clinical-b")]);
  const approvers = await Promise.all([
    testDb.user.create({ data: { name: "Pharmacy Approver A", email: `pharmacy-approver-a-${Date.now()}-${Math.random().toString(36).slice(2)}@example.invalid`, passwordHash: "integration-test-not-for-login", status: "ACTIVE" } }),
    testDb.user.create({ data: { name: "Pharmacy Approver B", email: `pharmacy-approver-b-${Date.now()}-${Math.random().toString(36).slice(2)}@example.invalid`, passwordHash: "integration-test-not-for-login", status: "ACTIVE" } }),
  ]);
  [approverAId, approverBId] = approvers.map((user) => user.id);
});

afterAll(async () => {
  await cleanupTestOrg(orgA);
  await cleanupTestOrg(orgB);
  await testDb.user.deleteMany({ where: { id: { in: [approverAId, approverBId] } } });
});

async function newControlledMedicine(org: TestOrg, suffix: string) {
  return createMedicine(org.organizationId, { sku: `CTRL-${suffix}`, name: `Controlled ${suffix}`, unit: "tablet", medicineClass: "CONTROLLED", sellingPrice: "5.00", reorderPoint: 0, requiresPrescription: true });
}

async function newControlledDispenseFixture(org: TestOrg, suffix: string, quantityPrescribed = 10) {
  const medicine = await newControlledMedicine(org, suffix);
  const [patient, prescriber] = await Promise.all([
    createPatient(org.organizationId, { patientNumber: `PAT-${suffix}`, fullName: `Patient ${suffix}` }),
    createPrescriber(org.organizationId, { fullName: `Dr. ${suffix}`, registrationNumber: `REG-${suffix}` }),
  ]);
  const prescription = await createPrescription(org.organizationId, {
    prescriptionNumber: `RX-${suffix}`,
    patientId: patient.id,
    prescriberId: prescriber.id,
    prescribedAt: new Date(),
    expiresAt: new Date(Date.now() + 86_400_000),
    lines: [{ medicineId: medicine.id, quantityPrescribed, dosage: "1 tablet", frequency: "once daily" }],
  });
  const prescriptionLine = await testDb.pharmacyPrescriptionLine.findFirstOrThrow({ where: { prescriptionId: prescription.id, medicineId: medicine.id } });
  return { medicine, patient, prescription, prescriptionLine };
}

function controlledDispenseData(fixture: Awaited<ReturnType<typeof newControlledDispenseFixture>>, suffix: string, quantity: number) {
  return {
    dispensingNumber: `DSP-${suffix}`,
    patientId: fixture.patient.id,
    prescriptionId: fixture.prescription.id,
    discount: "0",
    lines: [{ medicineId: fixture.medicine.id, quantity, prescriptionLineId: fixture.prescriptionLine.id }],
  };
}

describe("Pharmacy barcode lookup tenant isolation", () => {
  it("never surfaces another tenant's medicine or batch by barcode", async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const medicine = await createMedicine(orgA.organizationId, { sku: `BC-${suffix}`, name: "Barcoded medicine", unit: "tablet", medicineClass: "OTC", sellingPrice: "2.00", reorderPoint: 0, requiresPrescription: false, barcode: `BARCODE-${suffix}` });
    await receiveBatch(orgA.organizationId, orgA.userId, { medicineId: medicine.id, batchNumber: `LOT-${suffix}`, quantity: 10, costPrice: "1.00", expiryDate: new Date(Date.now() + 86_400_000), barcode: `LOTCODE-${suffix}` });

    expect(await findMedicineByBarcode(orgA.organizationId, `BARCODE-${suffix}`)).not.toBeNull();
    expect(await findMedicineByBarcode(orgB.organizationId, `BARCODE-${suffix}`)).toBeNull();
    expect(await findBatchByBarcode(orgA.organizationId, `LOTCODE-${suffix}`)).not.toBeNull();
    expect(await findBatchByBarcode(orgB.organizationId, `LOTCODE-${suffix}`)).toBeNull();
  });

  it("rejects a duplicate active barcode within the same organization", async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await createMedicine(orgA.organizationId, { sku: `DUP-A-${suffix}`, name: "First", unit: "tablet", medicineClass: "OTC", sellingPrice: "2.00", reorderPoint: 0, requiresPrescription: false, barcode: `SHARED-${suffix}` });
    await expect(createMedicine(orgA.organizationId, { sku: `DUP-B-${suffix}`, name: "Second", unit: "tablet", medicineClass: "OTC", sellingPrice: "2.00", reorderPoint: 0, requiresPrescription: false, barcode: `SHARED-${suffix}` })).rejects.toBeInstanceOf(PharmacyStockError);
  });
});

describe("Pharmacy controlled-drug maker-checker (real Postgres)", () => {
  it("holds a controlled dispense as pending approval and moves no stock until approved", async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const fixture = await newControlledDispenseFixture(orgA, suffix);
    const { medicine } = fixture;
    await receiveBatch(orgA.organizationId, orgA.userId, { medicineId: medicine.id, batchNumber: `LOT-${suffix}`, quantity: 10, costPrice: "1.00", expiryDate: new Date(Date.now() + 86_400_000) });

    const pending = await dispense(orgA.organizationId, orgA.userId, controlledDispenseData(fixture, suffix, 2));
    expect(pending.status).toBe("PENDING_APPROVAL");

    const batchAfterRequest = await testDb.pharmacyBatch.findFirstOrThrow({ where: { organizationId: orgA.organizationId, medicineId: medicine.id } });
    expect(batchAfterRequest.quantity).toBe(10);
    const linesAfterRequest = await testDb.pharmacyDispensingLine.findMany({ where: { dispensingId: pending.id } });
    expect(linesAfterRequest).toHaveLength(0);

    const approved = await approveControlledDispense(orgA.organizationId, approverAId, pending.id);
    expect(approved.status).toBe("COMPLETED");
    const batchAfterApproval = await testDb.pharmacyBatch.findFirstOrThrow({ where: { organizationId: orgA.organizationId, medicineId: medicine.id } });
    expect(batchAfterApproval.quantity).toBe(8);
    const restrictedEntry = await testDb.pharmacyRestrictedRegister.findFirst({ where: { dispensingId: pending.id } });
    expect(restrictedEntry).not.toBeNull();
  });

  it("derives the patient from the selected prescription instead of requiring duplicate patient input", async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const fixture = await newControlledDispenseFixture(orgA, suffix);
    await receiveBatch(orgA.organizationId, orgA.userId, { medicineId: fixture.medicine.id, batchNumber: `LOT-${suffix}`, quantity: 10, costPrice: "1.00", expiryDate: new Date(Date.now() + 86_400_000) });
    const data = controlledDispenseData(fixture, suffix, 1);
    const pending = await dispense(orgA.organizationId, orgA.userId, { ...data, patientId: undefined });

    expect(pending.patientId).toBe(fixture.patient.id);
    expect(pending.prescriptionId).toBe(fixture.prescription.id);
  });

  it("blocks the requester from approving or rejecting their own request", async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const fixture = await newControlledDispenseFixture(orgA, suffix);
    const { medicine } = fixture;
    await receiveBatch(orgA.organizationId, orgA.userId, { medicineId: medicine.id, batchNumber: `LOT-${suffix}`, quantity: 10, costPrice: "1.00", expiryDate: new Date(Date.now() + 86_400_000) });
    const pending = await dispense(orgA.organizationId, orgA.userId, controlledDispenseData(fixture, suffix, 1));

    await expect(approveControlledDispense(orgA.organizationId, orgA.userId, pending.id)).rejects.toBeInstanceOf(PharmacyWorkflowError);
    await expect(rejectControlledDispense(orgA.organizationId, orgA.userId, pending.id, "self-reject attempt")).rejects.toBeInstanceOf(PharmacyWorkflowError);

    const untouched = await testDb.pharmacyDispensing.findUniqueOrThrow({ where: { id: pending.id } });
    expect(untouched.status).toBe("PENDING_APPROVAL");
  });

  it("rejecting a pending dispense never moves stock", async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const fixture = await newControlledDispenseFixture(orgA, suffix);
    const { medicine } = fixture;
    await receiveBatch(orgA.organizationId, orgA.userId, { medicineId: medicine.id, batchNumber: `LOT-${suffix}`, quantity: 10, costPrice: "1.00", expiryDate: new Date(Date.now() + 86_400_000) });
    const pending = await dispense(orgA.organizationId, orgA.userId, controlledDispenseData(fixture, suffix, 3));

    const rejected = await rejectControlledDispense(orgA.organizationId, approverAId, pending.id, "Not clinically justified");
    expect(rejected.status).toBe("REJECTED");
    const batch = await testDb.pharmacyBatch.findFirstOrThrow({ where: { organizationId: orgA.organizationId, medicineId: medicine.id } });
    expect(batch.quantity).toBe(10);
  });

  it("rejects approving or rejecting a pending dispense that belongs to a different organization", async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const fixture = await newControlledDispenseFixture(orgA, suffix);
    const { medicine } = fixture;
    await receiveBatch(orgA.organizationId, orgA.userId, { medicineId: medicine.id, batchNumber: `LOT-${suffix}`, quantity: 10, costPrice: "1.00", expiryDate: new Date(Date.now() + 86_400_000) });
    const pending = await dispense(orgA.organizationId, orgA.userId, controlledDispenseData(fixture, suffix, 1));

    await expect(approveControlledDispense(orgB.organizationId, orgB.userId, pending.id)).rejects.toBeInstanceOf(PharmacyNotFoundError);
    await expect(rejectControlledDispense(orgB.organizationId, orgB.userId, pending.id, "cross-tenant")).rejects.toBeInstanceOf(PharmacyNotFoundError);
  });

  it("two concurrent approval attempts on the same pending dispense: exactly one succeeds", async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const fixture = await newControlledDispenseFixture(orgA, suffix);
    const { medicine } = fixture;
    await receiveBatch(orgA.organizationId, orgA.userId, { medicineId: medicine.id, batchNumber: `LOT-${suffix}`, quantity: 10, costPrice: "1.00", expiryDate: new Date(Date.now() + 86_400_000) });
    const pending = await dispense(orgA.organizationId, orgA.userId, controlledDispenseData(fixture, suffix, 2));

    const results = await Promise.allSettled([
      approveControlledDispense(orgA.organizationId, approverAId, pending.id),
      approveControlledDispense(orgA.organizationId, approverBId, pending.id),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    const batch = await testDb.pharmacyBatch.findFirstOrThrow({ where: { organizationId: orgA.organizationId, medicineId: medicine.id } });
    expect(batch.quantity).toBe(8);
  });
});

describe("Pharmacy stock reconciliation negative-stock guard (real Postgres)", () => {
  it("blocks a write-off larger than the batch holds when negative stock is not allowed", async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const medicine = await createMedicine(orgA.organizationId, { sku: `WO-${suffix}`, name: "Write-off medicine", unit: "tablet", medicineClass: "OTC", sellingPrice: "2.00", reorderPoint: 0, requiresPrescription: false });
    const batch = await receiveBatch(orgA.organizationId, orgA.userId, { medicineId: medicine.id, batchNumber: `LOT-${suffix}`, quantity: 5, costPrice: "1.00", expiryDate: new Date(Date.now() + 86_400_000) });

    await expect(recordWriteOff(orgA.organizationId, orgA.userId, { batchId: batch.id, quantity: 10, reason: "too much" })).rejects.toBeInstanceOf(PharmacyStockError);
    const untouched = await testDb.pharmacyBatch.findUniqueOrThrow({ where: { id: batch.id } });
    expect(untouched.quantity).toBe(5);
  });

  it("rejects a stock movement against a batch belonging to a different organization", async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const medicine = await createMedicine(orgA.organizationId, { sku: `IDOR-${suffix}`, name: "IDOR medicine", unit: "tablet", medicineClass: "OTC", sellingPrice: "2.00", reorderPoint: 0, requiresPrescription: false });
    const batch = await receiveBatch(orgA.organizationId, orgA.userId, { medicineId: medicine.id, batchNumber: `LOT-${suffix}`, quantity: 5, costPrice: "1.00", expiryDate: new Date(Date.now() + 86_400_000) });

    await expect(recordWriteOff(orgB.organizationId, orgB.userId, { batchId: batch.id, quantity: 1, reason: "cross-tenant" })).rejects.toBeInstanceOf(PharmacyNotFoundError);
    await expect(recordStockAdjustment(orgB.organizationId, orgB.userId, { batchId: batch.id, quantityDelta: -1, reason: "cross-tenant" })).rejects.toBeInstanceOf(PharmacyNotFoundError);
  });

  it("two concurrent write-offs that together would exceed the batch: exactly one succeeds, quantity never goes negative", async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const medicine = await createMedicine(orgA.organizationId, { sku: `RACE-${suffix}`, name: "Race medicine", unit: "tablet", medicineClass: "OTC", sellingPrice: "2.00", reorderPoint: 0, requiresPrescription: false });
    const batch = await receiveBatch(orgA.organizationId, orgA.userId, { medicineId: medicine.id, batchNumber: `LOT-${suffix}`, quantity: 5, costPrice: "1.00", expiryDate: new Date(Date.now() + 86_400_000) });

    const results = await Promise.allSettled([
      recordWriteOff(orgA.organizationId, orgA.userId, { batchId: batch.id, quantity: 4, reason: "race A" }),
      recordWriteOff(orgA.organizationId, orgA.userId, { batchId: batch.id, quantity: 4, reason: "race B" }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    const final = await testDb.pharmacyBatch.findUniqueOrThrow({ where: { id: batch.id } });
    expect(final.quantity).toBe(1);
    expect(final.quantity).toBeGreaterThanOrEqual(0);
  });

  it("records an append-only, immutable movement ledger entry and an audit-log row for every reconciliation", async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const medicine = await createMedicine(orgA.organizationId, { sku: `AUDIT-${suffix}`, name: "Audited medicine", unit: "tablet", medicineClass: "OTC", sellingPrice: "2.00", reorderPoint: 0, requiresPrescription: false });
    const batch = await receiveBatch(orgA.organizationId, orgA.userId, { medicineId: medicine.id, batchNumber: `LOT-${suffix}`, quantity: 5, costPrice: "1.00", expiryDate: new Date(Date.now() + 86_400_000) });

    await recordStockAdjustment(orgA.organizationId, orgA.userId, { batchId: batch.id, quantityDelta: -2, reason: "damaged in transit" });

    const movements = await testDb.pharmacyStockMovement.findMany({ where: { organizationId: orgA.organizationId, batchId: batch.id } });
    expect(movements).toHaveLength(1);
    expect(movements[0].quantityDelta).toBe(-2);
    expect(movements[0].quantityBefore).toBe(5);
    expect(movements[0].quantityAfter).toBe(3);

    const auditRow = await testDb.auditLog.findFirst({ where: { organizationId: orgA.organizationId, module: "pharmacy", action: "stock.adjusted", entityId: movements[0].id } });
    expect(auditRow).not.toBeNull();
  });
});
