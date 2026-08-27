import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { testDb } from "../setup/db";
import { createTestOrg, cleanupTestOrg, type TestOrg } from "../setup/fixtures";
import { createHotelGuest, createHotelProperty, createHotelReservation, createHotelRoomType, upsertHotelSettings } from "@/modules/hotel/service";

/**
 * Real-Postgres proof for Phase 3's Hotel trigger: createHotelReservation()
 * sends a confirmation SMS gated on HotelSettings.smsNotificationsEnabled -
 * settings are per-property (not per-organization), so this also proves the
 * property-scoped read actually works. Only the network call to mNotify is
 * mocked.
 */

let org: TestOrg;

beforeAll(async () => {
  org = await createTestOrg("hotel-sms");
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

async function newProperty(code: string) {
  const property = await createHotelProperty(org.organizationId, { code, name: `Property ${code}` });
  const roomType = await createHotelRoomType(org.organizationId, { propertyId: property.id, code: "STD", name: "Standard", capacity: 2, baseRate: "100" });
  return { property, roomType };
}

describe("Hotel booking-confirmed SMS (real Postgres)", () => {
  it("sends and logs an SMS when the property's setting is on and the guest has a phone", async () => {
    const { property, roomType } = await newProperty("SMS-ON");
    await upsertHotelSettings(org.organizationId, { propertyId: property.id, timezone: "Africa/Accra", currency: "GHS", checkInTime: "14:00", checkOutTime: "11:00", taxRate: "0", serviceChargeRate: "0", allowOutstandingCheckout: false, reservationPrefix: "RSV", folioPrefix: "FOL", receiptPrefix: "HRC", orderPrefix: "ORD", autoCreateCheckoutTask: true, housekeepingDueHours: 4, requireHousekeepingInspection: false, smsNotificationsEnabled: true });
    const guest = await createHotelGuest(org.organizationId, { firstName: "Ama", lastName: "Mensah", phone: "0241234567" });

    const reservation = await createHotelReservation(org.organizationId, { propertyId: property.id, roomTypeId: roomType.id, guestId: guest.id, arrivalDate: new Date("2030-01-01"), departureDate: new Date("2030-01-03"), adults: 1, nightlyRate: "100" });

    const row = await testDb.smsMessage.findFirst({ where: { organizationId: org.organizationId, purpose: "HOTEL_BOOKING_CONFIRMED", relatedId: reservation.id } });
    expect(row).toMatchObject({ to: "0241234567", status: "SENT", relatedType: "HotelReservation" });
  });

  it("does not send when the property's setting is off", async () => {
    const { property, roomType } = await newProperty("SMS-OFF");
    const guest = await createHotelGuest(org.organizationId, { firstName: "Kofi", lastName: "Owusu", phone: "0241234567" });

    const reservation = await createHotelReservation(org.organizationId, { propertyId: property.id, roomTypeId: roomType.id, guestId: guest.id, arrivalDate: new Date("2030-02-01"), departureDate: new Date("2030-02-03"), adults: 1, nightlyRate: "100" });

    const row = await testDb.smsMessage.findFirst({ where: { organizationId: org.organizationId, relatedId: reservation.id } });
    expect(row).toBeNull();
  });

  it("does not send when the guest has no phone on file, even with the setting on", async () => {
    const { property, roomType } = await newProperty("SMS-NOPHONE");
    await upsertHotelSettings(org.organizationId, { propertyId: property.id, timezone: "Africa/Accra", currency: "GHS", checkInTime: "14:00", checkOutTime: "11:00", taxRate: "0", serviceChargeRate: "0", allowOutstandingCheckout: false, reservationPrefix: "RSV", folioPrefix: "FOL", receiptPrefix: "HRC", orderPrefix: "ORD", autoCreateCheckoutTask: true, housekeepingDueHours: 4, requireHousekeepingInspection: false, smsNotificationsEnabled: true });
    const guest = await createHotelGuest(org.organizationId, { firstName: "No", lastName: "Phone" });

    const reservation = await createHotelReservation(org.organizationId, { propertyId: property.id, roomTypeId: roomType.id, guestId: guest.id, arrivalDate: new Date("2030-03-01"), departureDate: new Date("2030-03-03"), adults: 1, nightlyRate: "100" });

    const row = await testDb.smsMessage.findFirst({ where: { organizationId: org.organizationId, relatedId: reservation.id } });
    expect(row).toBeNull();
  });
});
