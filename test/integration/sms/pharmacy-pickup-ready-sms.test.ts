import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { testDb } from "../setup/db";
import { createTestOrg, cleanupTestOrg, type TestOrg } from "../setup/fixtures";
import { createMedicine, createPatient, dispense, receiveBatch, updatePharmacySettings } from "@/modules/pharmacy/service";

/**
 * Real-Postgres proof for Phase 3's Pharmacy trigger: dispense() fires an
 * SMS after its transaction commits, gated on PharmacySettings.smsNotificationsEnabled
 * and the patient having a phone on file. Only the network call to mNotify
 * is mocked; the settings read, patient read, and SmsMessage write are real.
 */

let org: TestOrg;

beforeAll(async () => {
  org = await createTestOrg("pharmacy-sms");
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

async function newOtcMedicine(sku: string) {
  const medicine = await createMedicine(org.organizationId, { sku, name: `Medicine ${sku}`, unit: "tablet", medicineClass: "OTC", sellingPrice: "2.00", reorderPoint: 0, requiresPrescription: false });
  await receiveBatch(org.organizationId, org.userId, { medicineId: medicine.id, batchNumber: `LOT-${sku}`, quantity: 10, costPrice: "1.00", expiryDate: new Date(Date.now() + 86_400_000) });
  return medicine;
}

describe("Pharmacy pickup-ready SMS (real Postgres)", () => {
  it("sends and logs an SMS when the setting is on and the patient has a phone", async () => {
    await updatePharmacySettings(org.organizationId, { receiptPrefix: "PHA", prescriptionValidityDays: 30, expiryAlertDays: 90, requirePatientForControlled: true, controlledDispenseMakerCheckerEnabled: true, allowNegativeStock: false, smsNotificationsEnabled: true });
    const medicine = await newOtcMedicine("SMS-ON");
    const patient = await createPatient(org.organizationId, { patientNumber: "PT-SMS-ON", fullName: "Ama Mensah", phone: "0241234567" });

    const dispensing = await dispense(org.organizationId, org.userId, { dispensingNumber: "DSP-SMS-ON", patientId: patient.id, discount: "0", lines: [{ medicineId: medicine.id, quantity: 1 }] });

    const row = await testDb.smsMessage.findFirst({ where: { organizationId: org.organizationId, purpose: "PHARMACY_PICKUP_READY", relatedId: dispensing.id } });
    expect(row).toMatchObject({ to: "0241234567", status: "SENT", relatedType: "PharmacyDispensing" });
  });

  it("does not send when the setting is off", async () => {
    await updatePharmacySettings(org.organizationId, { receiptPrefix: "PHA", prescriptionValidityDays: 30, expiryAlertDays: 90, requirePatientForControlled: true, controlledDispenseMakerCheckerEnabled: true, allowNegativeStock: false, smsNotificationsEnabled: false });
    const medicine = await newOtcMedicine("SMS-OFF");
    const patient = await createPatient(org.organizationId, { patientNumber: "PT-SMS-OFF", fullName: "Kofi Owusu", phone: "0241234567" });

    const dispensing = await dispense(org.organizationId, org.userId, { dispensingNumber: "DSP-SMS-OFF", patientId: patient.id, discount: "0", lines: [{ medicineId: medicine.id, quantity: 1 }] });

    const row = await testDb.smsMessage.findFirst({ where: { organizationId: org.organizationId, purpose: "PHARMACY_PICKUP_READY", relatedId: dispensing.id } });
    expect(row).toBeNull();
  });

  it("does not send for a walk-in with no registered patient, even with the setting on", async () => {
    await updatePharmacySettings(org.organizationId, { receiptPrefix: "PHA", prescriptionValidityDays: 30, expiryAlertDays: 90, requirePatientForControlled: true, controlledDispenseMakerCheckerEnabled: true, allowNegativeStock: false, smsNotificationsEnabled: true });
    const medicine = await newOtcMedicine("SMS-WALKIN");

    const dispensing = await dispense(org.organizationId, org.userId, { dispensingNumber: "DSP-SMS-WALKIN", discount: "0", lines: [{ medicineId: medicine.id, quantity: 1 }] });

    const row = await testDb.smsMessage.findFirst({ where: { organizationId: org.organizationId, relatedId: dispensing.id } });
    expect(row).toBeNull();
  });
});
