import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as hospital from "@/modules/hospital/service";
import { testDb } from "../setup/db";
import { createTestOrg, cleanupTestOrg, type TestOrg } from "../setup/fixtures";

/**
 * Real-Postgres concurrency and immutability coverage for
 * src/modules/hospital/service.ts. Every race test fires genuinely
 * concurrent requests (Promise.allSettled) against the same underlying
 * rows and asserts the final committed state, the same discipline used by
 * test/integration/concurrency/accounting.test.ts and installment.test.ts.
 */

let org: TestOrg;
let facility: Awaited<ReturnType<typeof hospital.createHospitalFacility>>;
let provider: Awaited<ReturnType<typeof hospital.createHospitalProvider>>;
let ward: Awaited<ReturnType<typeof hospital.createHospitalWard>>;

beforeAll(async () => {
  org = await createTestOrg("hospital-concurrency");
  facility = await hospital.createHospitalFacility(org.organizationId, { code: "MAIN", name: "Main Hospital" });
  provider = await hospital.createHospitalProvider(org.organizationId, { facilityId: facility.id, name: "Dr. Concurrency" });
  ward = await hospital.createHospitalWard(org.organizationId, { facilityId: facility.id, code: "W1", name: "Ward 1" });
});

afterAll(async () => {
  await cleanupTestOrg(org);
});

describe("Hospital concurrency (real Postgres)", () => {
  it("two concurrent patient registrations both succeed with distinct MRNs", async () => {
    const input = { firstName: "Race", lastName: "Patient", dateOfBirth: new Date("2000-01-01"), sex: "OTHER" as const };
    const [a, b] = await Promise.all([
      hospital.createHospitalPatient(org.organizationId, input),
      hospital.createHospitalPatient(org.organizationId, input),
    ]);
    expect(a.mrn).not.toBe(b.mrn);
    const count = await testDb.hospitalPatient.count({ where: { organizationId: org.organizationId, mrn: { in: [a.mrn, b.mrn] } } });
    expect(count).toBe(2);
  });

  it("two concurrent appointments that overlap for the same provider: exactly one succeeds", async () => {
    const patient = await hospital.createHospitalPatient(org.organizationId, { firstName: "Overlap", lastName: "Patient", dateOfBirth: new Date("1988-03-03"), sex: "MALE" });
    const start = new Date("2031-05-05T09:00:00");
    const end = new Date("2031-05-05T09:30:00");

    const results = await Promise.allSettled([
      hospital.createHospitalAppointment(org.organizationId, { facilityId: facility.id, providerId: provider.id, patientId: patient.id, scheduledStart: start, scheduledEnd: end, reason: "Race A" }),
      hospital.createHospitalAppointment(org.organizationId, { facilityId: facility.id, providerId: provider.id, patientId: patient.id, scheduledStart: start, scheduledEnd: end, reason: "Race B" }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(hospital.HospitalStateError);

    const count = await testDb.hospitalAppointment.count({ where: { organizationId: org.organizationId, providerId: provider.id, scheduledStart: start } });
    expect(count).toBe(1);
  });

  it("two concurrent admissions into the same bed: exactly one succeeds, the bed is never double-occupied", async () => {
    const bed = await hospital.createHospitalBed(org.organizationId, { wardId: ward.id, code: `RACE-${Date.now()}` });
    const patientOne = await hospital.createHospitalPatient(org.organizationId, { firstName: "Bed", lastName: "One", dateOfBirth: new Date("1975-01-01"), sex: "MALE" });
    const patientTwo = await hospital.createHospitalPatient(org.organizationId, { firstName: "Bed", lastName: "Two", dateOfBirth: new Date("1975-01-02"), sex: "FEMALE" });
    const [encounterOne, encounterTwo] = await Promise.all([
      hospital.createHospitalEncounter(org.organizationId, { facilityId: facility.id, patientId: patientOne.id, providerId: provider.id, type: "INPATIENT" }),
      hospital.createHospitalEncounter(org.organizationId, { facilityId: facility.id, patientId: patientTwo.id, providerId: provider.id, type: "INPATIENT" }),
    ]);

    const results = await Promise.allSettled([
      hospital.admitHospitalPatient(org.organizationId, { facilityId: facility.id, patientId: patientOne.id, encounterId: encounterOne.id, admittingProviderId: provider.id, bedId: bed.id }),
      hospital.admitHospitalPatient(org.organizationId, { facilityId: facility.id, patientId: patientTwo.id, encounterId: encounterTwo.id, admittingProviderId: provider.id, bedId: bed.id }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(hospital.HospitalStateError);

    const admissionCount = await testDb.hospitalAdmission.count({ where: { organizationId: org.organizationId, bedId: bed.id, status: "ADMITTED" } });
    expect(admissionCount).toBe(1);
    const finalBed = await testDb.hospitalBed.findUniqueOrThrow({ where: { id: bed.id } });
    expect(finalBed.status).toBe("OCCUPIED");
  });

  it("two concurrent payments that together would overpay an invoice: exactly one succeeds, balance never goes negative", async () => {
    const patient = await hospital.createHospitalPatient(org.organizationId, { firstName: "Bill", lastName: "Patient", dateOfBirth: new Date("1992-06-06"), sex: "FEMALE" });
    const invoice = await hospital.createHospitalInvoice(org.organizationId, { facilityId: facility.id, patientId: patient.id, lines: [{ description: "Consultation", quantity: 1, unitPrice: "100.00" }] });

    const results = await Promise.allSettled([
      hospital.recordHospitalPayment(org.organizationId, invoice.id, { amount: "70.00", method: "CASH" }),
      hospital.recordHospitalPayment(org.organizationId, invoice.id, { amount: "70.00", method: "CASH" }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(hospital.HospitalStateError);

    const { balance } = await hospital.getHospitalInvoiceBalance(org.organizationId, invoice.id);
    expect(balance.toFixed(2)).toBe("30.00");
    expect(balance.gte(0)).toBe(true);
  });

  it("two concurrent payments that together exactly settle an invoice both succeed and the invoice becomes PAID", async () => {
    const patient = await hospital.createHospitalPatient(org.organizationId, { firstName: "Exact", lastName: "Payer", dateOfBirth: new Date("1992-07-07"), sex: "MALE" });
    const invoice = await hospital.createHospitalInvoice(org.organizationId, { facilityId: facility.id, patientId: patient.id, lines: [{ description: "Ward fee", quantity: 1, unitPrice: "100.00" }] });

    const [a, b] = await Promise.all([
      hospital.recordHospitalPayment(org.organizationId, invoice.id, { amount: "50.00", method: "CASH" }),
      hospital.recordHospitalPayment(org.organizationId, invoice.id, { amount: "50.00", method: "CASH" }),
    ]);
    expect(a.receiptNumber).not.toBe(b.receiptNumber);

    const finalInvoice = await testDb.hospitalInvoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(finalInvoice.status).toBe("PAID");
  });

  it("a verified lab result is never mutated by a correction — the prior row's value is preserved and a new row supersedes it", async () => {
    const patient = await hospital.createHospitalPatient(org.organizationId, { firstName: "Immutable", lastName: "Result", dateOfBirth: new Date("1980-01-01"), sex: "OTHER" });
    const encounter = await hospital.createHospitalEncounter(org.organizationId, { facilityId: facility.id, patientId: patient.id, providerId: provider.id, type: "OUTPATIENT" });
    const test = await hospital.createHospitalLabTest(org.organizationId, { code: `GLU-${Date.now()}`, name: "Glucose", price: "10" });
    const order = await hospital.createHospitalLabOrder(org.organizationId, { encounterId: encounter.id, patientId: patient.id, testIds: [test.id] });
    const itemId = order.items[0].id;

    const original = await hospital.enterHospitalLabResult(org.organizationId, itemId, { value: "90", unit: "mg/dL", abnormalFlag: "NORMAL" });
    await hospital.verifyHospitalLabResult(org.organizationId, original.id);

    // A verified result cannot be edited directly.
    await expect(hospital.enterHospitalLabResult(org.organizationId, itemId, { value: "999" })).rejects.toThrow(hospital.HospitalStateError);

    const corrected = await hospital.correctHospitalLabResult(org.organizationId, original.id, { value: "180", unit: "mg/dL", abnormalFlag: "HIGH", correctionReason: "Transcription error on original entry" });

    const preservedOriginal = await testDb.hospitalLabResult.findUniqueOrThrow({ where: { id: original.id } });
    expect(preservedOriginal.value).toBe("90");
    expect(preservedOriginal.verifiedAt).not.toBeNull();
    expect(corrected.supersedesResultId).toBe(original.id);
    expect(corrected.value).toBe("180");

    const historyCount = await testDb.hospitalLabResult.count({ where: { labOrderItemId: itemId } });
    expect(historyCount).toBe(2);
  });
});
