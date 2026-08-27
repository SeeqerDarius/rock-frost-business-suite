import { describe, it, expect } from "vitest";
import {
  pharmacyPickupReadySms,
  hotelBookingConfirmedSms,
  payrollPayslipIssuedSms,
  hospitalAppointmentReminderSms,
} from "@/lib/sms-templates";

describe("sms-templates", () => {
  it("pharmacyPickupReadySms includes the patient's name", () => {
    expect(pharmacyPickupReadySms("Ama Mensah").body).toContain("Ama Mensah");
  });

  it("hotelBookingConfirmedSms includes the guest name, property, confirmation code, and both dates", () => {
    const { body } = hotelBookingConfirmedSms({
      guestName: "Kwame Boateng",
      propertyName: "Rock Frost Suites",
      confirmationCode: "RSV-00042",
      arrivalDate: new Date("2026-09-01T00:00:00Z"),
      departureDate: new Date("2026-09-05T00:00:00Z"),
    });
    expect(body).toContain("Kwame Boateng");
    expect(body).toContain("Rock Frost Suites");
    expect(body).toContain("RSV-00042");
    expect(body).toContain("01 Sep");
    expect(body).toContain("05 Sep");
    expect(body).toContain("2026");
  });

  it("payrollPayslipIssuedSms includes the employee name, net pay, and pay date", () => {
    const { body } = payrollPayslipIssuedSms({ employeeName: "Efua Asante", netPay: "3200.00", payDate: new Date("2026-08-31T00:00:00Z") });
    expect(body).toContain("Efua Asante");
    expect(body).toContain("3200.00");
    expect(body).toContain("31 Aug 2026");
  });

  it("hospitalAppointmentReminderSms includes the patient, provider, and facility names", () => {
    const { body } = hospitalAppointmentReminderSms({
      patientName: "Yaw Owusu",
      facilityName: "Rock Frost Clinic",
      providerName: "Dr. Adjei",
      scheduledStart: new Date("2026-09-10T09:30:00Z"),
    });
    expect(body).toContain("Yaw Owusu");
    expect(body).toContain("Dr. Adjei");
    expect(body).toContain("Rock Frost Clinic");
  });
});
