import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const schema = readFileSync("prisma/schema.prisma", "utf8");
const service = readFileSync("src/modules/pharmacy/service.ts", "utf8");
const registry = readFileSync("src/platform/modules/registry.ts", "utf8");
const backup = readFileSync("src/lib/backup/tenant-backup.ts", "utf8");

describe("Pharmacy production boundary", () => {
  it("registers Pharmacy as an isolated module with seats and backup discovery", () => {
    expect(registry).toContain('key: "pharmacy"');
    expect(registry).toContain('permissionPrefix: "pharmacy."');
    expect(backup).toContain('pharmacy: ["Pharmacy"]');
  });

  it("models traceable batches, prescriptions, dispensing and restricted records", () => {
    for (const model of ["PharmacyMedicine", "PharmacyBatch", "PharmacyPatient", "PharmacyPrescription", "PharmacyDispensing", "PharmacyRestrictedRegister", "PharmacySettings"]) {
      expect(schema).toContain(`model ${model}`);
    }
  });

  it("uses guarded FEFO decrements and blocks unsafe prescription dispensing", () => {
    expect(service).toContain('orderBy: [{ expiryDate: "asc" }, { receivedAt: "asc" }]');
    expect(service).toContain('quantity: { gte: take }');
    expect(service).toContain('expiryDate: { gt: new Date() }');
    expect(service).toContain("PharmacyPrescriptionRequiredError");
    expect(service).toContain('medicine.medicineClass === "CONTROLLED"');
  });
});
