import "server-only";

import { db } from "@/lib/db";
import { getSchoolBroadsheet } from "./broadsheet-service";

/**
 * Resolves which student(s) a portal user (Parent or Student role) is
 * allowed to see, from the `userId` link on `SchoolGuardian`/`SchoolStudent`
 * - never from a client-supplied id. A user could in principle be linked
 * both ways (a staff member who is also a parent, say), so a Student link
 * always wins since it is the narrowest possible scope (exactly one
 * record, the user's own).
 */
export type SchoolPortalScope =
  | { type: "student"; studentId: string }
  | { type: "guardian"; guardianId: string; studentIds: string[] };

export async function resolveSchoolPortalScope(organizationId: string, userId: string): Promise<SchoolPortalScope | null> {
  const student = await db.schoolStudent.findFirst({ where: { organizationId, userId }, select: { id: true } });
  if (student) return { type: "student", studentId: student.id };

  const guardian = await db.schoolGuardian.findFirst({ where: { organizationId, userId }, include: { students: { select: { studentId: true } } } });
  if (guardian) return { type: "guardian", guardianId: guardian.id, studentIds: guardian.students.map((link) => link.studentId) };

  return null;
}

export interface SchoolPortalStudentSummary {
  student: { id: string; firstName: string; lastName: string; admissionNumber: string; status: string; photoData: string | null };
  currentClassName: string | null;
  attendance: { recent: { date: Date; status: string }[]; presentRate: number | null };
  results: { id: string; examName: string; subjectName: string; marks: number; totalMarks: number; grade: string | null; remark: string | null; publishedAt: Date | null }[];
  broadsheetPosition: { position: number; outOf: number } | null;
  fees: { outstandingTotal: number; invoices: { id: string; invoiceNumber: string; description: string; amount: number; status: string; dueDate: Date | null }[] };
  conduct: { id: string; occurredAt: Date; category: string; classification: string; severity: string }[];
  digitalId: { status: string; expiryDate: Date; publicId: string } | null;
}

/**
 * A student never has more result/fee/attendance history than what the
 * portal shows here - this is a deliberately trimmed self-service view
 * (recent activity, not the full staff-facing history), not the same
 * shape as getSchoolStudentProfile() in student-profile-service.ts, which
 * is a staff-only, permission-gated 360-degree view.
 */
export async function getSchoolPortalStudentSummary(organizationId: string, studentId: string): Promise<SchoolPortalStudentSummary> {
  const student = await db.schoolStudent.findFirst({
    where: { id: studentId, organizationId },
    include: {
      enrollments: { where: { status: "ACTIVE" }, include: { class: true }, take: 1 },
      attendance: { orderBy: { date: "desc" }, take: 10 },
      examResults: { where: { publishedAt: { not: null } }, orderBy: { publishedAt: "desc" }, take: 10, include: { exam: true, subject: true } },
      feeInvoices: { where: { status: { in: ["ISSUED", "PART_PAID", "PAID"] } }, orderBy: { createdAt: "desc" }, take: 10, include: { payments: true } },
      conductRecords: { orderBy: { occurredAt: "desc" }, take: 10 },
      digitalIdCards: { where: { status: "ACTIVE" }, orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  if (!student) throw new Error("Student not found.");

  const currentEnrollment = student.enrollments[0] ?? null;

  const allAttendance = await db.schoolAttendance.findMany({ where: { organizationId, studentId }, select: { status: true } });
  const presentCount = allAttendance.filter((a) => a.status === "PRESENT" || a.status === "LATE").length;
  const presentRate = allAttendance.length > 0 ? Math.round((presentCount / allAttendance.length) * 100) : null;

  let broadsheetPosition: SchoolPortalStudentSummary["broadsheetPosition"] = null;
  const latestResult = student.examResults[0];
  if (currentEnrollment && latestResult) {
    try {
      const broadsheet = await getSchoolBroadsheet(organizationId, currentEnrollment.classId, latestResult.exam.termId);
      const row = broadsheet.rows.find((r) => r.studentId === studentId);
      if (row?.position) broadsheetPosition = { position: row.position, outOf: broadsheet.rows.filter((r) => r.average !== null).length };
    } catch {
      // Class/term no longer resolvable (e.g. mid-transfer) - position is optional, never block the rest of the summary.
    }
  }

  const outstandingTotal = student.feeInvoices.reduce((sum, invoice) => {
    const paid = invoice.payments.filter((p) => !p.refundedAt).reduce((total, p) => total + Number(p.amount), 0);
    return sum + Math.max(0, Number(invoice.amount) - Number(invoice.discount) - paid);
  }, 0);

  return {
    student: { id: student.id, firstName: student.firstName, lastName: student.lastName, admissionNumber: student.admissionNumber, status: student.status, photoData: student.photoData },
    currentClassName: currentEnrollment?.class.name ?? null,
    attendance: { recent: student.attendance.map((a) => ({ date: a.date, status: a.status })), presentRate },
    results: student.examResults.map((result) => ({
      id: result.id,
      examName: result.exam.name,
      subjectName: result.subject.name,
      marks: Number(result.marks),
      totalMarks: Number(result.exam.totalMarks),
      grade: result.grade,
      remark: result.remark,
      publishedAt: result.publishedAt,
    })),
    broadsheetPosition,
    fees: {
      outstandingTotal,
      invoices: student.feeInvoices.map((invoice) => ({ id: invoice.id, invoiceNumber: invoice.invoiceNumber, description: invoice.description, amount: Number(invoice.amount), status: invoice.status, dueDate: invoice.dueDate })),
    },
    conduct: student.conductRecords.map((record) => ({ id: record.id, occurredAt: record.occurredAt, category: record.category, classification: record.classification, severity: record.severity })),
    digitalId: student.digitalIdCards[0] ? { status: student.digitalIdCards[0].status, expiryDate: student.digitalIdCards[0].expiryDate, publicId: student.digitalIdCards[0].publicId } : null,
  };
}
