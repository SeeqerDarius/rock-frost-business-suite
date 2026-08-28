import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const schema = readFileSync("prisma/schema.prisma", "utf8");
const service = readFileSync("src/modules/pharmacy/service.ts", "utf8");
const registry = readFileSync("src/platform/modules/registry.ts", "utf8");
const backup = readFileSync("src/lib/backup/tenant-backup.ts", "utf8");
const actions = readFileSync("src/app/app/pharmacy/actions.ts", "utf8");
const dispensingPage = readFileSync("src/app/app/pharmacy/dispensing/page.tsx", "utf8");
const dispensingForm = readFileSync("src/app/app/pharmacy/dispensing/dispensing-form.tsx", "utf8");

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
    const upsertBlock = actions.slice(actions.indexOf("export async function upsertPatient"), actions.indexOf("const prescriberSchema"));
    expect(upsertBlock).toContain("await runOrRedirect(() => updatePatient(tenant.organizationId, id, data), \"/app/pharmacy/patients\");");
    expect(upsertBlock).toContain("await runOrRedirect(() => createPatient(tenant.organizationId, data), \"/app/pharmacy/patients\");");
  });

  it("upsertPrescriber follows the same create-or-update pattern, and addPrescription can register a new patient/prescriber inline for a walk-in with a paper prescription", () => {
    expect(actions).toContain("export async function upsertPrescriber(formData: FormData) {");
    const upsertBlock = actions.slice(actions.indexOf("export async function upsertPrescriber"), actions.indexOf("const NEW_ENTITY"));
    expect(upsertBlock).toContain("await runOrRedirect(() => updatePrescriber(tenant.organizationId, id, data), \"/app/pharmacy/prescriptions\");");
    expect(upsertBlock).toContain("await runOrRedirect(() => createPrescriber(tenant.organizationId, data), \"/app/pharmacy/prescriptions\");");

    const prescriptionBlock = actions.slice(actions.indexOf("export async function addPrescription"), actions.indexOf("export async function completeDispensing"));
    expect(prescriptionBlock).toContain('if (patientId === NEW_ENTITY) {');
    expect(prescriptionBlock).toContain('if (prescriberId === NEW_ENTITY) {');
    expect(prescriptionBlock).toContain("createPatient(tenant.organizationId, { patientNumber: data.newPatientNumber!, fullName: data.newPatientFullName!, phone: data.newPatientPhone })");
    expect(prescriptionBlock).toContain("createPrescriber(tenant.organizationId, { fullName: data.newPrescriberFullName!, registrationNumber: data.newPrescriberRegistrationNumber!, facilityName: data.newPrescriberFacilityName, phone: data.newPrescriberPhone })");
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
      "() => createPrescription(tenant.organizationId, {",
      "runOrRedirect(() => approveControlledDispense(",
      "runOrRedirect(() => rejectControlledDispense(",
      "runOrRedirect(() => reverseDispensing(",
    ]) {
      expect(actions).toContain(call);
    }

    // completeDispensing catches the same error classes directly (not via
    // runOrRedirect) since it returns state for useActionState rather than
    // redirecting - see the dispensing-form.tsx entry below for why.
    const completeDispensingBlock = actions.slice(actions.indexOf("export async function completeDispensing"), actions.indexOf("export async function approveControlledDispenseAction"));
    expect(completeDispensingBlock).toContain("error instanceof PharmacyNotFoundError || error instanceof PharmacyStockError || error instanceof PharmacyPrescriptionRequiredError || error instanceof PharmacyWorkflowError");
    expect(completeDispensingBlock).toContain("return { error: error.message };");
  });

  it("createPatient/createPrescriber convert a duplicate-number unique-constraint violation to a safe, user-facing message instead of a raw Prisma error", () => {
    expect(service).toContain('throw new PharmacyStockError("A patient with this patient number already exists.");');
    expect(service).toContain('throw new PharmacyStockError("A prescriber with this registration number already exists.");');
  });

  it("the Dispensing form's prescription picker only lists prescriptions dispense() will actually accept, so picking one never fails with \"prescription is required\"", () => {
    // Regression coverage for a live production bug: dispense()'s own
    // eligibility query (service.ts) requires status ACTIVE/PARTIALLY_DISPENSED
    // *and* not expired, but the page's dropdown filter only checked status -
    // an expired-but-still-ACTIVE-in-the-database prescription showed up as
    // selectable, then failed at submit with a confusing "An active
    // prescription is required." even though the user clearly picked one.
    expect(service).toContain('OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }]');
    expect(dispensingPage).toContain('const open = rx.filter((x) => ["ACTIVE", "PARTIALLY_DISPENSED"].includes(x.status) && (!x.expiresAt || x.expiresAt > new Date()));');
  });

  it("separates prescription dispensing from over-the-counter sales and only exposes eligible OTC medicines", () => {
    expect(service).toContain('medicine.requiresPrescription || medicine.medicineClass === "PRESCRIPTION_ONLY" || medicine.medicineClass === "CONTROLLED"');
    expect(dispensingPage).toContain('!medicine.requiresPrescription && !["PRESCRIPTION_ONLY", "CONTROLLED"].includes(medicine.medicineClass)');
    expect(dispensingForm).toContain("From prescription");
    expect(dispensingForm).toContain("Over the counter");
    expect(dispensingForm).toContain('name="linesJson"');
  });

  it("prefills the prescription patient and medicines, supports partial dispensing, and preserves entered values on failure", () => {
    // Regression coverage for a live production report: completeDispensing
    // used to redirect to ?error=... on any failure, which remounted the
    // whole server-rendered form and silently discarded every field the
    // user had typed - on top of a generic "check the highlighted fields"
    // banner that never actually highlighted anything, since medicineId had
    // no real required validation wired to it. useActionState keeps the
    // form mounted across a failed submit instead of navigating away.
    expect(actions).toContain("export async function completeDispensing(_previousState: CompleteDispensingState, formData: FormData): Promise<CompleteDispensingState> {");
    const completeDispensingBlockForRedirectCheck = actions.slice(actions.indexOf("export async function completeDispensing"), actions.indexOf("export async function approveControlledDispenseAction"));
    expect(completeDispensingBlockForRedirectCheck).not.toContain("?error=invalid");
    expect(completeDispensingBlockForRedirectCheck).toContain("createDispensingNumber(tenant.organizationId)");
    expect(completeDispensingBlockForRedirectCheck).toContain("dispensingLinesSchema.parse(JSON.parse(parsed.linesJson))");
    expect(dispensingForm).toContain("useActionState(completeDispensing, initialState)");
    expect(dispensingForm).toContain("Patient and medicines fill automatically.");
    expect(dispensingForm).toContain("Math.min(line.remaining, line.stockAvailable)");
    expect(service).toContain("const patientId = prescription?.patientId ?? data.patientId ?? null;");
    expect(service).toContain("patientId, prescriptionId: prescription?.id ?? null");
  });
});
