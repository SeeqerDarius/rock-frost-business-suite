import "server-only";

import { Prisma, type HotelPaymentMethod, type SchoolAttendanceStatus, type SchoolInvoiceStatus, type SchoolLibraryLoanStatus, type SchoolStudentStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { logAuditEvent } from "@/lib/audit";
import { createWithUniqueRetry } from "@/lib/unique-retry";
import { buildTrendBuckets, widestTrendLookback, type TrendGranularity } from "@/lib/trend-buckets";
import { sendSms } from "@/lib/sms";
import { schoolAttendanceAbsentSms, schoolExamResultsPublishedSms, schoolFeePaymentReceivedSms } from "@/lib/sms-templates";
import { getSchoolPayrollEligibleEmployee, getSchoolPayrollLinkCandidate, listSchoolPayrollLinkCandidates } from "@/modules/hr/service";

export class SchoolStateError extends Error {
  constructor(message: string, readonly code = "blocked") {
    super(message);
    this.name = "SchoolStateError";
  }
}
export class SchoolNotFoundError extends Error {}

const decimal = (value: Prisma.Decimal.Value) => new Prisma.Decimal(value);

const STUDENT_TRANSITIONS: Record<SchoolStudentStatus, SchoolStudentStatus[]> = {
  APPLICANT: ["ACTIVE", "WITHDRAWN"],
  ACTIVE: ["SUSPENDED", "WITHDRAWN", "GRADUATED"],
  SUSPENDED: ["ACTIVE", "WITHDRAWN"],
  WITHDRAWN: [],
  GRADUATED: [],
};

async function nextCode(organizationId: string, prefix: string, count: () => Promise<number>) {
  return `${prefix}-${String((await count()) + 1).padStart(5, "0")}`;
}

/**
 * Texts every guardian linked to a student who has a phone number, gated
 * by that student's campus's own `SchoolSettings.smsNotificationsEnabled`
 * (off by default - same convention as Hotel/Pharmacy/Payroll/Hospital).
 * `sendSms()` separately enforces the platform-wide kill switch, so this
 * never needs to check that itself. Always called after its triggering
 * write has already committed, and never awaited in a way that would
 * block or fail that write - a slow or failed text is fire-and-forget.
 */
async function notifySchoolGuardians(params: {
  organizationId: string;
  studentId: string;
  smsEnabled: boolean;
  purpose: string;
  relatedType: string;
  relatedId: string;
  body: (guardianFirstName: string) => string;
}) {
  if (!params.smsEnabled) return;
  const links = await db.schoolStudentGuardian.findMany({ where: { organizationId: params.organizationId, studentId: params.studentId }, include: { guardian: true } });
  for (const link of links) {
    if (!link.guardian.phone) continue;
    await sendSms({
      to: link.guardian.phone,
      body: params.body(link.guardian.firstName),
      purpose: params.purpose,
      organizationId: params.organizationId,
      relatedType: params.relatedType,
      relatedId: params.relatedId,
    });
  }
}

export function listSchoolCampuses(organizationId: string) {
  return db.schoolCampus.findMany({ where: { organizationId }, include: { _count: { select: { students: true, classes: true } } }, orderBy: { name: "asc" } });
}

export function createSchoolCampus(organizationId: string, data: { code: string; name: string; address?: string | null; phone?: string | null; email?: string | null }) {
  return db.schoolCampus.create({ data: { organizationId, ...data } });
}

export async function createSchoolAcademicYear(organizationId: string, data: { name: string; startDate: Date; endDate: Date; current?: boolean }) {
  if (data.endDate <= data.startDate) throw new SchoolStateError("Academic year end date must follow its start date.");
  return db.$transaction(async (tx) => {
    if (data.current) await tx.schoolAcademicYear.updateMany({ where: { organizationId, current: true }, data: { current: false } });
    return tx.schoolAcademicYear.create({ data: { organizationId, ...data } });
  });
}

/**
 * Soft-closes an academic year (sets closedAt, clears `current`) without
 * deleting anything underneath it - terms, enrollments, fees, and exams all
 * stay intact and queryable. This is the normal end-of-year action; hard
 * deletion (deleteSchoolAcademicYear) stays reserved for a genuine mistake.
 */
export async function closeSchoolAcademicYear(organizationId: string, yearId: string) {
  const year = await db.schoolAcademicYear.findFirst({ where: { id: yearId, organizationId } });
  if (!year) throw new SchoolNotFoundError("Academic year not found.");
  if (year.closedAt) throw new SchoolStateError("This academic year is already archived.", "already-closed");
  return db.schoolAcademicYear.update({ where: { id: yearId }, data: { closedAt: new Date(), current: false } });
}

/**
 * Hard-deletes an academic year. Only permitted when it has zero terms,
 * enrollments, fee invoices, fee structures, or exams attached - any real
 * academic history must be archived (closeSchoolAcademicYear) instead of
 * destroyed. The action layer additionally requires an admin permission
 * and a re-entered password before calling this.
 */
export async function deleteSchoolAcademicYear(organizationId: string, yearId: string) {
  const year = await db.schoolAcademicYear.findFirst({
    where: { id: yearId, organizationId },
    include: { _count: { select: { terms: true, enrollments: true, feeInvoices: true, feeStructures: true, exams: true } } },
  });
  if (!year) throw new SchoolNotFoundError("Academic year not found.");
  const { terms, enrollments, feeInvoices, feeStructures, exams } = year._count;
  if (terms + enrollments + feeInvoices + feeStructures + exams > 0) {
    throw new SchoolStateError("This academic year has terms or records attached. Archive it instead of deleting.", "has-dependents");
  }
  await db.schoolAcademicYear.delete({ where: { id: yearId } });
}

export async function createSchoolTerm(organizationId: string, data: { academicYearId: string; name: string; startDate: Date; endDate: Date; current?: boolean }) {
  const year = await db.schoolAcademicYear.findFirst({ where: { id: data.academicYearId, organizationId } });
  if (!year) throw new SchoolNotFoundError("Academic year not found.");
  if (data.startDate < year.startDate || data.endDate > year.endDate || data.endDate <= data.startDate) throw new SchoolStateError("Term dates must fall inside the academic year.");
  return db.$transaction(async (tx) => {
    if (data.current) await tx.schoolTerm.updateMany({ where: { organizationId, current: true }, data: { current: false } });
    return tx.schoolTerm.create({ data: { organizationId, ...data } });
  });
}

export function listSchoolStudents(organizationId: string) {
  return db.schoolStudent.findMany({ where: { organizationId }, include: { campus: true, guardians: { include: { guardian: true } }, enrollments: { include: { class: true, academicYear: true } }, lifecycleEvents: { orderBy: { createdAt: "desc" }, take: 10 } }, orderBy: [{ lastName: "asc" }, { firstName: "asc" }] });
}

/**
 * Small tenant-scoped student choice set for operational forms. The cap
 * prevents large organizations from transferring every student into a
 * select; callers expose a separate search field so users can narrow choices.
 */
export async function listSchoolStudentChoices(organizationId: string, input: { query?: string; activeOnly?: boolean; take?: number } = {}) {
  const take = Math.min(100, Math.max(1, Math.floor(Number.isFinite(input.take) ? input.take! : 50)));
  const terms = input.query?.trim().split(/\s+/).filter(Boolean) ?? [];
  const where: Prisma.SchoolStudentWhereInput = {
    organizationId,
    ...(input.activeOnly ? { status: "ACTIVE" } : {}),
    ...(terms.length ? { AND: terms.map((term) => ({ OR: [
      { firstName: { contains: term, mode: "insensitive" as const } },
      { lastName: { contains: term, mode: "insensitive" as const } },
      { admissionNumber: { contains: term, mode: "insensitive" as const } },
    ] })) } : {}),
  };
  const [total, rows] = await Promise.all([
    db.schoolStudent.count({ where }),
    db.schoolStudent.findMany({
      where,
      select: {
        id: true,
        admissionNumber: true,
        firstName: true,
        lastName: true,
        enrollments: { where: { status: "ACTIVE" }, orderBy: [{ enrolledAt: "desc" }, { id: "asc" }], take: 1, select: { classId: true } },
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }, { id: "asc" }],
      take,
    }),
  ]);
  return { rows, total, take };
}

export async function listSchoolStudentPage(organizationId: string, input: { query?: string; status?: SchoolStudentStatus; page?: number; pageSize?: number } = {}) {
  const pageSize = Math.min(100, Math.max(1, Math.floor(Number.isFinite(input.pageSize) ? input.pageSize! : 50)));
  const requestedPage = Math.max(1, Math.floor(Number.isFinite(input.page) ? input.page! : 1));
  const query = input.query?.trim().split(/\s+/).filter(Boolean) ?? [];
  const where: Prisma.SchoolStudentWhereInput = {
    organizationId,
    ...(input.status ? { status: input.status } : {}),
    ...(query.length ? { AND: query.map((term) => ({ OR: [
      { firstName: { contains: term, mode: "insensitive" as const } },
      { lastName: { contains: term, mode: "insensitive" as const } },
      { admissionNumber: { contains: term, mode: "insensitive" as const } },
    ] })) } : {}),
  };
  const total = await db.schoolStudent.count({ where });
  const pageCount = Math.ceil(total / pageSize);
  const page = pageCount === 0 ? 1 : Math.min(requestedPage, pageCount);
  const rows = await db.schoolStudent.findMany({
    where,
    select: {
      id: true,
      admissionNumber: true,
      firstName: true,
      lastName: true,
      dateOfBirth: true,
      admissionDate: true,
      gender: true,
      status: true,
      updatedAt: true,
      campus: { select: { name: true } },
      guardians: {
        orderBy: [{ primary: "desc" }, { id: "asc" }],
        select: { guardianId: true, relationship: true, primary: true, authorizedPickup: true, guardian: { select: { firstName: true, lastName: true, phone: true } } },
      },
      enrollments: {
        where: { status: "ACTIVE" },
        orderBy: [{ enrolledAt: "desc" }, { id: "asc" }],
        select: { status: true, class: { select: { name: true } }, academicYear: { select: { name: true } } },
      },
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }, { id: "asc" }],
    skip: (page - 1) * pageSize,
    take: pageSize,
  });
  return { rows, total, page, pageSize, pageCount };
}

export function createSchoolStudent(organizationId: string, data: { campusId: string; firstName: string; lastName: string; dateOfBirth?: Date | null; gender?: string | null; admissionDate?: Date | null; medicalNotes?: string | null }) {
  return createWithUniqueRetry(async () => {
    const campus = await db.schoolCampus.findFirst({ where: { id: data.campusId, organizationId, active: true } });
    if (!campus) throw new SchoolNotFoundError("Campus not found.");
    return db.schoolStudent.create({ data: { organizationId, admissionNumber: await nextCode(organizationId, "STU", () => db.schoolStudent.count({ where: { organizationId } })), status: "ACTIVE", ...data } });
  });
}

/**
 * Admits a student and creates or selects the primary guardian in the same
 * transaction. The action layer requires guardianData for the unified
 * admission form. This nullable service parameter remains for internal and
 * backwards-compatible callers that intentionally create an unlinked record.
 */
export function admitSchoolStudent(
  organizationId: string,
  studentData: { campusId: string; firstName: string; lastName: string; dateOfBirth?: Date | null; gender?: string | null; admissionDate?: Date | null; medicalNotes?: string | null },
  guardianData?: (
    | { guardianId: string; relationship: string }
    | { firstName: string; lastName: string; phone: string; relationship: string; email?: string | null; occupation?: string | null; address?: string | null }
  ) | null,
) {
  return createWithUniqueRetry(async () => {
    const campus = await db.schoolCampus.findFirst({ where: { id: studentData.campusId, organizationId, active: true } });
    if (!campus) throw new SchoolNotFoundError("Campus not found.");
    return db.$transaction(async (tx) => {
      const student = await tx.schoolStudent.create({ data: { organizationId, admissionNumber: await nextCode(organizationId, "STU", () => tx.schoolStudent.count({ where: { organizationId } })), status: "ACTIVE", ...studentData } });
      if (guardianData) {
        const relationship = guardianData.relationship.trim();
        if (!relationship) throw new SchoolStateError("Guardian relationship is required.");

        let guardian;
        if ("guardianId" in guardianData) {
          guardian = await tx.schoolGuardian.findFirst({ where: { id: guardianData.guardianId, organizationId } });
          if (!guardian) throw new SchoolNotFoundError("Guardian not found.");
        } else {
          const firstName = guardianData.firstName.trim();
          const lastName = guardianData.lastName.trim();
          const phone = guardianData.phone.trim();
          if (!firstName || !lastName || !phone) throw new SchoolStateError("Guardian name and phone are required.");

          guardian = await tx.schoolGuardian.findFirst({
            where: {
              organizationId,
              phone,
              firstName: { equals: firstName, mode: "insensitive" },
              lastName: { equals: lastName, mode: "insensitive" },
            },
          });

          if (!guardian) {
            guardian = await tx.schoolGuardian.create({
              data: {
                organizationId,
                guardianNumber: await nextCode(organizationId, "GRD", () => tx.schoolGuardian.count({ where: { organizationId } })),
                firstName,
                lastName,
                phone,
                email: guardianData.email ?? null,
                occupation: guardianData.occupation ?? null,
                address: guardianData.address ?? null,
              },
            });
          }
        }

        await tx.schoolStudentGuardian.updateMany({ where: { organizationId, studentId: student.id, primary: true }, data: { primary: false } });
        await tx.schoolStudentGuardian.upsert({
          where: { studentId_guardianId: { studentId: student.id, guardianId: guardian.id } },
          update: { relationship, primary: true },
          create: { organizationId, studentId: student.id, guardianId: guardian.id, relationship, primary: true },
        });
      }
      return student;
    });
  });
}

export async function transitionSchoolStudent(
  organizationId: string,
  studentId: string,
  toStatus: SchoolStudentStatus,
  reason?: string | null,
) {
  return db.$transaction(async (tx) => {
    const student = await tx.schoolStudent.findFirst({ where: { id: studentId, organizationId } });
    if (!student) throw new SchoolNotFoundError("Student not found.");
    if (!STUDENT_TRANSITIONS[student.status].includes(toStatus)) {
      throw new SchoolStateError(`A ${student.status.toLowerCase()} student cannot move to ${toStatus.toLowerCase()}.`);
    }

    const now = new Date();
    if (toStatus === "WITHDRAWN" || toStatus === "GRADUATED") {
      await tx.schoolEnrollment.updateMany({
        where: { organizationId, studentId, status: "ACTIVE" },
        data: { status: toStatus === "GRADUATED" ? "COMPLETED" : "WITHDRAWN", endedAt: now },
      });
    }

    const claimed = await tx.schoolStudent.updateMany({
      where: { id: student.id, organizationId, status: student.status },
      data: { status: toStatus },
    });
    if (claimed.count !== 1) throw new SchoolStateError("The student status changed in another request.", "stale-record");
    await tx.schoolStudentLifecycleEvent.create({
      data: { organizationId, studentId, fromStatus: student.status, toStatus, reason: reason || null },
    });
    return tx.schoolStudent.findUniqueOrThrow({ where: { id: student.id } });
  });
}

/**
 * Edits student identity and admission dates without changing the immutable
 * admission number, campus, status, or enrollment history. The caller submits
 * the version it displayed so a concurrent edit cannot silently overwrite it.
 */
export async function updateSchoolStudentProfile(
  organizationId: string,
  studentId: string,
  expectedUpdatedAt: Date,
  data: { firstName: string; lastName: string; dateOfBirth?: Date | null; gender?: string | null; admissionDate?: Date | null },
) {
  const existing = await db.schoolStudent.findFirst({ where: { id: studentId, organizationId }, select: { id: true } });
  if (!existing) throw new SchoolNotFoundError("Student not found.");

  const result = await db.schoolStudent.updateMany({
    where: { id: studentId, organizationId, updatedAt: expectedUpdatedAt },
    data: { ...data, updatedAt: new Date(Math.max(Date.now(), expectedUpdatedAt.getTime() + 1)) },
  });
  if (result.count !== 1) throw new SchoolStateError("This student profile changed in another request. Reload the record and try again.", "stale-record");
  return db.schoolStudent.findFirstOrThrow({ where: { id: studentId, organizationId } });
}

export function createSchoolGuardian(organizationId: string, data: { firstName: string; lastName: string; email?: string | null; phone: string; address?: string | null; occupation?: string | null }) {
  return createWithUniqueRetry(async () => db.schoolGuardian.create({ data: { organizationId, guardianNumber: await nextCode(organizationId, "GRD", () => db.schoolGuardian.count({ where: { organizationId } })), ...data } }));
}

export async function updateSchoolGuardian(
  organizationId: string,
  guardianId: string,
  data: { firstName: string; lastName: string; email?: string | null; phone: string; address?: string | null; occupation?: string | null },
) {
  const guardian = await db.schoolGuardian.findFirst({ where: { id: guardianId, organizationId }, select: { id: true } });
  if (!guardian) throw new SchoolNotFoundError("Guardian not found.");
  const duplicate = await db.schoolGuardian.findFirst({
    where: {
      organizationId,
      id: { not: guardianId },
      phone: data.phone,
      firstName: { equals: data.firstName, mode: "insensitive" },
      lastName: { equals: data.lastName, mode: "insensitive" },
    },
    select: { id: true },
  });
  if (duplicate) throw new SchoolStateError("A guardian with this name and phone already exists.", "guardian-duplicate");
  return db.schoolGuardian.update({ where: { id: guardian.id }, data });
}

export async function linkSchoolGuardian(organizationId: string, studentId: string, guardianId: string, relationship: string, primary = false) {
  const [student, guardian] = await Promise.all([db.schoolStudent.findFirst({ where: { id: studentId, organizationId } }), db.schoolGuardian.findFirst({ where: { id: guardianId, organizationId } })]);
  if (!student || !guardian) throw new SchoolNotFoundError("Student or guardian not found.");
  return db.$transaction(async (tx) => {
    if (primary) await tx.schoolStudentGuardian.updateMany({ where: { organizationId, studentId }, data: { primary: false } });
    return tx.schoolStudentGuardian.upsert({ where: { studentId_guardianId: { studentId, guardianId } }, update: { relationship, primary }, create: { organizationId, studentId, guardianId, relationship, primary } });
  });
}

export function createSchoolClass(organizationId: string, data: { campusId: string; code: string; name: string; gradeLevel?: string | null; capacity?: number | null }) {
  return db.schoolClass.create({ data: { organizationId, ...data } });
}

export async function updateSchoolClassCapacity(organizationId: string, classId: string, capacity: number | null) {
  const schoolClass = await db.schoolClass.findFirst({ where: { id: classId, organizationId }, include: { _count: { select: { enrollments: { where: { status: "ACTIVE" } } } } } });
  if (!schoolClass) throw new SchoolNotFoundError("Class not found.");
  if (capacity !== null && capacity < schoolClass._count.enrollments) {
    throw new SchoolStateError(`Capacity cannot be set below the ${schoolClass._count.enrollments} students currently enrolled.`, "capacity-below-enrolled");
  }
  return db.schoolClass.update({ where: { id: classId }, data: { capacity } });
}

/**
 * Restricts a teacher-role user to only the class(es) they're explicitly
 * assigned in SchoolClassTeacher when they record attendance or exam
 * results (see recordSchoolAttendance/recordSchoolExamResult below).
 * Returns null (no restriction) for anyone with zero assignments - e.g. an
 * Academic Head, Bursar, or Admin who isn't tied to one class. Assignment
 * is opt-in per class rather than implied by holding the seeded "Teacher"
 * role, so an admin can scope any member this way without a hardcoded
 * role-name check.
 */
export async function resolveTeacherClassScope(organizationId: string, userId: string): Promise<Set<string> | null> {
  const assignments = await db.schoolClassTeacher.findMany({ where: { organizationId, userId }, select: { classId: true } });
  return assignments.length > 0 ? new Set(assignments.map((assignment) => assignment.classId)) : null;
}

export async function assignSchoolClassTeacher(organizationId: string, classId: string, userId: string) {
  const [class_, member] = await Promise.all([
    db.schoolClass.findFirst({ where: { id: classId, organizationId } }),
    db.organizationMember.findFirst({ where: { organizationId, userId, status: "ACTIVE" } }),
  ]);
  if (!class_ || !member) throw new SchoolNotFoundError("Class or organization member not found.");
  return db.schoolClassTeacher.upsert({ where: { classId_userId: { classId, userId } }, update: {}, create: { organizationId, classId, userId } });
}

export async function removeSchoolClassTeacher(organizationId: string, classId: string, userId: string) {
  await db.schoolClassTeacher.deleteMany({ where: { organizationId, classId, userId } });
}

export function listSchoolClassTeacherAssignments(organizationId: string) {
  return db.schoolClassTeacher.findMany({ where: { organizationId }, include: { class: true, user: true }, orderBy: { createdAt: "asc" } });
}

/**
 * Active org members who can actually be assigned as a class teacher - only
 * those whose role carries a School permission, not every active member of
 * the organization (which previously let e.g. a Fleet driver or Hospital
 * radiology staffer show up in the teacher picker). There's no single
 * canonical "teacher" permission the way Fleet has one for driver
 * self-service, so any permission under the school.* prefix counts as
 * evidence this member has School access - the same prefix test
 * canAccessModule() uses to gate the module itself. Mirrors the fix already
 * applied to Fleet's driver/owner/mechanic assignment lists.
 */
export function listAssignableTeacherUsers(organizationId: string) {
  return db.organizationMember.findMany({
    where: {
      organizationId,
      status: "ACTIVE",
      role: { rolePermissions: { some: { permission: { key: { startsWith: "school." } } } } },
    },
    include: { user: true, role: true },
    orderBy: { user: { name: "asc" } },
  });
}

export function createSchoolSubject(organizationId: string, data: { code: string; name: string; description?: string | null }) {
  return db.schoolSubject.create({ data: { organizationId, ...data } });
}

export function getSchoolAcademicSetup(organizationId: string) {
  return Promise.all([
    db.schoolAcademicYear.findMany({ where: { organizationId }, include: { terms: true }, orderBy: { startDate: "desc" } }),
    db.schoolClass.findMany({ where: { organizationId }, include: { campus: true, enrollments: { where: { status: "ACTIVE" } } }, orderBy: { name: "asc" } }),
    db.schoolSubject.findMany({ where: { organizationId, active: true }, orderBy: { name: "asc" } }),
  ]);
}

export function listSchoolAcademicYears(organizationId: string) {
  return db.schoolAcademicYear.findMany({ where: { organizationId }, select: { id: true, name: true, closedAt: true, startDate: true, endDate: true, current: true }, orderBy: { startDate: "desc" } });
}

export async function getSchoolEnrollmentRolloverPreview(organizationId: string, academicYearId: string) {
  const year = await db.schoolAcademicYear.findFirst({
    where: { id: academicYearId, organizationId },
    select: {
      id: true,
      name: true,
      enrollments: {
        where: { status: "ACTIVE", student: { status: "ACTIVE" } },
        select: { id: true, studentId: true, classId: true, class: { select: { id: true, code: true, name: true, campusId: true, campus: { select: { name: true } } } } },
        orderBy: [{ class: { name: "asc" } }, { studentId: "asc" }],
        take: 5001,
      },
    },
  });
  if (!year) throw new SchoolNotFoundError("Academic year not found.");
  if (year.enrollments.length > 5000) throw new SchoolStateError("This rollover exceeds the safe batch size of 5,000 learners. Split the work by campus or class.", "rollover-too-large");
  const classes = new Map<string, { id: string; code: string; name: string; campusId: string; campusName: string; learners: number }>();
  for (const enrollment of year.enrollments) {
    const group = classes.get(enrollment.classId) ?? {
      id: enrollment.class.id,
      code: enrollment.class.code,
      name: enrollment.class.name,
      campusId: enrollment.class.campusId,
      campusName: enrollment.class.campus.name,
      learners: 0,
    };
    group.learners += 1;
    classes.set(enrollment.classId, group);
  }
  return { year: { id: year.id, name: year.name }, totalLearners: year.enrollments.length, classes: [...classes.values()] };
}

export async function listSchoolRolloverTargetClasses(organizationId: string, academicYearId: string) {
  const [classes, counts] = await Promise.all([
    db.schoolClass.findMany({
      where: { organizationId, active: true },
      select: { id: true, code: true, name: true, campusId: true, capacity: true, campus: { select: { name: true } } },
      orderBy: [{ campus: { name: "asc" } }, { name: "asc" }, { id: "asc" }],
    }),
    db.schoolEnrollment.groupBy({
      by: ["classId"],
      where: { organizationId, academicYearId, status: "ACTIVE" },
      _count: { _all: true },
    }),
  ]);
  const enrollmentByClass = new Map(counts.map((row) => [row.classId, row._count._all]));
  return classes.map(({ campus, ...row }) => ({ ...row, campusName: campus.name, currentEnrollment: enrollmentByClass.get(row.id) ?? 0 }));
}

export async function rollOverSchoolEnrollments(
  organizationId: string,
  sourceYearId: string,
  targetYearId: string,
  classMapping: Record<string, string>,
  expectedLearnersByClass: Record<string, number>,
  changedById?: string,
) {
  if (sourceYearId === targetYearId) throw new SchoolStateError("Choose two different academic years.", "invalid-rollover-years");
  const mappings = Object.entries(classMapping);
  if (mappings.length === 0 || mappings.length > 250) throw new SchoolStateError("The rollover class mapping is empty or too large.", "invalid-rollover-mapping");
  return db.$transaction(async (tx) => {
    const years = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "SchoolAcademicYear"
      WHERE "organizationId" = ${organizationId} AND "id" IN (${Prisma.join([sourceYearId, targetYearId])})
      ORDER BY "id" FOR UPDATE
    `;
    if (years.length !== 2) throw new SchoolNotFoundError("One or both academic years could not be found.");
    const [sourceYear, targetYear] = await Promise.all([
      tx.schoolAcademicYear.findFirst({ where: { id: sourceYearId, organizationId }, select: { id: true, name: true } }),
      tx.schoolAcademicYear.findFirst({ where: { id: targetYearId, organizationId }, select: { id: true, name: true, closedAt: true } }),
    ]);
    if (!sourceYear || !targetYear) throw new SchoolNotFoundError("One or both academic years could not be found.");
    if (targetYear.closedAt) throw new SchoolStateError("The destination academic year is archived.", "closed-rollover-target");

    const classIds = [...new Set(mappings.map(([, classId]) => classId))];
    const lockedClasses = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "SchoolClass"
      WHERE "organizationId" = ${organizationId} AND "id" IN (${Prisma.join(classIds)}) AND "active" = true
      ORDER BY "id" FOR UPDATE
    `;
    if (lockedClasses.length !== classIds.length) throw new SchoolNotFoundError("A destination class could not be found or is inactive.");
    const classes = await tx.schoolClass.findMany({ where: { organizationId, id: { in: classIds }, active: true }, select: { id: true, campusId: true, capacity: true } });
    const targetClassById = new Map(classes.map((schoolClass) => [schoolClass.id, schoolClass]));

    const sourceEnrollments = await tx.schoolEnrollment.findMany({
      where: { organizationId, academicYearId: sourceYearId, status: "ACTIVE", student: { status: "ACTIVE" } },
      select: { id: true, studentId: true, classId: true, campusId: true },
      orderBy: [{ studentId: "asc" }, { id: "asc" }],
      take: 5001,
    });
    if (sourceEnrollments.length > 5000) throw new SchoolStateError("This rollover exceeds the safe batch size of 5,000 learners. Split the work by campus or class.", "rollover-too-large");
    const sourceClassIds = new Set(sourceEnrollments.map((enrollment) => enrollment.classId));
    if ([...sourceClassIds].some((classId) => !classMapping[classId])) throw new SchoolStateError("Map every class that has active learners before continuing.", "incomplete-rollover-mapping");
    if (mappings.length !== sourceClassIds.size || mappings.some(([classId]) => !sourceClassIds.has(classId))) throw new SchoolStateError("The source classes changed. Reload the rollover preview.", "stale-rollover-preview");
    const actualByClass = new Map<string, number>();
    for (const enrollment of sourceEnrollments) actualByClass.set(enrollment.classId, (actualByClass.get(enrollment.classId) ?? 0) + 1);
    if (Object.keys(expectedLearnersByClass).length !== actualByClass.size || [...actualByClass].some(([classId, count]) => expectedLearnersByClass[classId] !== count)) {
      throw new SchoolStateError("Learner counts changed after the preview. Review the latest counts before continuing.", "stale-rollover-preview");
    }
    for (const enrollment of sourceEnrollments) {
      const targetClass = targetClassById.get(classMapping[enrollment.classId]);
      if (!targetClass || targetClass.campusId !== enrollment.campusId) throw new SchoolStateError("Each learner must stay mapped to a class at the same campus.", "rollover-campus-mismatch");
    }
    const studentIds = [...new Set(sourceEnrollments.map((enrollment) => enrollment.studentId))];
    if (studentIds.length) {
      const lockedStudents = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "SchoolStudent"
        WHERE "organizationId" = ${organizationId} AND "id" IN (${Prisma.join(studentIds)}) AND "status" = 'ACTIVE'::"SchoolStudentStatus"
        ORDER BY "id" FOR UPDATE
      `;
      if (lockedStudents.length !== studentIds.length) throw new SchoolStateError("A learner's status changed. Reload the rollover preview.", "stale-rollover-preview");
    }
    const existingTargets = studentIds.length ? await tx.schoolEnrollment.findMany({
      where: { organizationId, academicYearId: targetYearId, studentId: { in: studentIds } },
      select: { studentId: true },
    }) : [];
    const alreadyEnrolled = new Set(existingTargets.map((enrollment) => enrollment.studentId));
    const eligible = sourceEnrollments.filter((enrollment) => !alreadyEnrolled.has(enrollment.studentId));
    const plannedByClass = new Map<string, number>();
    for (const enrollment of eligible) {
      const targetClassId = classMapping[enrollment.classId];
      plannedByClass.set(targetClassId, (plannedByClass.get(targetClassId) ?? 0) + 1);
    }
    for (const [classId, planned] of plannedByClass) {
      const targetClass = targetClassById.get(classId)!;
      if (targetClass.capacity !== null) {
        const currentCount = await tx.schoolEnrollment.count({ where: { organizationId, academicYearId: targetYearId, classId, status: "ACTIVE" } });
        if (currentCount + planned > targetClass.capacity) throw new SchoolStateError("A destination class does not have enough capacity for this rollover.", "rollover-capacity");
      }
    }

    if (eligible.length) {
      await tx.schoolEnrollment.createMany({ data: eligible.map((enrollment) => ({
        organizationId,
        campusId: enrollment.campusId,
        academicYearId: targetYearId,
        studentId: enrollment.studentId,
        classId: classMapping[enrollment.classId],
      })) });
    }
    if (sourceEnrollments.length) {
      await tx.schoolEnrollment.updateMany({
        where: { organizationId, id: { in: sourceEnrollments.map((enrollment) => enrollment.id) }, status: "ACTIVE" },
        data: { status: "COMPLETED", endedAt: new Date() },
      });
    }
    await logAuditEvent({
      organizationId,
      module: "school",
      action: "STUDENT_ENROLLMENTS_ROLLED_OVER",
      entityName: "SchoolAcademicYear",
      entityId: targetYearId,
      userId: changedById,
      metadata: { sourceYearId, sourceYearName: sourceYear.name, targetYearId, targetYearName: targetYear.name, eligible: eligible.length, alreadyEnrolled: alreadyEnrolled.size, completedSourceEnrollments: sourceEnrollments.length, classMapping },
    }, tx);
    return { created: eligible.length, alreadyEnrolled: alreadyEnrolled.size, sourceCompleted: sourceEnrollments.length };
  }, { isolationLevel: "Serializable" });
}

export function listSchoolGuardians(organizationId: string) {
  return db.schoolGuardian.findMany({
    where: { organizationId },
    select: { id: true, guardianNumber: true, firstName: true, lastName: true, phone: true, email: true, occupation: true, address: true },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }, { id: "asc" }],
  });
}

/**
 * Passport/profile photo storage mirrors InventoryItem.imageData - a
 * base64 data URL in a nullable Text column, read back through a dedicated
 * authenticated streaming route rather than as part of the normal list
 * queries (which don't select photoData at all, keeping the common-path
 * payload small).
 */
/** Cheap id-only lookup for rendering a table's photo column without pulling every row's base64 image data into the list query. */
export async function listSchoolStudentPhotoIds(organizationId: string, studentIds?: string[]) {
  const rows = await db.schoolStudent.findMany({ where: { organizationId, photoData: { not: null }, ...(studentIds ? { id: { in: studentIds } } : {}) }, select: { id: true } });
  return new Set(rows.map((row) => row.id));
}

export async function getSchoolStudentPhoto(organizationId: string, id: string) {
  return db.schoolStudent.findFirst({ where: { id, organizationId }, select: { photoData: true, updatedAt: true } });
}

export async function updateSchoolStudentPhoto(organizationId: string, id: string, photoData: string | null, photoOriginalData?: string | null) {
  const result = await db.schoolStudent.updateMany({ where: { id, organizationId }, data: { photoData, ...(photoOriginalData !== undefined ? { photoOriginalData } : {}) } });
  if (result.count === 0) throw new SchoolNotFoundError("Student not found.");
}

export async function listSchoolGuardianPhotoIds(organizationId: string) {
  const rows = await db.schoolGuardian.findMany({ where: { organizationId, photoData: { not: null } }, select: { id: true } });
  return new Set(rows.map((row) => row.id));
}

export async function getSchoolGuardianPhoto(organizationId: string, id: string) {
  return db.schoolGuardian.findFirst({ where: { id, organizationId }, select: { photoData: true, updatedAt: true } });
}

export async function updateSchoolGuardianPhoto(organizationId: string, id: string, photoData: string | null) {
  const result = await db.schoolGuardian.updateMany({ where: { id, organizationId }, data: { photoData } });
  if (result.count === 0) throw new SchoolNotFoundError("Guardian not found.");
}
export function listSchoolAttendance(organizationId: string) { return db.schoolAttendance.findMany({ where: { organizationId }, include: { student: true, class: true, term: true }, orderBy: { date: "desc" }, take: 250 }); }
export async function listSchoolAttendancePage(organizationId: string, input: { query?: string; status?: SchoolAttendanceStatus; page?: number; pageSize?: number } = {}) {
  const pageSize = Math.min(100, Math.max(1, Math.floor(Number.isFinite(input.pageSize) ? input.pageSize! : 50)));
  const requestedPage = Math.max(1, Math.floor(Number.isFinite(input.page) ? input.page! : 1));
  const terms = input.query?.trim().split(/\s+/).filter(Boolean) ?? [];
  const where: Prisma.SchoolAttendanceWhereInput = {
    organizationId,
    ...(input.status ? { status: input.status } : {}),
    ...(terms.length ? { AND: terms.map((term) => ({ OR: [
      { student: { firstName: { contains: term, mode: "insensitive" as const } } },
      { student: { lastName: { contains: term, mode: "insensitive" as const } } },
      { student: { admissionNumber: { contains: term, mode: "insensitive" as const } } },
      { class: { name: { contains: term, mode: "insensitive" as const } } },
    ] })) } : {}),
  };
  const total = await db.schoolAttendance.count({ where });
  const pageCount = Math.ceil(total / pageSize);
  const page = pageCount === 0 ? 1 : Math.min(requestedPage, pageCount);
  const rows = await db.schoolAttendance.findMany({ where, select: {
    id: true, date: true, status: true, reason: true,
    student: { select: { firstName: true, lastName: true, admissionNumber: true } },
    class: { select: { name: true } }, term: { select: { name: true } },
  }, orderBy: [{ date: "desc" }, { id: "desc" }], skip: (page - 1) * pageSize, take: pageSize });
  return { rows, total, page, pageSize, pageCount };
}

/**
 * Saves the full set of family links from the student record in one locked
 * transaction. Every guardian reference is revalidated against the tenant,
 * and a linked student keeps exactly one primary contact whenever any links
 * remain. This is used by the post-admission family-contact editor.
 */
export async function updateSchoolStudentGuardianLinks(
  organizationId: string,
  studentId: string,
  input: {
    links: Array<{ guardianId: string; relationship: string; authorizedPickup: boolean; remove: boolean }>;
    add?: { guardianId: string; relationship: string; authorizedPickup: boolean };
    primaryGuardianId?: string;
  },
  changedById?: string,
) {
  return db.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "SchoolStudent" WHERE "id" = ${studentId} AND "organizationId" = ${organizationId} FOR UPDATE`;
    if (!locked.length) throw new SchoolNotFoundError("Student not found.");

    const existing = await tx.schoolStudentGuardian.findMany({ where: { organizationId, studentId }, select: { guardianId: true, primary: true } });
    const linkedIds = new Set(existing.map((link) => link.guardianId));
    const suppliedIds = new Set(input.links.map((link) => link.guardianId));
    if (suppliedIds.size !== input.links.length || suppliedIds.size !== linkedIds.size || [...suppliedIds].some((id) => !linkedIds.has(id))) {
      throw new SchoolStateError("The family links changed. Reload the student and try again.", "stale-family-links");
    }

    const kept = input.links.filter((link) => !link.remove);
    if (input.add) {
      const guardian = await tx.schoolGuardian.findFirst({ where: { id: input.add.guardianId, organizationId }, select: { id: true } });
      if (!guardian) throw new SchoolNotFoundError("Guardian not found.");
      if (linkedIds.has(guardian.id)) throw new SchoolStateError("This guardian is already linked to the student.", "guardian-already-linked");
    }
    const remainingIds = new Set([...kept.map((link) => link.guardianId), ...(input.add ? [input.add.guardianId] : [])]);
    if (input.primaryGuardianId && !remainingIds.has(input.primaryGuardianId)) {
      throw new SchoolStateError("Choose a primary contact that will remain linked to this student.", "invalid-primary-guardian");
    }
    const previousPrimary = existing.find((link) => link.primary)?.guardianId;
    const primaryGuardianId = input.primaryGuardianId && remainingIds.has(input.primaryGuardianId)
      ? input.primaryGuardianId
      : previousPrimary && remainingIds.has(previousPrimary)
        ? previousPrimary
        : remainingIds.values().next().value;

    await tx.schoolStudentGuardian.deleteMany({ where: { organizationId, studentId, guardianId: { in: input.links.filter((link) => link.remove).map((link) => link.guardianId) } } });
    for (const link of kept) {
      await tx.schoolStudentGuardian.updateMany({
        where: { organizationId, studentId, guardianId: link.guardianId },
        data: { relationship: link.relationship, primary: link.guardianId === primaryGuardianId, authorizedPickup: link.authorizedPickup },
      });
    }
    if (input.add) {
      await tx.schoolStudentGuardian.create({
        data: { organizationId, studentId, guardianId: input.add.guardianId, relationship: input.add.relationship, primary: input.add.guardianId === primaryGuardianId, authorizedPickup: input.add.authorizedPickup },
      });
    }
    const result = await tx.schoolStudentGuardian.findMany({ where: { organizationId, studentId }, include: { guardian: { select: { id: true, firstName: true, lastName: true, phone: true } } }, orderBy: [{ primary: "desc" }, { guardian: { lastName: "asc" } }] });
    if (changedById) {
      await logAuditEvent({
        organizationId,
        module: "school",
        action: "STUDENT_GUARDIAN_LINKS_UPDATED",
        entityName: "SchoolStudent",
        entityId: studentId,
        userId: changedById,
        metadata: { links: result.map(({ guardianId, relationship, primary, authorizedPickup }) => ({ guardianId, relationship, primary, authorizedPickup })) },
      }, tx);
    }
    return result;
  }, { isolationLevel: "Serializable" });
}
export function listSchoolTimetable(organizationId: string) { return db.schoolTimetableEntry.findMany({ where: { organizationId }, include: { campus: true, term: true, class: true, subject: true }, orderBy: [{ dayOfWeek: "asc" }, { startsAt: "asc" }] }); }

export async function enrollSchoolStudent(organizationId: string, data: { campusId: string; academicYearId: string; studentId: string; classId: string }) {
  return db.$transaction(async (tx) => {
    const lockedYear = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "SchoolAcademicYear"
      WHERE "id" = ${data.academicYearId} AND "organizationId" = ${organizationId}
      FOR UPDATE
    `;
    if (!lockedYear.length) throw new SchoolNotFoundError("Student, academic year, or class not found.");
    const lockedClass = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "SchoolClass"
      WHERE "id" = ${data.classId} AND "organizationId" = ${organizationId} AND "campusId" = ${data.campusId} AND "active" = true
      FOR UPDATE
    `;
    if (!lockedClass.length) throw new SchoolNotFoundError("Student, academic year, or class not found.");
    const [student, year, class_] = await Promise.all([
      tx.schoolStudent.findFirst({ where: { id: data.studentId, organizationId, campusId: data.campusId, status: "ACTIVE" }, select: { id: true } }),
      tx.schoolAcademicYear.findFirst({ where: { id: data.academicYearId, organizationId }, select: { id: true, closedAt: true } }),
      tx.schoolClass.findFirst({ where: { id: data.classId, organizationId, campusId: data.campusId, active: true }, select: { id: true, capacity: true } }),
    ]);
    if (!student || !year || !class_) throw new SchoolNotFoundError("Student, academic year, or class not found.");
    if (year.closedAt) throw new SchoolStateError("A closed academic year cannot receive new enrollments.", "closed-rollover-target");
    const existing = await tx.schoolEnrollment.findUnique({ where: { studentId_academicYearId: { studentId: data.studentId, academicYearId: data.academicYearId } }, select: { id: true } });
    if (existing) throw new SchoolStateError("This student already has an enrollment in that academic year.", "already-enrolled");
    if (class_.capacity !== null) {
      const enrolled = await tx.schoolEnrollment.count({ where: { organizationId, academicYearId: data.academicYearId, classId: class_.id, status: "ACTIVE" } });
      if (enrolled >= class_.capacity) throw new SchoolStateError("Class capacity has been reached.", "class-capacity");
    }
    return tx.schoolEnrollment.create({ data: { organizationId, ...data } });
  }, { isolationLevel: "Serializable" });
}

export async function recordSchoolAttendance(organizationId: string, actingUserId: string, data: { termId: string; classId: string; studentId: string; date: Date; status: SchoolAttendanceStatus; reason?: string | null }) {
  const scope = await resolveTeacherClassScope(organizationId, actingUserId);
  if (scope && !scope.has(data.classId)) throw new SchoolStateError("You can only record attendance for a class you're assigned to.", "class-not-assigned");
  const enrollment = await db.schoolEnrollment.findFirst({ where: { organizationId, studentId: data.studentId, classId: data.classId, status: "ACTIVE", student: { status: "ACTIVE" }, academicYear: { terms: { some: { id: data.termId } } } }, include: { campus: { include: { settings: true } } }, });
  if (!enrollment) throw new SchoolNotFoundError("Active student enrollment not found.");
  const now = new Date();
  const attendanceDate = new Date(data.date);
  if (attendanceDate > now) throw new SchoolStateError("Attendance cannot be recorded for a future date.", "future-attendance");
  const closeDays = enrollment.campus.settings?.attendanceCloseDays ?? 7;
  const oldestAllowed = new Date(now);
  oldestAllowed.setHours(0, 0, 0, 0);
  oldestAllowed.setDate(oldestAllowed.getDate() - closeDays);
  if (attendanceDate < oldestAllowed) throw new SchoolStateError("The attendance correction window has closed.", "attendance-closed");
  const record = await db.schoolAttendance.upsert({ where: { studentId_date: { studentId: data.studentId, date: data.date } }, update: { status: data.status, reason: data.reason }, create: { organizationId, ...data } });
  if (data.status === "ABSENT") {
    const [student, schoolClass] = await Promise.all([db.schoolStudent.findUnique({ where: { id: data.studentId }, select: { firstName: true, lastName: true } }), db.schoolClass.findUnique({ where: { id: data.classId }, select: { name: true } })]);
    if (student && schoolClass) {
      await notifySchoolGuardians({
        organizationId,
        studentId: data.studentId,
        smsEnabled: enrollment.campus.settings?.smsNotificationsEnabled ?? false,
        purpose: "SCHOOL_ATTENDANCE_ABSENT",
        relatedType: "SchoolAttendance",
        relatedId: record.id,
        body: (guardianName) => schoolAttendanceAbsentSms({ guardianName, studentName: `${student.firstName} ${student.lastName}`, className: schoolClass.name, date: attendanceDate }).body,
      });
    }
  }
  return record;
}

export interface SchoolAttendanceRosterEntry {
  studentId: string;
  firstName: string;
  lastName: string;
  admissionNumber: string;
  /** Null when nothing has been recorded yet for this student on this date - the caller defaults this to PRESENT for display. */
  status: SchoolAttendanceStatus | null;
  reason: string | null;
}

/** The active roster for a class on a given date, merged with any attendance already recorded - powers the bulk "take attendance" screen. */
export async function getSchoolAttendanceRoster(
  organizationId: string,
  actingUserId: string,
  data: { termId: string; classId: string; date: Date },
): Promise<{ entries: SchoolAttendanceRosterEntry[]; closeDays: number }> {
  const scope = await resolveTeacherClassScope(organizationId, actingUserId);
  if (scope && !scope.has(data.classId)) throw new SchoolStateError("You can only view attendance for a class you're assigned to.", "class-not-assigned");

  const [term, class_] = await Promise.all([
    db.schoolTerm.findFirst({ where: { id: data.termId, organizationId }, select: { academicYearId: true } }),
    db.schoolClass.findFirst({ where: { id: data.classId, organizationId }, include: { campus: { include: { settings: true } } } }),
  ]);
  if (!term || !class_) throw new SchoolNotFoundError("Term or class not found.");

  const [enrollments, existing] = await Promise.all([
    db.schoolEnrollment.findMany({
      where: { organizationId, classId: data.classId, academicYearId: term.academicYearId, status: "ACTIVE", student: { status: "ACTIVE" } },
      include: { student: true },
      orderBy: [{ student: { lastName: "asc" } }, { student: { firstName: "asc" } }],
    }),
    db.schoolAttendance.findMany({ where: { organizationId, classId: data.classId, date: data.date } }),
  ]);

  const existingByStudent = new Map(existing.map((record) => [record.studentId, record]));
  const entries: SchoolAttendanceRosterEntry[] = enrollments.map(({ student }) => {
    const record = existingByStudent.get(student.id);
    return {
      studentId: student.id,
      firstName: student.firstName,
      lastName: student.lastName,
      admissionNumber: student.admissionNumber,
      status: record?.status ?? null,
      reason: record?.reason ?? null,
    };
  });

  return { entries, closeDays: class_.campus.settings?.attendanceCloseDays ?? 7 };
}

/**
 * Records attendance for many students in one class on one date in a single
 * pass, so a teacher doesn't have to repeat term/class/date selection per
 * student. Re-derives the active roster server-side rather than trusting a
 * client-supplied student list, and silently drops any submitted student who
 * is no longer actively enrolled (e.g. withdrawn between page load and
 * submit) instead of failing the whole batch.
 */
export async function recordSchoolAttendanceBulk(
  organizationId: string,
  actingUserId: string,
  data: { termId: string; classId: string; date: Date; entries: Array<{ studentId: string; status: SchoolAttendanceStatus; reason?: string | null }> },
): Promise<{ saved: number; skipped: number }> {
  const scope = await resolveTeacherClassScope(organizationId, actingUserId);
  if (scope && !scope.has(data.classId)) throw new SchoolStateError("You can only record attendance for a class you're assigned to.", "class-not-assigned");

  const [term, class_] = await Promise.all([
    db.schoolTerm.findFirst({ where: { id: data.termId, organizationId }, select: { academicYearId: true } }),
    db.schoolClass.findFirst({ where: { id: data.classId, organizationId }, include: { campus: { include: { settings: true } } } }),
  ]);
  if (!term || !class_) throw new SchoolNotFoundError("Term or class not found.");

  const now = new Date();
  if (data.date > now) throw new SchoolStateError("Attendance cannot be recorded for a future date.", "future-attendance");
  const closeDays = class_.campus.settings?.attendanceCloseDays ?? 7;
  const oldestAllowed = new Date(now);
  oldestAllowed.setHours(0, 0, 0, 0);
  oldestAllowed.setDate(oldestAllowed.getDate() - closeDays);
  if (data.date < oldestAllowed) throw new SchoolStateError("The attendance correction window has closed.", "attendance-closed");

  const enrollments = await db.schoolEnrollment.findMany({
    where: { organizationId, classId: data.classId, academicYearId: term.academicYearId, status: "ACTIVE", student: { status: "ACTIVE" } },
    select: { studentId: true },
  });
  const activeStudentIds = new Set(enrollments.map((enrollment) => enrollment.studentId));
  const valid = data.entries.filter((entry) => activeStudentIds.has(entry.studentId));
  if (valid.length === 0) return { saved: 0, skipped: data.entries.length };

  const saved = await db.$transaction(
    valid.map((entry) =>
      db.schoolAttendance.upsert({
        where: { studentId_date: { studentId: entry.studentId, date: data.date } },
        update: { status: entry.status, reason: entry.reason ?? null },
        create: { organizationId, termId: data.termId, classId: data.classId, studentId: entry.studentId, date: data.date, status: entry.status, reason: entry.reason ?? null },
      }),
    ),
  );

  const smsEnabled = class_.campus.settings?.smsNotificationsEnabled ?? false;
  const absentees = saved.filter((record) => record.status === "ABSENT");
  if (smsEnabled && absentees.length > 0) {
    const students = await db.schoolStudent.findMany({ where: { id: { in: absentees.map((record) => record.studentId) } }, select: { id: true, firstName: true, lastName: true } });
    const studentsById = new Map(students.map((student) => [student.id, student]));
    for (const record of absentees) {
      const student = studentsById.get(record.studentId);
      if (!student) continue;
      await notifySchoolGuardians({
        organizationId,
        studentId: record.studentId,
        smsEnabled,
        purpose: "SCHOOL_ATTENDANCE_ABSENT",
        relatedType: "SchoolAttendance",
        relatedId: record.id,
        body: (guardianName) => schoolAttendanceAbsentSms({ guardianName, studentName: `${student.firstName} ${student.lastName}`, className: class_.name, date: data.date }).body,
      });
    }
  }

  return { saved: valid.length, skipped: data.entries.length - valid.length };
}

export function listSchoolFeeInvoices(organizationId: string) {
  return db.schoolFeeInvoice.findMany({ where: { organizationId }, include: { student: true, payments: true, academicYear: true, term: true }, orderBy: { createdAt: "desc" } });
}
export async function listSchoolFeeInvoicePage(organizationId: string, input: { query?: string; status?: SchoolInvoiceStatus; page?: number; pageSize?: number } = {}) {
  const pageSize = Math.min(100, Math.max(1, Math.floor(Number.isFinite(input.pageSize) ? input.pageSize! : 50)));
  const requestedPage = Math.max(1, Math.floor(Number.isFinite(input.page) ? input.page! : 1));
  const terms = input.query?.trim().split(/\s+/).filter(Boolean) ?? [];
  const where: Prisma.SchoolFeeInvoiceWhereInput = {
    organizationId,
    ...(input.status ? { status: input.status } : {}),
    ...(terms.length ? { AND: terms.map((term) => ({ OR: [
      { invoiceNumber: { contains: term, mode: "insensitive" as const } },
      { description: { contains: term, mode: "insensitive" as const } },
      { student: { firstName: { contains: term, mode: "insensitive" as const } } },
      { student: { lastName: { contains: term, mode: "insensitive" as const } } },
      { student: { admissionNumber: { contains: term, mode: "insensitive" as const } } },
    ] })) } : {}),
  };
  const total = await db.schoolFeeInvoice.count({ where });
  const pageCount = Math.ceil(total / pageSize);
  const page = pageCount === 0 ? 1 : Math.min(requestedPage, pageCount);
  const rows = await db.schoolFeeInvoice.findMany({ where, select: {
    id: true, invoiceNumber: true, description: true, amount: true, discount: true,
    status: true, dueDate: true, createdAt: true,
    student: { select: { firstName: true, lastName: true, admissionNumber: true } },
    academicYear: { select: { name: true } }, term: { select: { name: true } },
    payments: { select: { id: true, amount: true, refundedAt: true, receiptNumber: true, postingStatus: true, method: true, refunds: { select: { id: true, amount: true, method: true, reason: true, reference: true, createdAt: true, postingStatus: true }, orderBy: { createdAt: "desc" } } } },
  }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * pageSize, take: pageSize });
  return { rows, total, page, pageSize, pageCount };
}

export async function getSchoolFeeInvoiceSummary(organizationId: string) {
  const [invoices, payments, refunds, openInvoices, openPayments, openRefunds] = await Promise.all([
    db.schoolFeeInvoice.aggregate({ where: { organizationId, status: { in: ["ISSUED", "PART_PAID", "PAID"] } }, _sum: { amount: true, discount: true } }),
    db.schoolFeePayment.aggregate({ where: { organizationId, refundedAt: null }, _sum: { amount: true } }),
    db.schoolFeeRefund.aggregate({ where: { organizationId, payment: { refundedAt: null } }, _sum: { amount: true } }),
    db.schoolFeeInvoice.aggregate({ where: { organizationId, status: { in: ["ISSUED", "PART_PAID"] } }, _sum: { amount: true, discount: true } }),
    db.schoolFeePayment.aggregate({ where: { organizationId, refundedAt: null, invoice: { status: { in: ["ISSUED", "PART_PAID"] } } }, _sum: { amount: true } }),
    db.schoolFeeRefund.aggregate({ where: { organizationId, payment: { refundedAt: null, invoice: { status: { in: ["ISSUED", "PART_PAID"] } } } }, _sum: { amount: true } }),
  ]);
  return {
    billed: (invoices._sum.amount ?? new Prisma.Decimal(0)).minus(invoices._sum.discount ?? 0),
    collected: (payments._sum.amount ?? new Prisma.Decimal(0)).minus(refunds._sum.amount ?? 0),
    outstanding: (openInvoices._sum.amount ?? new Prisma.Decimal(0)).minus(openInvoices._sum.discount ?? 0).minus(openPayments._sum.amount ?? 0).plus(openRefunds._sum.amount ?? 0),
  };
}

export async function createSchoolFeeInvoice(organizationId: string, data: { academicYearId: string; termId?: string | null; studentId: string; description: string; amount: Prisma.Decimal.Value; discount?: Prisma.Decimal.Value; dueDate?: Date | null }) {
  const [student, year, term] = await Promise.all([
    db.schoolStudent.findFirst({ where: { id: data.studentId, organizationId } }),
    db.schoolAcademicYear.findFirst({ where: { id: data.academicYearId, organizationId } }),
    data.termId ? db.schoolTerm.findFirst({ where: { id: data.termId, organizationId, academicYearId: data.academicYearId } }) : Promise.resolve(true),
  ]);
  if (!student || !year || !term) throw new SchoolNotFoundError("Student or academic period not found.");
  if (decimal(data.amount).lte(0) || decimal(data.discount ?? 0).lt(0) || decimal(data.discount ?? 0).gt(data.amount)) throw new SchoolStateError("Invalid fee amount or discount.");
  return createWithUniqueRetry(async () => db.schoolFeeInvoice.create({ data: { organizationId, invoiceNumber: await nextCode(organizationId, "INV", () => db.schoolFeeInvoice.count({ where: { organizationId } })), ...data, amount: decimal(data.amount), discount: decimal(data.discount ?? 0), status: "ISSUED", issuedAt: new Date() } }));
}

export async function recordSchoolFeePayment(organizationId: string, invoiceId: string, data: { amount: Prisma.Decimal.Value; method: HotelPaymentMethod; reference?: string | null }) {
  const { payment, notify } = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${organizationId}:school-receipt`}))`;
    await tx.$queryRaw`SELECT id FROM "SchoolFeeInvoice" WHERE id = ${invoiceId} AND "organizationId" = ${organizationId} FOR UPDATE`;
    const invoice = await tx.schoolFeeInvoice.findFirst({ where: { id: invoiceId, organizationId, status: { in: ["ISSUED", "PART_PAID"] } }, include: { payments: { include: { refunds: true } }, student: { include: { campus: { include: { settings: true } } } } } });
    if (!invoice) throw new SchoolNotFoundError("Open invoice not found.");
    const paid = invoice.payments.reduce((sum, p) => sum.plus(p.refundedAt ? 0 : p.amount.minus(p.refunds.reduce((refundSum, refund) => refundSum.plus(refund.amount), new Prisma.Decimal(0)))), new Prisma.Decimal(0));
    const due = invoice.amount.minus(invoice.discount).minus(paid);
    const amount = decimal(data.amount);
    if (amount.lte(0) || amount.gt(due)) throw new SchoolStateError("Payment exceeds the outstanding invoice balance.", "payment-exceeds-balance");
    const receiptPrefix = invoice.student.campus.settings?.receiptPrefix?.trim() || "SCH";
    const created = await tx.schoolFeePayment.create({ data: { organizationId, invoiceId, studentId: invoice.studentId, receiptNumber: await nextCode(organizationId, receiptPrefix, () => tx.schoolFeePayment.count({ where: { organizationId } })), ...data, amount } });
    await tx.schoolFeeInvoice.update({ where: { id: invoiceId }, data: { status: amount.eq(due) ? "PAID" : "PART_PAID" } });
    return {
      payment: created,
      notify: { studentId: invoice.studentId, studentName: `${invoice.student.firstName} ${invoice.student.lastName}`, smsEnabled: invoice.student.campus.settings?.smsNotificationsEnabled ?? false },
    };
  });
  await notifySchoolGuardians({
    organizationId,
    studentId: notify.studentId,
    smsEnabled: notify.smsEnabled,
    purpose: "SCHOOL_FEE_PAYMENT_RECEIVED",
    relatedType: "SchoolFeePayment",
    relatedId: payment.id,
    body: (guardianName) => schoolFeePaymentReceivedSms({ guardianName, studentName: notify.studentName, amount: `GHS ${Number(payment.amount).toFixed(2)}`, receiptNumber: payment.receiptNumber }).body,
  });
  return payment;
}

export async function recordSchoolFeeRefund(organizationId: string, paymentId: string, actorId: string, data: { amount: Prisma.Decimal.Value; method: HotelPaymentMethod; reason: string; reference?: string | null }) {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "SchoolFeePayment" WHERE id = ${paymentId} AND "organizationId" = ${organizationId} FOR UPDATE`;
    const payment = await tx.schoolFeePayment.findFirst({ where: { id: paymentId, organizationId }, include: { refunds: true, invoice: true } });
    if (!payment) throw new SchoolNotFoundError("Fee payment not found.");
    await tx.$queryRaw`SELECT id FROM "SchoolFeeInvoice" WHERE id = ${payment.invoiceId} AND "organizationId" = ${organizationId} FOR UPDATE`;
    const invoice = await tx.schoolFeeInvoice.findFirst({ where: { id: payment.invoiceId, organizationId } });
    if (!invoice) throw new SchoolNotFoundError("Fee invoice not found.");
    const alreadyRefunded = payment.refunds.reduce((sum, refund) => sum.plus(refund.amount), new Prisma.Decimal(0));
    const remaining = payment.refundedAt ? new Prisma.Decimal(0) : payment.amount.minus(alreadyRefunded);
    const amount = decimal(data.amount);
    if (amount.lte(0) || amount.gt(remaining)) throw new SchoolStateError("Refund exceeds the remaining refundable amount.", "refund-exceeds-balance");
    const refund = await tx.schoolFeeRefund.create({ data: { organizationId, paymentId, ...data, amount, createdById: actorId } });
    const totalRefunded = alreadyRefunded.plus(amount);
    if (totalRefunded.gte(payment.amount)) await tx.schoolFeePayment.update({ where: { id: payment.id }, data: { refundedAt: new Date() } });
    if (invoice.status !== "VOID" && invoice.status !== "DRAFT") {
      const invoicePayments = await tx.schoolFeePayment.findMany({ where: { invoiceId: payment.invoiceId, organizationId }, include: { refunds: { select: { amount: true } } } });
      const collected = invoicePayments.reduce((sum, item) => sum.plus(item.refundedAt ? 0 : item.amount.minus(item.refunds.reduce((refundSum, row) => refundSum.plus(row.amount), new Prisma.Decimal(0)))), new Prisma.Decimal(0));
      const due = invoice.amount.minus(invoice.discount);
      const status = collected.gte(due) ? "PAID" : collected.gt(0) ? "PART_PAID" : "ISSUED";
      await tx.schoolFeeInvoice.update({ where: { id: payment.invoiceId }, data: { status } });
    }
    return refund;
  }, { timeout: 15_000 });
}

export function getSchoolFeeRefundForPostingRetry(organizationId: string, refundId: string) {
  return db.schoolFeeRefund.findFirst({ where: { id: refundId, organizationId, postingStatus: { in: ["PENDING", "FAILED", "NOT_REQUIRED"] } }, select: { id: true, amount: true, createdAt: true, reason: true, reference: true } });
}

export function getSchoolFeePaymentForPostingRetry(organizationId: string, paymentId: string) {
  return db.schoolFeePayment.findFirst({
    where: { id: paymentId, organizationId, refundedAt: null, postingStatus: { in: ["PENDING", "FAILED", "NOT_REQUIRED"] } },
    select: { id: true, amount: true, receivedAt: true, receiptNumber: true },
  });
}

export function getSchoolFeePaymentReceipt(organizationId: string, paymentId: string) {
  return db.schoolFeePayment.findFirst({
    where: { id: paymentId, organizationId },
    select: {
      id: true,
      amount: true,
      method: true,
      reference: true,
      receivedAt: true,
      receiptNumber: true,
      organization: { select: { name: true, address: true, phone: true, email: true, currency: true } },
      invoice: {
        select: {
          invoiceNumber: true,
          description: true,
          amount: true,
          discount: true,
          dueDate: true,
          academicYear: { select: { name: true } },
          term: { select: { name: true } },
        },
      },
      student: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          admissionNumber: true,
          campus: { select: { name: true } },
        },
      },
    },
  });
}

export function listSchoolFeeStructures(organizationId: string) {
  return db.schoolFeeStructure.findMany({
    where: { organizationId },
    include: { campus: true, academicYear: true, term: true, class: true, _count: { select: { invoices: true } } },
    orderBy: [{ active: "desc" }, { createdAt: "desc" }],
  });
}

export async function createSchoolFeeStructure(organizationId: string, data: {
  campusId: string;
  academicYearId: string;
  termId?: string | null;
  classId?: string | null;
  name: string;
  description?: string | null;
  amount: Prisma.Decimal.Value;
  dueDate?: Date | null;
}) {
  const [campus, year, term, schoolClass] = await Promise.all([
    db.schoolCampus.findFirst({ where: { id: data.campusId, organizationId, active: true } }),
    db.schoolAcademicYear.findFirst({ where: { id: data.academicYearId, organizationId } }),
    data.termId ? db.schoolTerm.findFirst({ where: { id: data.termId, organizationId, academicYearId: data.academicYearId } }) : Promise.resolve(true),
    data.classId ? db.schoolClass.findFirst({ where: { id: data.classId, organizationId, campusId: data.campusId, active: true } }) : Promise.resolve(true),
  ]);
  if (!campus || !year || !term || !schoolClass) throw new SchoolNotFoundError("Campus, academic period, or class not found.");
  const amount = decimal(data.amount);
  if (amount.lte(0)) throw new SchoolStateError("Fee amount must be greater than zero.");
  return db.schoolFeeStructure.create({ data: { organizationId, ...data, amount } });
}

export async function issueSchoolFeeStructure(organizationId: string, feeStructureId: string) {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${organizationId}:school-invoice`}))`;
    const structure = await tx.schoolFeeStructure.findFirst({ where: { id: feeStructureId, organizationId, active: true } });
    if (!structure) throw new SchoolNotFoundError("Active fee structure not found.");
    const enrollments = await tx.schoolEnrollment.findMany({
      where: {
        organizationId,
        campusId: structure.campusId,
        academicYearId: structure.academicYearId,
        status: "ACTIVE",
        student: { status: "ACTIVE" },
        ...(structure.classId ? { classId: structure.classId } : {}),
      },
      select: { studentId: true },
      orderBy: { studentId: "asc" },
    });
    const alreadyIssued = new Set((await tx.schoolFeeInvoice.findMany({
      where: { organizationId, feeStructureId, studentId: { in: enrollments.map((row) => row.studentId) } },
      select: { studentId: true },
    })).map((row) => row.studentId));
    const recipients = enrollments.filter((row) => !alreadyIssued.has(row.studentId));
    const startingCount = await tx.schoolFeeInvoice.count({ where: { organizationId } });
    for (const [index, enrollment] of recipients.entries()) {
      await tx.schoolFeeInvoice.create({
        data: {
          organizationId,
          feeStructureId,
          academicYearId: structure.academicYearId,
          termId: structure.termId,
          studentId: enrollment.studentId,
          invoiceNumber: `INV-${String(startingCount + index + 1).padStart(5, "0")}`,
          description: structure.description || structure.name,
          amount: structure.amount,
          status: "ISSUED",
          issuedAt: new Date(),
          dueDate: structure.dueDate,
        },
      });
    }
    return { eligible: enrollments.length, issued: recipients.length, skipped: alreadyIssued.size };
  });
}

export async function createSchoolTimetableEntry(organizationId: string, data: { campusId: string; termId: string; classId: string; subjectId: string; teacherName: string; room?: string | null; dayOfWeek: number; startsAt: string; endsAt: string }) {
  if (data.dayOfWeek < 1 || data.dayOfWeek > 7 || data.endsAt <= data.startsAt) throw new SchoolStateError("Invalid timetable period.");
  const conflict = await db.schoolTimetableEntry.findFirst({ where: { organizationId, termId: data.termId, dayOfWeek: data.dayOfWeek, startsAt: { lt: data.endsAt }, endsAt: { gt: data.startsAt }, OR: [{ classId: data.classId }, { teacherName: data.teacherName }, ...(data.room ? [{ room: data.room }] : [])] } });
  if (conflict) throw new SchoolStateError("Timetable conflicts with an existing class, teacher, or room period.", "timetable-conflict");
  return db.schoolTimetableEntry.create({ data: { organizationId, ...data } });
}

/**
 * Reads a campus's `SchoolSettings.gradingScale`
 * (`[{ grade, min, max, remark? }, …]` as percentages, edited via the
 * Settings > Grading scale control — the "Ghana (WASSCE/BECE) 9-point
 * scale" preset there populates `remark` too) and returns the matching
 * band for a mark percentage. Returns null if the campus has no grading
 * scale configured or none of its bands match — callers keep whatever
 * grade/remark (if any) was already supplied in that case.
 */
export function resolveGradeFromScale(gradingScale: Prisma.JsonValue | null | undefined, percent: number): { grade: string; remark: string | null } | null {
  if (!Array.isArray(gradingScale)) return null;
  for (const entry of gradingScale) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    const grade = typeof row.grade === "string" ? row.grade : null;
    const min = typeof row.min === "number" ? row.min : null;
    const max = typeof row.max === "number" ? row.max : null;
    const remark = typeof row.remark === "string" ? row.remark : null;
    if (grade && min !== null && max !== null && percent >= min && percent <= max) return { grade, remark };
  }
  return null;
}

export async function recordSchoolExamResult(organizationId: string, actingUserId: string, data: { examId: string; studentId: string; classId: string; subjectId: string; marks: Prisma.Decimal.Value; grade?: string | null; remark?: string | null }) {
  const scope = await resolveTeacherClassScope(organizationId, actingUserId);
  if (scope && !scope.has(data.classId)) throw new SchoolStateError("You can only record results for a class you're assigned to.", "class-not-assigned");
  const exam = await db.schoolExam.findFirst({ where: { id: data.examId, organizationId, subjectId: data.subjectId, status: { in: ["DRAFT", "OPEN", "MODERATION"] } } });
  const enrollment = await db.schoolEnrollment.findFirst({
    where: { organizationId, studentId: data.studentId, classId: data.classId, status: "ACTIVE", academicYearId: exam?.academicYearId },
    include: { student: { include: { campus: { include: { settings: true } } } } },
  });
  if (!exam || !enrollment) throw new SchoolNotFoundError("Exam or active enrollment not found.");
  const marks = decimal(data.marks);
  if (marks.lt(0) || marks.gt(exam.totalMarks)) throw new SchoolStateError("Marks must be within the exam total.", "marks-out-of-range");

  // Auto-derive the letter grade (and its remark, e.g. "Credit") from the
  // campus's configured grading scale (Settings > Grading scale) when the
  // caller didn't supply one explicitly — an explicit grade/remark always
  // wins, so a teacher can still override either.
  let grade = data.grade;
  let remark = data.remark;
  if (!grade) {
    const percent = marks.div(exam.totalMarks).times(100).toNumber();
    const band = resolveGradeFromScale(enrollment.student.campus.settings?.gradingScale, percent);
    grade = band?.grade ?? null;
    if (!remark) remark = band?.remark ?? null;
  }

  return db.schoolExamResult.upsert({ where: { examId_studentId: { examId: data.examId, studentId: data.studentId } }, update: { marks, grade, remark }, create: { organizationId, ...data, marks, grade, remark } });
}

export function listSchoolExams(organizationId: string) { return db.schoolExam.findMany({ where: { organizationId }, include: { academicYear: true, term: true, subject: true, results: { include: { student: true, class: true } } }, orderBy: { examDate: "desc" } }); }

export async function createSchoolExam(organizationId: string, data: { academicYearId: string; termId: string; subjectId: string; name: string; totalMarks: Prisma.Decimal.Value; weight: Prisma.Decimal.Value; examDate?: Date | null }) {
  const term = await db.schoolTerm.findFirst({ where: { id: data.termId, organizationId, academicYearId: data.academicYearId } });
  const subject = await db.schoolSubject.findFirst({ where: { id: data.subjectId, organizationId, active: true } });
  if (!term || !subject) throw new SchoolNotFoundError("Academic period or subject not found.");
  return db.schoolExam.create({ data: { organizationId, ...data, totalMarks: decimal(data.totalMarks), weight: decimal(data.weight), status: "OPEN" } });
}

export async function publishSchoolExam(organizationId: string, examId: string) {
  const exam = await db.schoolExam.findFirst({ where: { id: examId, organizationId }, include: { results: { include: { student: { include: { campus: { include: { settings: true } } } } } } } });
  if (!exam) throw new SchoolNotFoundError("Exam not found.");
  if (exam.status !== "MODERATION" || exam.results.length === 0) throw new SchoolStateError("Only moderated exams with results can be published.");
  const now = new Date();
  const outcome = await db.$transaction([db.schoolExamResult.updateMany({ where: { examId, organizationId }, data: { publishedAt: now } }), db.schoolExam.update({ where: { id: examId }, data: { status: "PUBLISHED", publishedAt: now } })]);
  for (const result of exam.results) {
    await notifySchoolGuardians({
      organizationId,
      studentId: result.studentId,
      smsEnabled: result.student.campus.settings?.smsNotificationsEnabled ?? false,
      purpose: "SCHOOL_EXAM_RESULTS_PUBLISHED",
      relatedType: "SchoolExam",
      relatedId: exam.id,
      body: (guardianName) => schoolExamResultsPublishedSms({ guardianName, studentName: `${result.student.firstName} ${result.student.lastName}`, examName: exam.name }).body,
    });
  }
  return outcome;
}

export async function submitSchoolExamForModeration(organizationId: string, examId: string) {
  const exam = await db.schoolExam.findFirst({ where: { id: examId, organizationId }, include: { results: true } });
  if (!exam) throw new SchoolNotFoundError("Exam not found.");
  if (exam.status !== "OPEN" || exam.results.length === 0) throw new SchoolStateError("Only open exams with results can be submitted for moderation.");
  return db.schoolExam.update({ where: { id: examId }, data: { status: "MODERATION" } });
}

export async function borrowSchoolLibraryBook(organizationId: string, bookId: string, studentId: string, dueAt: Date) {
  return db.$transaction(async (tx) => {
    const student = await tx.schoolStudent.findFirst({ where: { id: studentId, organizationId, status: "ACTIVE" } });
    if (!student) throw new SchoolNotFoundError("Active student not found.");
    const claimed = await tx.schoolLibraryBook.updateMany({ where: { id: bookId, organizationId, active: true, availableCopies: { gt: 0 } }, data: { availableCopies: { decrement: 1 } } });
    if (claimed.count !== 1) throw new SchoolStateError("No copy is available.", "book-unavailable");
    return tx.schoolLibraryLoan.create({ data: { organizationId, bookId, studentId, dueAt } });
  });
}

export async function returnSchoolLibraryBook(organizationId: string, loanId: string) {
  return db.$transaction(async (tx) => {
    const loan = await tx.schoolLibraryLoan.findFirst({ where: { id: loanId, organizationId, status: { in: ["BORROWED", "OVERDUE"] } } });
    if (!loan) throw new SchoolNotFoundError("Open loan not found.");
    await tx.schoolLibraryBook.update({ where: { id: loan.bookId }, data: { availableCopies: { increment: 1 } } });
    return tx.schoolLibraryLoan.update({ where: { id: loanId }, data: { status: "RETURNED", returnedAt: new Date() } });
  });
}

export function listSchoolLibrary(organizationId: string) { return Promise.all([db.schoolLibraryBook.findMany({ where: { organizationId }, orderBy: { title: "asc" } }), db.schoolLibraryLoan.findMany({ where: { organizationId }, include: { book: true, student: true }, orderBy: { borrowedAt: "desc" } })]); }
export function listSchoolLibraryLoans(organizationId: string) { return db.schoolLibraryLoan.findMany({ where: { organizationId }, include: { book: { select: { title: true } }, student: { select: { firstName: true, lastName: true, admissionNumber: true } } }, orderBy: [{ borrowedAt: "desc" }, { id: "desc" }] }); }

export async function listSchoolLibraryLoanPage(organizationId: string, input: { query?: string; status?: SchoolLibraryLoanStatus; showAll?: boolean; page?: number; pageSize?: number } = {}) {
  const pageSize = Math.min(100, Math.max(1, Math.floor(Number.isFinite(input.pageSize) ? input.pageSize! : 50)));
  const requestedPage = Math.max(1, Math.floor(Number.isFinite(input.page) ? input.page! : 1));
  const terms = input.query?.trim().split(/\s+/).filter(Boolean) ?? [];
  const states = input.status ? [input.status] : input.showAll ? undefined : (["BORROWED", "OVERDUE"] as const);
  const where: Prisma.SchoolLibraryLoanWhereInput = {
    organizationId,
    ...(states ? { status: { in: [...states] } } : {}),
    ...(terms.length ? { AND: terms.map((term) => ({ OR: [
      { book: { title: { contains: term, mode: "insensitive" as const } } },
      { student: { firstName: { contains: term, mode: "insensitive" as const } } },
      { student: { lastName: { contains: term, mode: "insensitive" as const } } },
      { student: { admissionNumber: { contains: term, mode: "insensitive" as const } } },
    ] })) } : {}),
  };
  const [total, overdueCount] = await Promise.all([
    db.schoolLibraryLoan.count({ where }),
    db.schoolLibraryLoan.count({ where: { organizationId, status: { in: ["BORROWED", "OVERDUE"] }, dueAt: { lt: new Date() } } }),
  ]);
  const pageCount = Math.ceil(total / pageSize);
  const page = pageCount === 0 ? 1 : Math.min(requestedPage, pageCount);
  const rows = await db.schoolLibraryLoan.findMany({
    where,
    select: {
      id: true, status: true, borrowedAt: true, dueAt: true, returnedAt: true,
      book: { select: { title: true } },
      student: { select: { firstName: true, lastName: true, admissionNumber: true } },
    },
    orderBy: [{ borrowedAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * pageSize,
    take: pageSize,
  });
  return { rows, total, overdueCount, page, pageSize, pageCount };
}
export async function listSchoolLibraryBookChoices(organizationId: string, input: { query?: string; take?: number } = {}) {
  const take = Math.min(100, Math.max(1, Math.floor(Number.isFinite(input.take) ? input.take! : 50)));
  const query = input.query?.trim();
  const where: Prisma.SchoolLibraryBookWhereInput = {
    organizationId,
    availableCopies: { gt: 0 },
    ...(query ? { OR: [
      { title: { contains: query, mode: "insensitive" } },
      { author: { contains: query, mode: "insensitive" } },
      { accessionCode: { contains: query, mode: "insensitive" } },
    ] } : {}),
  };
  const [total, rows] = await Promise.all([
    db.schoolLibraryBook.count({ where }),
    db.schoolLibraryBook.findMany({ where, select: { id: true, title: true, availableCopies: true }, orderBy: [{ title: "asc" }, { id: "asc" }], take }),
  ]);
  return { rows, total, take };
}
export async function listSchoolLibraryBookPage(organizationId: string, input: { query?: string; page?: number; pageSize?: number } = {}) {
  const pageSize = Math.min(100, Math.max(1, Math.floor(Number.isFinite(input.pageSize) ? input.pageSize! : 50)));
  const requestedPage = Math.max(1, Math.floor(Number.isFinite(input.page) ? input.page! : 1));
  const terms = input.query?.trim().split(/\s+/).filter(Boolean) ?? [];
  const where: Prisma.SchoolLibraryBookWhereInput = {
    organizationId,
    ...(terms.length ? { AND: terms.map((term) => ({ OR: [
      { title: { contains: term, mode: "insensitive" as const } },
      { author: { contains: term, mode: "insensitive" as const } },
      { accessionCode: { contains: term, mode: "insensitive" as const } },
      { isbn: { contains: term, mode: "insensitive" as const } },
      { category: { contains: term, mode: "insensitive" as const } },
    ] })) } : {}),
  };
  const total = await db.schoolLibraryBook.count({ where });
  const pageCount = Math.ceil(total / pageSize);
  const page = pageCount === 0 ? 1 : Math.min(requestedPage, pageCount);
  const rows = await db.schoolLibraryBook.findMany({ where, select: {
    id: true, accessionCode: true, isbn: true, title: true, author: true, category: true,
    totalCopies: true, availableCopies: true,
  }, orderBy: [{ title: "asc" }, { id: "asc" }], skip: (page - 1) * pageSize, take: pageSize });
  return { rows, total, page, pageSize, pageCount };
}
export function createSchoolLibraryBook(organizationId: string, data: { accessionCode: string; isbn?: string | null; title: string; author?: string | null; category?: string | null; totalCopies: number }) { if(data.totalCopies<1) throw new SchoolStateError("At least one copy is required."); return db.schoolLibraryBook.create({ data: { organizationId, ...data, availableCopies: data.totalCopies } }); }

export function listSchoolTransport(organizationId: string) { return db.schoolTransportRoute.findMany({ where: { organizationId }, include: { campus: true, assignments: { include: { student: true } } }, orderBy: { name: "asc" } }); }
export async function createSchoolTransportRoute(organizationId: string, data: { campusId: string; code: string; name: string; vehicle?: string | null; driverName?: string | null; stops?: string[]; fee: Prisma.Decimal.Value }) { if(!(await db.schoolCampus.findFirst({where:{id:data.campusId,organizationId}}))) throw new SchoolNotFoundError("Campus not found."); return db.schoolTransportRoute.create({data:{organizationId,...data,stops:data.stops ?? Prisma.JsonNull,fee:decimal(data.fee)}}); }
export async function assignSchoolTransport(organizationId:string,routeId:string,studentId:string,stopName?:string|null){const [route,student]=await Promise.all([db.schoolTransportRoute.findFirst({where:{id:routeId,organizationId,active:true}}),db.schoolStudent.findFirst({where:{id:studentId,organizationId,status:"ACTIVE"}})]);if(!route||!student)throw new SchoolNotFoundError("Route or student not found.");return db.schoolTransportAssignment.upsert({where:{routeId_studentId:{routeId,studentId}},update:{stopName,active:true},create:{organizationId,routeId,studentId,stopName}});}

export async function listSchoolPayrollAdjustments(organizationId: string) {
  const adjustments = await db.schoolPayrollAdjustment.findMany({ where: { organizationId }, orderBy: [{ period: "desc" }, { createdAt: "desc" }] });
  const employees = await listSchoolPayrollLinkCandidates(organizationId);
  const employeeById = new Map(employees.map((employee) => [employee.id, employee]));
  return adjustments.map((adjustment) => ({
    ...adjustment,
    employee: adjustment.employeeId ? employeeById.get(adjustment.employeeId) ?? null : null,
  }));
}

export async function createSchoolPayrollAdjustment(
  organizationId: string,
  data: { employeeId: string; period: string; type: string; category: "EARNING" | "DEDUCTION"; description: string; amount: Prisma.Decimal.Value },
) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(data.period)) throw new SchoolStateError("Choose a valid payroll month.", "invalid-period");
  const amount = decimal(data.amount);
  if (!amount.isFinite() || amount.lte(0)) throw new SchoolStateError("The payroll input amount must be greater than zero.", "invalid-amount");
  const employee = await getSchoolPayrollEligibleEmployee(organizationId, data.employeeId);
  if (!employee) throw new SchoolNotFoundError("Payroll-eligible HR employee not found.");
  return db.schoolPayrollAdjustment.create({ data: { organizationId, ...data, amount } });
}

export async function assignPendingSchoolPayrollEmployee(organizationId: string, adjustmentId: string, employeeId: string) {
  const [adjustment, employee] = await Promise.all([
    db.schoolPayrollAdjustment.findFirst({ where: { id: adjustmentId, organizationId, processedAt: null, payrollRunId: null } }),
    getSchoolPayrollLinkCandidate(organizationId, employeeId),
  ]);
  if (!adjustment || !employee) throw new SchoolNotFoundError("Pending School payroll input or HR employee not found.");
  const updated = await db.schoolPayrollAdjustment.updateMany({
    where: { id: adjustmentId, organizationId, employeeId: adjustment.employeeId, legacyEmployeeId: adjustment.legacyEmployeeId, processedAt: null, payrollRunId: null },
    data: { employeeId: employee.id, legacyEmployeeId: null },
  });
  if (updated.count !== 1) throw new SchoolStateError("This legacy payroll input changed in another request. Refresh and try again.", "stale-record");
  return db.schoolPayrollAdjustment.findFirstOrThrow({ where: { id: adjustmentId, organizationId } });
}

export function listSchoolSettings(organizationId:string){return db.schoolCampus.findMany({where:{organizationId},include:{settings:true},orderBy:{name:"asc"}});}
export async function upsertSchoolSettings(organizationId:string,data:{campusId:string;attendanceCloseDays:number;receiptPrefix:string;allowRanking:boolean;smsNotificationsEnabled:boolean;gradingScale?:Prisma.InputJsonValue}){if(!(await db.schoolCampus.findFirst({where:{id:data.campusId,organizationId}})))throw new SchoolNotFoundError("Campus not found.");const values={attendanceCloseDays:data.attendanceCloseDays,receiptPrefix:data.receiptPrefix,allowRanking:data.allowRanking,smsNotificationsEnabled:data.smsNotificationsEnabled,gradingScale:data.gradingScale};return db.schoolSettings.upsert({where:{campusId:data.campusId},update:values,create:{organizationId,...data}});}

export async function getSchoolSummary(organizationId: string) {
  const [students, classes, attendance, invoices, payments, refunds, overdueLoans, routes] = await Promise.all([
    db.schoolStudent.count({ where: { organizationId, status: "ACTIVE" } }),
    db.schoolClass.count({ where: { organizationId, active: true } }),
    db.schoolAttendance.groupBy({ by: ["status"], where: { organizationId }, _count: true }),
    db.schoolFeeInvoice.findMany({ where: { organizationId, status: { in: ["ISSUED", "PART_PAID"] } }, include: { payments: { include: { refunds: true } } } }),
    db.schoolFeePayment.aggregate({ where: { organizationId, refundedAt: null }, _sum: { amount: true } }),
    db.schoolFeeRefund.aggregate({ where: { organizationId, payment: { refundedAt: null } }, _sum: { amount: true } }),
    db.schoolLibraryLoan.count({ where: { organizationId, status: { in: ["BORROWED", "OVERDUE"] }, dueAt: { lt: new Date() } } }),
    db.schoolTransportRoute.count({ where: { organizationId, active: true } }),
  ]);
  const outstanding = invoices.reduce((total, invoice) => total.plus(invoice.amount.minus(invoice.discount).minus(invoice.payments.reduce((sum, p) => sum.plus(p.refundedAt ? 0 : p.amount.minus(p.refunds.reduce((refundSum, refund) => refundSum.plus(refund.amount), new Prisma.Decimal(0)))), new Prisma.Decimal(0)))), new Prisma.Decimal(0));
  return { activeStudents: students, activeClasses: classes, attendance: Object.fromEntries(attendance.map((item) => [item.status, item._count])), collections: (payments._sum.amount ?? new Prisma.Decimal(0)).minus(refunds._sum.amount ?? 0), outstanding, overdueLoans, activeRoutes: routes };
}

export async function getSchoolReportAnalytics(
  organizationId: string,
  filters: { campusId?: string; classId?: string; from: Date; to: Date },
) {
  const from = new Date(filters.from);
  const toExclusive = new Date(filters.to);
  toExclusive.setDate(toExclusive.getDate() + 1);
  const durationMs = Math.max(toExclusive.getTime() - from.getTime(), 86_400_000);
  const previousFrom = new Date(from.getTime() - durationMs);
  const lookback = new Date(Math.min(widestTrendLookback().getTime(), previousFrom.getTime()));
  const queryEnd = new Date(Math.max(toExclusive.getTime(), Date.now() + 86_400_000));
  const classWhere = filters.classId
    ? { id: filters.classId, organizationId, ...(filters.campusId ? { campusId: filters.campusId } : {}) }
    : filters.campusId
      ? { organizationId, campusId: filters.campusId }
      : { organizationId };
  const studentWhere = filters.campusId || filters.classId
    ? { ...(filters.campusId ? { campusId: filters.campusId } : {}), ...(filters.classId ? { enrollments: { some: { classId: filters.classId } } } : {}) }
    : undefined;

  const [attendance, payments, refunds, classes] = await Promise.all([
    db.schoolAttendance.findMany({
      where: { organizationId, date: { gte: lookback, lt: queryEnd }, ...(filters.classId ? { classId: filters.classId } : {}), ...(filters.campusId ? { class: { campusId: filters.campusId } } : {}) },
      select: { date: true, status: true, classId: true },
    }),
    db.schoolFeePayment.findMany({
      where: { organizationId, receivedAt: { gte: lookback, lt: queryEnd }, ...(studentWhere ? { student: studentWhere } : {}) },
      select: { receivedAt: true, amount: true, refundedAt: true, refunds: { select: { id: true } } },
    }),
    db.schoolFeeRefund.findMany({ where: { organizationId, createdAt: { gte: lookback, lt: queryEnd }, ...(studentWhere ? { payment: { student: studentWhere } } : {}) }, select: { createdAt: true, amount: true } }),
    db.schoolClass.findMany({ where: classWhere, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const inRange = (date: Date, start: Date, end: Date) => date >= start && date < end;
  const summarize = (start: Date, end: Date) => {
    const marks = attendance.filter((record) => inRange(record.date, start, end));
    const healthy = marks.filter((record) => record.status === "PRESENT" || record.status === "LATE").length;
    return {
      attendanceRate: marks.length > 0 ? Math.round((healthy / marks.length) * 100) : null,
      absent: marks.filter((record) => record.status === "ABSENT").length,
      marked: marks.length,
      collections: payments.filter((payment) => inRange(payment.receivedAt, start, end) && (!payment.refundedAt || payment.refunds.length > 0)).reduce((sum, payment) => sum + Number(payment.amount), 0) - refunds.filter((refund) => inRange(refund.createdAt, start, end)).reduce((sum, refund) => sum + Number(refund.amount), 0),
    };
  };
  const current = summarize(from, toExclusive);
  const previous = summarize(previousFrom, from);
  const makeTrends = (granularity: TrendGranularity) => buildTrendBuckets(granularity).map((bucket) => {
    const period = summarize(bucket.start, bucket.end);
    return { label: bucket.label, attendanceRate: period.attendanceRate ?? 0, collections: period.collections };
  });
  const classAttendance = classes.map((schoolClass) => {
    const marks = attendance.filter((record) => record.classId === schoolClass.id && inRange(record.date, from, toExclusive));
    const healthy = marks.filter((record) => record.status === "PRESENT" || record.status === "LATE").length;
    return { label: schoolClass.name, value: marks.length > 0 ? Math.round((healthy / marks.length) * 100) : 0, marked: marks.length };
  });

  return {
    current,
    previous,
    classAttendance,
    trends: { days: makeTrends("days"), weeks: makeTrends("weeks"), months: makeTrends("months") },
  };
}
