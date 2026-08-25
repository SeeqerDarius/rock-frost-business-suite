import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const schema = readFileSync("prisma/schema.prisma", "utf8");
const service = readFileSync("src/modules/pharmacy/service.ts", "utf8");
const registry = readFileSync("src/platform/modules/registry.ts", "utf8");
const backup = readFileSync("src/lib/backup/tenant-backup.ts", "utf8");
const actions = readFileSync("src/app/app/pharmacy/actions.ts", "utf8");

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

  it("posts Accounting revenue only once a controlled dispense is actually completed, not when it's merely requested", () => {
    // A controlled-drug dispense with maker-checker enabled comes back
    // PENDING_APPROVAL from dispense() — nothing was dispensed yet. Posting
    // revenue at request time (unconditionally) meant a rejected controlled
    // dispense left a phantom revenue entry in Accounting for a sale that
    // never happened, since rejectControlledDispenseAction() never reversed
    // it. The fix: gate completeDispensing()'s post on status === "COMPLETED",
    // and post only once approveControlledDispenseAction() actually
    // completes the sale.
    expect(actions).toContain('if (dispensing.status === "COMPLETED")');
    expect(actions).toContain("const approved = await runOrRedirect(() => approveControlledDispense(tenant.organizationId, tenant.userId, parsed.data.dispensingId), \"/app/pharmacy/dispensing\");");
    const approveBlock = actions.slice(actions.indexOf("export async function approveControlledDispenseAction"), actions.indexOf("export async function rejectControlledDispenseAction"));
    expect(approveBlock).toContain("postModuleRevenue(tenant.organizationId, {");
  });

  it("updatePatient scopes the update by organizationId in the same where as id, so a patient id from another tenant 404s instead of being silently edited", () => {
    expect(service).toContain("db.pharmacyPatient.update({ where: { id, organizationId }, data })");
  });

  it("upsertPatient creates when no id is submitted and updates in place when one is, matching the CRM contacts edit pattern", () => {
    expect(actions).toContain("export async function upsertPatient(formData: FormData) {");
    const upsertBlock = actions.slice(actions.indexOf("export async function upsertPatient"), actions.indexOf("export async function addPrescriber"));
    expect(upsertBlock).toContain("await updatePatient(tenant.organizationId, id, data);");
    expect(upsertBlock).toContain("await createPatient(tenant.organizationId, data);");
  });

  it("routes every service-layer domain error (stock/workflow/prescription rule violations) back to the form instead of crashing to a generic error page", () => {
    // Regression coverage for a live production bug: receiveBatch()/dispense()/etc.
    // throw PharmacyStockError/PharmacyNotFoundError/PharmacyPrescriptionRequiredError/
    // PharmacyWorkflowError with an already-safe, user-facing message (e.g. "Batch
    // quantity and expiry are invalid.") — without runOrRedirect, that throw was
    // unhandled and crashed the whole request instead of redirecting back to the
    // form with the actual reason.
    expect(actions).toContain("async function runOrRedirect<T>(run: () => Promise<T>, errorRoute: string): Promise<T> {");
    for (const call of [
      "runOrRedirect(() => createMedicine(",
      "runOrRedirect(() => receiveBatch(",
      "runOrRedirect(() => recordStockCount(",
      "runOrRedirect(() => recordStockAdjustment(",
      "runOrRedirect(() => recordWriteOff(",
      "runOrRedirect(() => recordSupplierReturn(",
      "runOrRedirect(() => recordPatientReturn(",
      "runOrRedirect(() => updateBatchStatus(",
      "runOrRedirect(() => createPrescription(",
      "runOrRedirect(() => dispense(",
      "runOrRedirect(() => approveControlledDispense(",
      "runOrRedirect(() => rejectControlledDispense(",
      "runOrRedirect(() => reverseDispensing(",
    ]) {
      expect(actions).toContain(call);
    }
  });
});
