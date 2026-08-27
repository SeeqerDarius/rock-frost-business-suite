import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { testDb } from "../setup/db";
import { createTestOrg, cleanupTestOrg, type TestOrg } from "../setup/fixtures";
import * as hospital from "@/modules/hospital/service";

/**
 * Real-Postgres proof for Phase 3's Hospital trigger: the cron-driven
 * sendDueAppointmentReminders() finds SCHEDULED appointments falling on the
 * calendar day after `now`, at a facility with SMS notifications on, and
 * dedupes against the SmsMessage log so a second sweep never double-texts
 * the same appointment. Only the network call to mNotify is mocked.
 */

const NOW = new Date("2030-01-01T00:00:00.000Z");
const TOMORROW_MORNING = new Date("2030-01-02T09:00:00.000Z");
const DAY_AFTER_MORNING = new Date("2030-01-03T09:00:00.000Z");

let org: TestOrg;
let facility: Awaited<ReturnType<typeof hospital.createHospitalFacility>>;
let provider: Awaited<ReturnType<typeof hospital.createHospitalProvider>>;

beforeAll(async () => {
  org = await createTestOrg("hospital-sms");
  facility = await hospital.createHospitalFacility(org.organizationId, { code: "SMS", name: "Rock Frost Clinic" });
  provider = await hospital.createHospitalProvider(org.organizationId, { facilityId: facility.id, name: "Dr. Adjei" });
});

afterAll(async () => {
  await cleanupTestOrg(org);
});

beforeEach(() => {
  process.env.MNOTIFY_API_KEY = "test-key";
  process.env.MNOTIFY_SENDER_ID = "RockFrost";
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: "success" }) }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function newPatientAndAppointment(label: string, scheduledStart: Date, phone: string | null) {
  const patient = await hospital.createHospitalPatient(org.organizationId, { firstName: label, lastName: "Patient", dateOfBirth: new Date("1990-01-01"), sex: "FEMALE", phone: phone ?? undefined });
  const appointment = await hospital.createHospitalAppointment(org.organizationId, {
    facilityId: facility.id,
    providerId: provider.id,
    patientId: patient.id,
    scheduledStart,
    scheduledEnd: new Date(scheduledStart.getTime() + 30 * 60_000),
    reason: "Checkup",
  });
  return { patient, appointment };
}

describe("Hospital appointment-reminder SMS (real Postgres)", () => {
  it("sends and logs a reminder for a scheduled tomorrow appointment when the facility's setting is on, and never double-texts on a second sweep", async () => {
    await hospital.upsertHospitalSettings(org.organizationId, { facilityId: facility.id, timezone: "UTC", currency: "GHS", mrnPrefix: "MRN", encounterPrefix: "ENC", appointmentPrefix: "APT", admissionPrefix: "ADM", invoicePrefix: "INV", receiptPrefix: "RCT", resultVerificationRequired: true, labImagingMakerCheckerEnforced: true, bedTransferRequiresReason: true, retentionYears: 7, smsNotificationsEnabled: true });
    const { appointment } = await newPatientAndAppointment("Yaw", TOMORROW_MORNING, "0241234567");

    const first = await hospital.sendDueAppointmentReminders(NOW);
    expect(first.sent).toBeGreaterThanOrEqual(1);

    const row = await testDb.smsMessage.findFirst({ where: { organizationId: org.organizationId, purpose: "HOSPITAL_APPT_REMINDER", relatedId: appointment.id } });
    expect(row).toMatchObject({ to: "0241234567", status: "SENT", relatedType: "HospitalAppointment" });

    const second = await hospital.sendDueAppointmentReminders(NOW);
    const rows = await testDb.smsMessage.findMany({ where: { organizationId: org.organizationId, purpose: "HOSPITAL_APPT_REMINDER", relatedId: appointment.id } });
    expect(rows).toHaveLength(1);
    expect(second.sent).toBe(0);
  });

  it("does not send for an appointment outside the next-day window", async () => {
    await hospital.upsertHospitalSettings(org.organizationId, { facilityId: facility.id, timezone: "UTC", currency: "GHS", mrnPrefix: "MRN", encounterPrefix: "ENC", appointmentPrefix: "APT", admissionPrefix: "ADM", invoicePrefix: "INV", receiptPrefix: "RCT", resultVerificationRequired: true, labImagingMakerCheckerEnforced: true, bedTransferRequiresReason: true, retentionYears: 7, smsNotificationsEnabled: true });
    const { appointment } = await newPatientAndAppointment("FarOut", DAY_AFTER_MORNING, "0241234567");

    await hospital.sendDueAppointmentReminders(NOW);

    const row = await testDb.smsMessage.findFirst({ where: { organizationId: org.organizationId, relatedId: appointment.id } });
    expect(row).toBeNull();
  });

  it("does not send when the facility's setting is off", async () => {
    const otherFacility = await hospital.createHospitalFacility(org.organizationId, { code: "OFF", name: "No-SMS Clinic" });
    const otherProvider = await hospital.createHospitalProvider(org.organizationId, { facilityId: otherFacility.id, name: "Dr. Off" });
    const patient = await hospital.createHospitalPatient(org.organizationId, { firstName: "Off", lastName: "Setting", dateOfBirth: new Date("1990-01-01"), sex: "MALE", phone: "0241234567" });
    const appointment = await hospital.createHospitalAppointment(org.organizationId, { facilityId: otherFacility.id, providerId: otherProvider.id, patientId: patient.id, scheduledStart: TOMORROW_MORNING, scheduledEnd: new Date(TOMORROW_MORNING.getTime() + 30 * 60_000), reason: "Checkup" });

    await hospital.sendDueAppointmentReminders(NOW);

    const row = await testDb.smsMessage.findFirst({ where: { organizationId: org.organizationId, relatedId: appointment.id } });
    expect(row).toBeNull();
  });
});
