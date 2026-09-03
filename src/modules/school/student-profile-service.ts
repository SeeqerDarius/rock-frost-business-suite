import "server-only";

import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import QRCode from "qrcode";
import { db } from "@/lib/db";
import { logAuditEvent } from "@/lib/audit";
import { SchoolNotFoundError, SchoolStateError, resolveTeacherClassScope } from "@/modules/school/service";

const cardSecret = () => {
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("Student ID signing is not configured.");
  return secret;
};
const sign = (publicId: string) => createHmac("sha256", cardSecret()).update(`school-id:${publicId}`).digest("base64url");
const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");

export type SchoolStudentProfileAccess = {
  medical: boolean;
  academic: boolean;
  finance: boolean;
  attendance: boolean;
  conduct: boolean;
  digitalId: boolean;
};

export async function getSchoolStudentProfile(organizationId: string, studentId: string, actingUserId: string | undefined, access: SchoolStudentProfileAccess) {
  const classScope = actingUserId ? await resolveTeacherClassScope(organizationId, actingUserId) : null;
  const student = await db.schoolStudent.findFirst({
    where: { id: studentId, organizationId, ...(classScope ? { enrollments: { some: { status: "ACTIVE", classId: { in: [...classScope] } } } } : {}) },
    omit: { medicalNotes: true, allergies: true, accessibilityNotes: true, bloodGroup: true },
    include: {
      campus: true,
      guardians: { include: { guardian: true }, orderBy: { primary: "desc" } },
      enrollments: { include: { class: true, academicYear: { include: { terms: true } } }, orderBy: { enrolledAt: "desc" } },
      lifecycleEvents: { orderBy: { createdAt: "desc" } },
      documents: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!student) throw new SchoolNotFoundError("Student not found.");
  const [medical, attendance, feeInvoices, examResults, digitalIdCards, conductRecords] = await Promise.all([
    access.medical ? db.schoolStudent.findFirst({ where: { id: studentId, organizationId }, select: { medicalNotes: true, allergies: true, accessibilityNotes: true, bloodGroup: true } }) : null,
    access.attendance ? db.schoolAttendance.findMany({ where: { organizationId, studentId }, include: { term: true }, orderBy: { date: "desc" }, take: 400 }) : [],
    access.finance ? db.schoolFeeInvoice.findMany({ where: { organizationId, studentId }, include: { payments: true, term: true, academicYear: true }, orderBy: { createdAt: "desc" } }) : [],
    access.academic ? db.schoolExamResult.findMany({ where: { organizationId, studentId }, include: { exam: { include: { term: true, academicYear: true } }, subject: true }, orderBy: { updatedAt: "desc" } }) : [],
    access.digitalId ? db.schoolDigitalIdCard.findMany({ where: { organizationId, studentId }, orderBy: { createdAt: "desc" } }) : [],
    access.conduct ? db.schoolConductRecord.findMany({ where: { organizationId, studentId }, orderBy: { occurredAt: "desc" } }) : [],
  ]);
  return {
    ...student,
    medicalNotes: medical?.medicalNotes ?? null,
    allergies: medical?.allergies ?? null,
    accessibilityNotes: medical?.accessibilityNotes ?? null,
    bloodGroup: medical?.bloodGroup ?? null,
    attendance,
    feeInvoices,
    examResults,
    digitalIdCards,
    conductRecords,
  };
}

export async function issueSchoolDigitalId(organizationId: string, studentId: string, issuedById: string, baseUrl: string, reissuedFromId?: string) {
  const student = await db.schoolStudent.findFirst({ where: { id: studentId, organizationId }, include: { organization: true, campus: { include: { settings: true } }, guardians: { include: { guardian: true }, orderBy: { primary: "desc" } }, enrollments: { where: { status: "ACTIVE" }, include: { class: true, academicYear: true }, take: 1 } } });
  if (!student) throw new SchoolNotFoundError("Student not found.");
  const settings = student.campus.settings;
  const months = Math.min(60, Math.max(1, settings?.idCardValidityMonths ?? 12));
  const issueDate = new Date();
  const expiryDate = new Date(issueDate);
  expiryDate.setMonth(expiryDate.getMonth() + months);
  const publicId = randomBytes(24).toString("base64url");
  const token = sign(publicId);
  const enrollment = student.enrollments[0];
  const primaryGuardian = student.guardians[0]?.guardian;
  const approvedPublicData = {
    schoolName: student.organization.name,
    schoolLogoUrl: student.organization.logoUrl,
    studentName: `${student.firstName} ${student.lastName}`,
    studentId: student.admissionNumber,
    campus: student.campus.name,
    className: enrollment?.class.name ?? null,
    academicYear: enrollment?.academicYear.name ?? null,
    enrollmentStatus: student.status,
    dateOfBirth: settings?.idCardShowDateOfBirth ? student.dateOfBirth?.toISOString() ?? null : null,
    emergencyContact: settings?.idCardShowEmergencyContact ? primaryGuardian?.phone ?? null : null,
  };
  return db.$transaction(async (tx) => {
    if (reissuedFromId) {
      const prior = await tx.schoolDigitalIdCard.findFirst({ where: { id: reissuedFromId, organizationId, studentId } });
      if (!prior) throw new SchoolNotFoundError("Prior student ID not found.");
      await tx.schoolDigitalIdCard.update({ where: { id: prior.id }, data: { status: "REVOKED", revokedAt: issueDate, revokedById: issuedById, revocationReason: "Reissued" } });
    }
    await tx.schoolDigitalIdCard.updateMany({ where: { organizationId, studentId, status: "ACTIVE" }, data: { status: "REVOKED", revokedAt: issueDate, revokedById: issuedById, revocationReason: "Superseded by a new card" } });
    const card = await tx.schoolDigitalIdCard.create({ data: { organizationId, studentId, publicId, tokenHash: tokenHash(token), issueDate, expiryDate, issuedById, reissuedFromId, approvedPublicData } });
    await logAuditEvent({ organizationId, module: "school", action: reissuedFromId ? "STUDENT_ID_REISSUED" : "STUDENT_ID_ISSUED", entityName: "SchoolDigitalIdCard", entityId: card.id, userId: issuedById, metadata: { studentId, expiryDate: expiryDate.toISOString() } }, tx);
    const verificationUrl = `${baseUrl.replace(/\/$/, "")}/verify/student-id/${publicId}?token=${encodeURIComponent(token)}`;
    return { card, verificationUrl, qrDataUrl: await QRCode.toDataURL(verificationUrl, { errorCorrectionLevel: "M", margin: 1, width: 320 }) };
  });
}

export async function verifySchoolDigitalId(publicId: string, token: string) {
  const expected = sign(publicId);
  const actualBytes = Buffer.from(token);
  const expectedBytes = Buffer.from(expected);
  if (actualBytes.length !== expectedBytes.length || !timingSafeEqual(actualBytes, expectedBytes)) return null;
  const card = await db.schoolDigitalIdCard.findUnique({ where: { publicId } });
  if (!card || card.tokenHash !== tokenHash(token) || card.status !== "ACTIVE" || card.expiryDate <= new Date()) return null;
  return { approved: card.approvedPublicData as Record<string, unknown>, issueDate: card.issueDate, expiryDate: card.expiryDate };
}

export async function getSchoolDigitalIdPresentation(organizationId: string, cardId: string, baseUrl: string) {
  const card = await db.schoolDigitalIdCard.findFirst({
    where: { id: cardId, organizationId },
    include: { organization: true, student: { include: { campus: true } } },
  });
  if (!card) throw new SchoolNotFoundError("Student ID not found.");
  const token = sign(card.publicId);
  if (card.tokenHash !== tokenHash(token)) throw new SchoolStateError("The student ID token is invalid.", "id-token-invalid");
  const verificationUrl = `${baseUrl.replace(/\/$/, "")}/verify/student-id/${card.publicId}?token=${encodeURIComponent(token)}`;
  return { card, verificationUrl, qrDataUrl: await QRCode.toDataURL(verificationUrl, { errorCorrectionLevel: "M", margin: 1, width: 320 }) };
}

export async function revokeSchoolDigitalId(organizationId: string, cardId: string, revokedById: string, reason: string) {
  const result = await db.schoolDigitalIdCard.updateMany({ where: { id: cardId, organizationId, status: "ACTIVE" }, data: { status: "REVOKED", revokedAt: new Date(), revokedById, revocationReason: reason } });
  if (!result.count) throw new SchoolStateError("The student ID is not active.", "id-not-active");
  await logAuditEvent({ organizationId, module: "school", action: "STUDENT_ID_REVOKED", entityName: "SchoolDigitalIdCard", entityId: cardId, userId: revokedById, metadata: { reason } });
}

export async function recordSchoolIdPrint(organizationId: string, cardId: string, printedById: string) {
  const result = await db.schoolDigitalIdCard.updateMany({ where: { id: cardId, organizationId, status: "ACTIVE" }, data: { printedAt: new Date(), printedById, printCount: { increment: 1 } } });
  if (!result.count) throw new SchoolStateError("The student ID is not active.", "id-not-active");
  await logAuditEvent({ organizationId, module: "school", action: "STUDENT_ID_PRINTED", entityName: "SchoolDigitalIdCard", entityId: cardId, userId: printedById });
}

export async function createSchoolConductRecord(organizationId: string, reporterId: string, data: { campusId: string; studentId: string; occurredAt: Date; category: string; classification: "POSITIVE" | "NEGATIVE"; severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"; description: string; assignedReviewerId?: string | null; followUpDate?: Date | null }) {
  const [student, reporter, reviewer] = await Promise.all([
    db.schoolStudent.findFirst({ where: { id: data.studentId, organizationId, campusId: data.campusId } }),
    db.organizationMember.findFirst({ where: { organizationId, userId: reporterId, status: "ACTIVE" } }),
    data.assignedReviewerId ? db.organizationMember.findFirst({ where: { organizationId, userId: data.assignedReviewerId, status: "ACTIVE" } }) : null,
  ]);
  if (!student || !reporter || (data.assignedReviewerId && !reviewer)) throw new SchoolNotFoundError("Student, campus, reporter, or reviewer not found.");
  const record = await db.schoolConductRecord.create({ data: { organizationId, reporterId, ...data } });
  await logAuditEvent({ organizationId, module: "school", action: "STUDENT_CONDUCT_RECORDED", entityName: "SchoolConductRecord", entityId: record.id, userId: reporterId, metadata: { studentId: data.studentId, classification: data.classification, severity: data.severity } });
  return record;
}
