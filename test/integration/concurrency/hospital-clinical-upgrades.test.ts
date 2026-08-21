import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as hospital from "@/modules/hospital/service";
import { testDb } from "../setup/db";
import { createTestOrg, cleanupTestOrg, type TestOrg } from "../setup/fixtures";

/**
 * Real-Postgres coverage for the clinical-upgrades tranche's lab/imaging
 * maker-checker, rejection workflow, duplicate-patient advisory, tenant
 * isolation/IDOR, and concurrency guarantees. Structural (source-string)
 * coverage of the same tranche lives in test/hospital-clinical-upgrades.test.ts.
 */

let orgA: TestOrg;
let orgB: TestOrg;
let facilityA: Awaited<ReturnType<typeof hospital.createHospitalFacility>>;
let providerA: Awaited<ReturnType<typeof hospital.createHospitalProvider>>;

beforeAll(async () => {
  [orgA, orgB] = await Promise.all([createTestOrg("hospital-clinical-a"), createTestOrg("hospital-clinical-b")]);
  facilityA = await hospital.createHospitalFacility(orgA.organizationId, { code: "MAIN", name: "Main Hospital" });
  providerA = await hospital.createHospitalProvider(orgA.organizationId, { facilityId: facilityA.id, name: "Dr. Clinical" });
});

afterAll(async () => {
  await cleanupTestOrg(orgA);
  await cleanupTestOrg(orgB);
});

/** Creates a fresh, unresulted lab order item for orgA and returns its id. */
async function newLabItem() {
  const patient = await hospital.createHospitalPatient(orgA.organizationId, { firstName: "Case", lastName: `Patient-${Date.now()}-${Math.random()}`, dateOfBirth: new Date("1990-01-01"), sex: "OTHER" });
  const encounter = await hospital.createHospitalEncounter(orgA.organizationId, { facilityId: facilityA.id, patientId: patient.id, providerId: providerA.id, type: "OUTPATIENT" });
  const test = await hospital.createHospitalLabTest(orgA.organizationId, { code: `T-${Date.now()}-${Math.random().toString(36).slice(2)}`, name: "Test", price: "10" });
  const order = await hospital.createHospitalLabOrder(orgA.organizationId, { encounterId: encounter.id, patientId: patient.id, testIds: [test.id] });
  return order.items[0].id;
}

describe("Hospital lab result maker-checker (real Postgres)", () => {
  it("blocks the same actor from entering and then verifying their own result when enforcement is on", async () => {
    const itemId = await newLabItem();
    const result = await hospital.enterHospitalLabResult(orgA.organizationId, itemId, { value: "5", enteredById: "actor-same" });
    await expect(hospital.verifyHospitalLabResult(orgA.organizationId, result.id, "actor-same")).rejects.toThrow(hospital.HospitalStateError);
    const stillUnverified = await testDb.hospitalLabResult.findUniqueOrThrow({ where: { id: result.id } });
    expect(stillUnverified.verifiedAt).toBeNull();
  });

  it("allows a different actor to verify", async () => {
    const itemId = await newLabItem();
    const result = await hospital.enterHospitalLabResult(orgA.organizationId, itemId, { value: "5", enteredById: "actor-a" });
    const verified = await hospital.verifyHospitalLabResult(orgA.organizationId, result.id, "actor-b");
    expect(verified.verifiedById).toBe("actor-b");
  });

  it("allows same-actor verification once the facility disables enforcement, and re-blocks it once re-enabled", async () => {
    const disabled = { facilityId: facilityA.id, timezone: "UTC", currency: "USD", mrnPrefix: "MRN", encounterPrefix: "ENC", appointmentPrefix: "APT", admissionPrefix: "ADM", invoicePrefix: "INV", receiptPrefix: "RCT", resultVerificationRequired: true, bedTransferRequiresReason: true, retentionYears: 7 };
    await hospital.upsertHospitalSettings(orgA.organizationId, { ...disabled, labImagingMakerCheckerEnforced: false });
    const itemId = await newLabItem();
    const result = await hospital.enterHospitalLabResult(orgA.organizationId, itemId, { value: "5", enteredById: "actor-same" });
    const verified = await hospital.verifyHospitalLabResult(orgA.organizationId, result.id, "actor-same");
    expect(verified.verifiedById).toBe("actor-same");
    await hospital.upsertHospitalSettings(orgA.organizationId, { ...disabled, labImagingMakerCheckerEnforced: true });
  });
});

describe("Hospital lab result rejection workflow (real Postgres)", () => {
  it("reopens the item for a fresh entry after rejection, and never mutates the rejected row afterward", async () => {
    const itemId = await newLabItem();
    const result = await hospital.enterHospitalLabResult(orgA.organizationId, itemId, { value: "bad-entry", enteredById: "actor-a" });
    const rejected = await hospital.rejectHospitalLabResult(orgA.organizationId, result.id, "actor-b", "Illegible handwriting");
    expect(rejected.rejectedAt).not.toBeNull();

    await expect(hospital.verifyHospitalLabResult(orgA.organizationId, result.id, "actor-b")).rejects.toThrow(hospital.HospitalStateError);
    await expect(hospital.rejectHospitalLabResult(orgA.organizationId, result.id, "actor-b", "again")).rejects.toThrow(hospital.HospitalStateError);

    const fresh = await hospital.enterHospitalLabResult(orgA.organizationId, itemId, { value: "5", enteredById: "actor-a" });
    expect(fresh.id).not.toBe(result.id);
    const preservedRejected = await testDb.hospitalLabResult.findUniqueOrThrow({ where: { id: result.id } });
    expect(preservedRejected.value).toBe("bad-entry");
  });
});

describe("Hospital tenant isolation and IDOR (real Postgres)", () => {
  it("rejects verifying a result that belongs to a different organization", async () => {
    const itemId = await newLabItem();
    const result = await hospital.enterHospitalLabResult(orgA.organizationId, itemId, { value: "5", enteredById: "actor-a" });
    await expect(hospital.verifyHospitalLabResult(orgB.organizationId, result.id, "actor-x")).rejects.toBeInstanceOf(hospital.HospitalNotFoundError);
    const untouched = await testDb.hospitalLabResult.findUniqueOrThrow({ where: { id: result.id } });
    expect(untouched.verifiedAt).toBeNull();
  });

  it("rejects rejecting and correcting a result that belongs to a different organization", async () => {
    const itemId = await newLabItem();
    const result = await hospital.enterHospitalLabResult(orgA.organizationId, itemId, { value: "5", enteredById: "actor-a" });
    await hospital.verifyHospitalLabResult(orgA.organizationId, result.id, "actor-b");
    await expect(hospital.correctHospitalLabResult(orgB.organizationId, result.id, { value: "999", correctionReason: "cross-tenant attempt", enteredById: "actor-x" })).rejects.toBeInstanceOf(hospital.HospitalNotFoundError);

    const itemId2 = await newLabItem();
    const result2 = await hospital.enterHospitalLabResult(orgA.organizationId, itemId2, { value: "5", enteredById: "actor-a" });
    await expect(hospital.rejectHospitalLabResult(orgB.organizationId, result2.id, "actor-x", "cross-tenant")).rejects.toBeInstanceOf(hospital.HospitalNotFoundError);
  });

  it("findHospitalPatientDuplicates never surfaces another tenant's patients", async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await hospital.createHospitalPatient(orgA.organizationId, { firstName: "Cross", lastName: `Tenant-${suffix}`, dateOfBirth: new Date("1985-05-05"), sex: "OTHER" });
    const fromOrgB = await hospital.findHospitalPatientDuplicates(orgB.organizationId, "Cross", `Tenant-${suffix}`, new Date("1985-05-05"));
    expect(fromOrgB).toHaveLength(0);
    const fromOrgA = await hospital.findHospitalPatientDuplicates(orgA.organizationId, "Cross", `Tenant-${suffix}`, new Date("1985-05-05"));
    expect(fromOrgA.length).toBeGreaterThanOrEqual(1);
  });
});

describe("Hospital lab result verification concurrency (real Postgres)", () => {
  it("two concurrent verify attempts on the same result: exactly one succeeds", async () => {
    const itemId = await newLabItem();
    const result = await hospital.enterHospitalLabResult(orgA.organizationId, itemId, { value: "5", enteredById: "actor-a" });

    const results = await Promise.allSettled([
      hospital.verifyHospitalLabResult(orgA.organizationId, result.id, "actor-b"),
      hospital.verifyHospitalLabResult(orgA.organizationId, result.id, "actor-c"),
    ]);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    const final = await testDb.hospitalLabResult.findUniqueOrThrow({ where: { id: result.id } });
    expect(final.verifiedAt).not.toBeNull();
  });

  it("a concurrent verify and reject on the same result: exactly one succeeds", async () => {
    const itemId = await newLabItem();
    const result = await hospital.enterHospitalLabResult(orgA.organizationId, itemId, { value: "5", enteredById: "actor-a" });

    const results = await Promise.allSettled([
      hospital.verifyHospitalLabResult(orgA.organizationId, result.id, "actor-b"),
      hospital.rejectHospitalLabResult(orgA.organizationId, result.id, "actor-c", "racing rejection"),
    ]);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    const final = await testDb.hospitalLabResult.findUniqueOrThrow({ where: { id: result.id } });
    expect(final.verifiedAt !== null || final.rejectedAt !== null).toBe(true);
    expect(final.verifiedAt !== null && final.rejectedAt !== null).toBe(false);
  });
});
