/**
 * Pure functions returning the text body for each per-module SMS
 * notification (Phase 3 of the SMS integration plan) - mirrors
 * src/lib/email-templates.ts's pure-template pattern, minus HTML escaping,
 * since an SMS body has no markup to escape.
 */

function formatDate(value: Date): string {
  return value.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function formatDateTime(value: Date): string {
  return value.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function pharmacyPickupReadySms(patientName: string): { body: string } {
  return { body: `Hi ${patientName}, your prescription/order is ready for pickup at the pharmacy. Thank you for choosing us.` };
}

export function hotelBookingConfirmedSms(input: {
  guestName: string;
  propertyName: string;
  confirmationCode: string;
  arrivalDate: Date;
  departureDate: Date;
}): { body: string } {
  return {
    body: `Hi ${input.guestName}, your reservation at ${input.propertyName} is confirmed. Confirmation code: ${input.confirmationCode}. Arrival: ${formatDate(input.arrivalDate)}, Departure: ${formatDate(input.departureDate)}. We look forward to hosting you.`,
  };
}

export function payrollPayslipIssuedSms(input: { employeeName: string; netPay: string; payDate: Date }): { body: string } {
  return { body: `Hi ${input.employeeName}, your payslip has been issued. Net pay: ${input.netPay}, pay date: ${formatDate(input.payDate)}.` };
}

export function hospitalAppointmentReminderSms(input: {
  patientName: string;
  facilityName: string;
  providerName: string;
  scheduledStart: Date;
}): { body: string } {
  return {
    body: `Hi ${input.patientName}, reminder: you have an appointment with ${input.providerName} at ${input.facilityName} on ${formatDateTime(input.scheduledStart)}. Please arrive 15 minutes early.`,
  };
}
