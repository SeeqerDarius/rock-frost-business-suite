import "server-only";

import { db } from "@/lib/db";

/**
 * The School module's read-only boundary into Hostel-owned records. Callers
 * must establish both School and Hostel permissions before invoking it.
 */
export async function getStudentHostelSummary(organizationId: string, studentId: string) {
  const [allocations, invoices] = await Promise.all([
    db.hostelAllocation.findMany({
      where: { organizationId, studentId },
      include: {
        academicYear: true,
        bed: { include: { room: { include: { building: { include: { wardens: { include: { user: { select: { name: true, email: true } } } } } } } } } },
      },
      orderBy: { checkInDate: "desc" },
    }),
    db.hostelFeeInvoice.findMany({
      where: { organizationId, studentId, status: { notIn: ["DRAFT", "VOID"] } },
      include: { payments: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  const billed = invoices.reduce((sum, invoice) => sum + Number(invoice.amount) - Number(invoice.discount), 0);
  const paid = invoices.flatMap((invoice) => invoice.payments).filter((payment) => !payment.refundedAt).reduce((sum, payment) => sum + Number(payment.amount), 0);
  return { allocations, invoices, billed, paid, outstanding: Math.max(0, billed - paid) };
}
