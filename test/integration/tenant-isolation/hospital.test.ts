import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as hospital from "@/modules/hospital/service";
import { cleanupTestOrg, createTestOrg, type TestOrg } from "../setup/fixtures";

let orgA: TestOrg; let orgB: TestOrg;
let facilityA: Awaited<ReturnType<typeof hospital.createHospitalFacility>>;
let facilityB: Awaited<ReturnType<typeof hospital.createHospitalFacility>>;
let providerB: Awaited<ReturnType<typeof hospital.createHospitalProvider>>;
let patientB: Awaited<ReturnType<typeof hospital.createHospitalPatient>>;
let wardB: Awaited<ReturnType<typeof hospital.createHospitalWard>>;
let bedB: Awaited<ReturnType<typeof hospital.createHospitalBed>>;

beforeAll(async () => {
  orgA = await createTestOrg("orgA-hospital");
  orgB = await createTestOrg("orgB-hospital");
  facilityA = await hospital.createHospitalFacility(orgA.organizationId, { code: "A", name: "A General Hospital" });
  facilityB = await hospital.createHospitalFacility(orgB.organizationId, { code: "B", name: "B General Hospital" });
  providerB = await hospital.createHospitalProvider(orgB.organizationId, { facilityId: facilityB.id, name: "Dr. B" });
  patientB = await hospital.createHospitalPatient(orgB.organizationId, { firstName: "Patient", lastName: "B", dateOfBirth: new Date("1990-01-01"), sex: "FEMALE" });
  wardB = await hospital.createHospitalWard(orgB.organizationId, { facilityId: facilityB.id, code: "W1", name: "Ward 1" });
  bedB = await hospital.createHospitalBed(orgB.organizationId, { wardId: wardB.id, code: "B1" });
});

afterAll(async () => {
  await cleanupTestOrg(orgA);
  await cleanupTestOrg(orgB);
});

describe("Hospital service — real tenant isolation", () => {
  it("rejects a cross-tenant provider when scheduling an appointment", async () => {
    const patientA = await hospital.createHospitalPatient(orgA.organizationId, { firstName: "Patient", lastName: "A", dateOfBirth: new Date("1985-05-05"), sex: "MALE" });
    await expect(hospital.createHospitalAppointment(orgA.organizationId, {
      facilityId: facilityA.id, providerId: providerB.id, patientId: patientA.id,
      scheduledStart: new Date("2030-01-01T09:00:00"), scheduledEnd: new Date("2030-01-01T09:30:00"), reason: "Checkup",
    })).rejects.toThrow(hospital.HospitalNotFoundError);
  });

  it("rejects a cross-tenant patient when opening an encounter", async () => {
    const providerA = await hospital.createHospitalProvider(orgA.organizationId, { facilityId: facilityA.id, name: "Dr. A" });
    await expect(hospital.createHospitalEncounter(orgA.organizationId, {
      facilityId: facilityA.id, patientId: patientB.id, providerId: providerA.id, type: "OUTPATIENT",
    })).rejects.toThrow(hospital.HospitalNotFoundError);
  });

  it("rejects admitting into a cross-tenant bed", async () => {
    const providerA = await hospital.createHospitalProvider(orgA.organizationId, { facilityId: facilityA.id, name: "Dr. A2" });
    const patientA = await hospital.createHospitalPatient(orgA.organizationId, { firstName: "Admit", lastName: "A", dateOfBirth: new Date("1970-01-01"), sex: "MALE" });
    const encounterA = await hospital.createHospitalEncounter(orgA.organizationId, { facilityId: facilityA.id, patientId: patientA.id, providerId: providerA.id, type: "INPATIENT" });
    await expect(hospital.admitHospitalPatient(orgA.organizationId, {
      facilityId: facilityA.id, patientId: patientA.id, encounterId: encounterA.id, admittingProviderId: providerA.id, bedId: bedB.id,
    })).rejects.toThrow(hospital.HospitalNotFoundError);
  });

  it("lists only its own patients and providers", async () => {
    const patients = await hospital.listHospitalPatients(orgA.organizationId);
    expect(patients.map((p) => p.id)).not.toContain(patientB.id);
    const providers = await hospital.listHospitalProviders(orgA.organizationId);
    expect(providers.map((p) => p.id)).not.toContain(providerB.id);
  });

  it("rejects a lab order referencing a cross-tenant test catalogue entry", async () => {
    const providerA = await hospital.createHospitalProvider(orgA.organizationId, { facilityId: facilityA.id, name: "Dr. LabA" });
    const patientA = await hospital.createHospitalPatient(orgA.organizationId, { firstName: "Lab", lastName: "A", dateOfBirth: new Date("1995-01-01"), sex: "OTHER" });
    const encounterA = await hospital.createHospitalEncounter(orgA.organizationId, { facilityId: facilityA.id, patientId: patientA.id, providerId: providerA.id, type: "OUTPATIENT" });
    const testB = await hospital.createHospitalLabTest(orgB.organizationId, { code: "GLU", name: "Glucose", price: "10" });
    await expect(hospital.createHospitalLabOrder(orgA.organizationId, { encounterId: encounterA.id, patientId: patientA.id, testIds: [testB.id] })).rejects.toThrow(hospital.HospitalNotFoundError);
  });
});
