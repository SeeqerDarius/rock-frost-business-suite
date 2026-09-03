import "server-only";

import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

export async function getSchoolOperationalDashboard(organizationId: string, options: { financial: boolean; analytics: boolean }) {
  const today = new Date();
  const dayStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const dayEnd = new Date(dayStart); dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);
  const currentYear = await db.schoolAcademicYear.findFirst({ where: { organizationId, current: true }, include: { terms: { where: { current: true }, take: 1 } } });
  const term = currentYear?.terms[0] ?? null;
  const periodStart = term?.startDate ?? currentYear?.startDate ?? null;
  const termFilter = term ? { termId: term.id } : { termId: "__no_current_term__" };
  const [activeStudents, newAdmissions, withdrawals, missingProfiles, activeClasses, todayAttendance, termAttendance, classesMarkedToday, overdueLoans, transportGaps, uncoveredClasses, invoiceTotals, paymentTotals, overdueTotals] = await Promise.all([
    db.schoolStudent.count({ where: { organizationId, status: "ACTIVE" } }),
    periodStart ? db.schoolStudent.count({ where: { organizationId, admissionDate: { gte: periodStart }, status: { in: ["ACTIVE", "GRADUATED", "WITHDRAWN"] } } }) : 0,
    periodStart ? db.schoolStudentLifecycleEvent.count({ where: { organizationId, toStatus: "WITHDRAWN", createdAt: { gte: periodStart } } }) : 0,
    db.schoolStudent.count({ where: { organizationId, status: "ACTIVE", OR: [{ photoData: null }, { dateOfBirth: null }, { guardians: { none: {} } }] } }),
    db.schoolClass.count({ where: { organizationId, active: true } }),
    db.schoolAttendance.groupBy({ by: ["status"], where: { organizationId, date: { gte: dayStart, lt: dayEnd } }, _count: true }),
    db.schoolAttendance.groupBy({ by: ["status"], where: { organizationId, ...termFilter }, _count: true }),
    db.schoolAttendance.groupBy({ by: ["classId"], where: { organizationId, date: { gte: dayStart, lt: dayEnd } }, _count: true }),
    db.schoolLibraryLoan.count({ where: { organizationId, status: { in: ["BORROWED", "OVERDUE"] }, dueAt: { lt: today } } }),
    db.schoolStudent.count({ where: { organizationId, status: "ACTIVE", transport: { none: {} } } }),
    db.schoolClass.count({ where: { organizationId, active: true, teachers: { none: {} } } }),
    options.financial && term ? db.schoolFeeInvoice.aggregate({ where: { organizationId, termId: term.id, status: { in: ["ISSUED", "PART_PAID", "PAID"] } }, _sum: { amount: true, discount: true } }) : null,
    options.financial && term ? db.schoolFeePayment.aggregate({ where: { organizationId, refundedAt: null, invoice: { termId: term.id, status: { in: ["ISSUED", "PART_PAID", "PAID"] } } }, _sum: { amount: true } }) : null,
    options.financial && term ? db.schoolFeeInvoice.aggregate({ where: { organizationId, termId: term.id, dueDate: { lt: today }, status: { in: ["ISSUED", "PART_PAID"] } }, _sum: { amount: true, discount: true } }) : null,
  ]);
  const toCounts = (rows: Array<{ status: string; _count: number }>) => Object.fromEntries(rows.map((row) => [row.status, row._count]));
  const billed = invoiceTotals ? (invoiceTotals._sum.amount ?? new Prisma.Decimal(0)).minus(invoiceTotals._sum.discount ?? 0) : null;
  const collected = paymentTotals?._sum.amount ?? (options.financial ? new Prisma.Decimal(0) : null);
  const overdueGross = overdueTotals ? (overdueTotals._sum.amount ?? new Prisma.Decimal(0)).minus(overdueTotals._sum.discount ?? 0) : null;
  return {
    period: term ? `${currentYear?.name}, ${term.name}` : currentYear?.name ?? null,
    refreshedAt: today,
    activeStudents, newAdmissions, withdrawals, missingProfiles, activeClasses,
    attendanceToday: toCounts(todayAttendance), attendanceTerm: toCounts(termAttendance),
    incompleteRegisters: Math.max(0, activeClasses - classesMarkedToday.length),
    overdueLoans, transportGaps, uncoveredClasses,
    finance: options.financial ? { billed, collected, outstanding: billed?.minus(collected ?? 0) ?? null, overdueGross } : null,
    analyticsAvailable: options.analytics,
  };
}
