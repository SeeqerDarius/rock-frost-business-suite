import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const normalize = (text: string) => text.replace(/\r\n/g, "\n");
const schema = normalize(readFileSync("prisma/schema.prisma", "utf8"));
const service = normalize(readFileSync("src/modules/pharmacy/service.ts", "utf8"));
const permissions = normalize(readFileSync("src/lib/auth/permissions.ts", "utf8"));
const seed = normalize(readFileSync("prisma/seed-data.ts", "utf8"));
const actions = normalize(readFileSync("src/app/app/pharmacy/actions.ts", "utf8"));

/**
 * Structural coverage for the Pharmacy clinical-upgrades tranche: barcode
 * lookup, controlled-drug maker-checker, and the append-only stock
 * reconciliation workflows. Behavioral (real-Postgres) coverage lives in
 * test/integration/tenant-isolation/pharmacy-clinical-upgrades.test.ts.
 */
describe("Pharmacy barcode fields and lookup", () => {
  it("adds a barcode field to PharmacyBatch (PharmacyMedicine already had one)", () => {
    expect(schema).toMatch(/model PharmacyBatch \{[\s\S]*?barcode\s+String\?/);
  });

  it("exposes tenant-scoped lookup functions that take organizationId from the caller, never from an argument sourced elsewhere", () => {
    expect(service).toContain("export function findMedicineByBarcode(organizationId: string, barcode: string)");
    expect(service).toContain("export function findBatchByBarcode(organizationId: string, barcode: string)");
    expect(service).toMatch(/findMedicineByBarcode[\s\S]{0,120}where: \{ organizationId, barcode/);
    expect(service).toMatch(/findBatchByBarcode[\s\S]{0,120}where: \{ organizationId, barcode/);
  });
});

describe("Pharmacy controlled-drug maker-checker", () => {
  it("adds a configurable enforcement toggle to PharmacySettings, defaulting to enforced", () => {
    expect(schema).toContain("controlledDispenseMakerCheckerEnabled Boolean  @default(true)");
  });

  it("adds PENDING_APPROVAL and REJECTED to the dispensing status enum without removing the existing values", () => {
    expect(schema).toMatch(/enum PharmacyDispensingStatus \{[\s\S]*?PENDING_APPROVAL[\s\S]*?COMPLETED[\s\S]*?REJECTED[\s\S]*?REVERSED[\s\S]*?\}/);
  });

  it("defers stock allocation until approval — dispense() only allocates a batch outside the maker-checker branch", () => {
    const dispenseFn = service.slice(service.indexOf("export async function dispense("), service.indexOf("export async function approveControlledDispense"));
    expect(dispenseFn).toContain('status: "PENDING_APPROVAL"');
    expect(dispenseFn).toContain("pendingLines");
    const pendingBranch = dispenseFn.slice(dispenseFn.indexOf("if (makerCheckerEnabled)"), dispenseFn.indexOf("const dispensing = await tx.pharmacyDispensing.create", dispenseFn.indexOf("if (makerCheckerEnabled)") + 1));
    expect(pendingBranch).not.toContain("dispenseLine(");
  });

  it("blocks the requester from approving or rejecting their own controlled-drug dispense", () => {
    expect(service).toContain("The person who requested this dispense cannot also approve it.");
    expect(service).toContain("The person who requested this dispense cannot also reject it.");
    expect(service).toContain("dispensing.dispensedById === actorId");
  });

  it("adds an approval permission held by Pharmacy Manager and Pharmacist but not Pharmacy Technician", () => {
    for (const file of [permissions, seed]) expect(file).toContain('PHARMACY_RESTRICTED_APPROVE: "pharmacy.restricted.approve"');
    expect(seed).toMatch(/"Pharmacy Manager": moduleRolePermissions\(\[[^\]]*PHARMACY_RESTRICTED_APPROVE/);
    expect(seed).toMatch(/Pharmacist: moduleRolePermissions\(\[[^\]]*PHARMACY_RESTRICTED_APPROVE/);
    const technicianLine = seed.slice(seed.indexOf('"Pharmacy Technician"'), seed.indexOf("\n", seed.indexOf('"Pharmacy Technician"')));
    expect(technicianLine).not.toContain("PHARMACY_RESTRICTED_APPROVE");
  });

  it("wires approve/reject server actions behind PHARMACY_RESTRICTED_APPROVE", () => {
    expect(actions).toMatch(/approveControlledDispenseAction[\s\S]{0,80}PHARMACY_RESTRICTED_APPROVE/);
    expect(actions).toMatch(/rejectControlledDispenseAction[\s\S]{0,80}PHARMACY_RESTRICTED_APPROVE/);
  });
});

describe("Pharmacy append-only stock reconciliation", () => {
  it("adds an append-only PharmacyStockMovement ledger with a type enum covering all five workflows", () => {
    expect(schema).toContain("model PharmacyStockMovement");
    expect(schema).toMatch(/enum PharmacyStockMovementType \{[\s\S]*?COUNT_ADJUSTMENT[\s\S]*?ADJUSTMENT[\s\S]*?WRITE_OFF[\s\S]*?SUPPLIER_RETURN[\s\S]*?PATIENT_RETURN[\s\S]*?\}/);
  });

  it("exports all five workflow functions", () => {
    for (const fn of ["recordStockCount", "recordStockAdjustment", "recordWriteOff", "recordSupplierReturn", "recordPatientReturn"]) {
      expect(service).toContain(`export async function ${fn}(`);
    }
  });

  it("blocks write-offs, supplier returns, and adjustments from taking a batch negative unless the org explicitly allows it", () => {
    expect(service).toContain("allowsNegative(tx, organizationId)");
    expect(service).toContain("This adjustment would take the batch below zero.");
    expect(service).toContain("Cannot write off more than the batch currently holds.");
    expect(service).toContain("Cannot return more than the batch currently holds.");
  });

  it("never silently restocks a patient return as dispensable — quantityDelta is always zero", () => {
    const fn = service.slice(service.indexOf("export async function recordPatientReturn"), service.indexOf("export function listStockMovements"));
    expect(fn).toContain("quantityDelta: 0");
    expect(fn).not.toContain("data: { quantity: quantityAfter }");
  });

  it("logs an audit event for every stock movement", () => {
    for (const action of ["stock.counted", "stock.adjusted", "stock.written_off", "stock.supplier_returned", "stock.patient_returned"]) {
      expect(service).toContain(`action: "${action}"`);
    }
  });
});

describe("Pharmacy production boundary is preserved", () => {
  it("still uses guarded FEFO decrements unchanged by the maker-checker refactor", () => {
    expect(service).toContain('orderBy: [{ expiryDate: "asc" }, { receivedAt: "asc" }]');
    expect(service).toContain('quantity: { gte: take }');
    expect(service).toContain('expiryDate: { gt: new Date() }');
  });
});
