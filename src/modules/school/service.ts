import "server-only";

import { Prisma, type HotelPaymentMethod, type SchoolAttendanceStatus, type SchoolStudentStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { createWithUniqueRetry } from "@/lib/unique-retry";
import { buildTrendBuckets, widestTrendLookback, type TrendGranularity } from "@/lib/trend-buckets";

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

export function createSchoolGuardian(organizationId: string, data: { firstName: string; lastName: string; email?: string | null; phone: string; address?: string | null; occupation?: string | null }) {
  return createWithUniqueRetry(async () => db.schoolGuardian.create({ data: { organizationId, guardianNumber: await nextCode(organizationId, "GRD", () => db.schoolGuardian.count({ where: { organizationId } })), ...data } }));
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

/** Active org members eligible to be assigned as a class teacher - any active member, not filtered to a "Teacher"-named role, since scoping is by explicit assignment. */
export function listOrganizationStaffForAssignment(organizationId: string) {
  return db.organizationMember.findMany({ where: { organizationId, status: "ACTIVE" }, include: { user: true, role: true }, orderBy: { user: { name: "asc" } } });
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

export function listSchoolGuardians(organizationId: string) { return db.schoolGuardian.findMany({ where: { organizationId }, orderBy: [{ lastName: "asc" }, { firstName: "asc" }] }); }

/**
 * Passport/profile photo storage mirrors InventoryItem.imageData - a
 * base64 data URL in a nullable Text column, read back through a dedicated
 * authenticated streaming route rather than as part of the normal list
 * queries (which don't select photoData at all, keeping the common-path
 * payload small).
 */
/** Cheap id-only lookup for rendering a table's photo column without pulling every row's base64 image data into the list query. */
export async function listSchoolStudentPhotoIds(organizationId: string) {
  const rows = await db.schoolStudent.findMany({ where: { organizationId, photoData: { not: null } }, select: { id: true } });
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
export function listSchoolTimetable(organizationId: string) { return db.schoolTimetableEntry.findMany({ where: { organizationId }, include: { campus: true, term: true, class: true, subject: true }, orderBy: [{ dayOfWeek: "asc" }, { startsAt: "asc" }] }); }

export async function enrollSchoolStudent(organizationId: string, data: { campusId: string; academicYearId: string; studentId: string; classId: string }) {
  const [student, year, class_] = await Promise.all([
    db.schoolStudent.findFirst({ where: { id: data.studentId, organizationId, campusId: data.campusId, status: "ACTIVE" } }),
    db.schoolAcademicYear.findFirst({ where: { id: data.academicYearId, organizationId } }),
    db.schoolClass.findFirst({ where: { id: data.classId, organizationId, campusId: data.campusId, active: true }, include: { _count: { select: { enrollments: { where: { academicYearId: data.academicYearId, status: "ACTIVE" } } } } } }),
  ]);
  if (!student || !year || !class_) throw new SchoolNotFoundError("Student, academic year, or class not found.");
  if (class_.capacity && class_._count.enrollments >= class_.capacity) throw new SchoolStateError("Class capacity has been reached.", "class-capacity");
  return db.schoolEnrollment.create({ data: { organizationId, ...data } });
}

export async function recordSchoolAttendance(organizationId: string, actingUserId: string, data: { termId: string; classId: string; studentId: string; date: Date; status: SchoolAttendanceStatus; reason?: string | null }) {
  const scope = await resolveTeacherClassScope(organizationId, actingUserId);
  if (scope && !scope.has(data.classId)) throw new SchoolStateError("You can only record attendance for a class you're assigned to.", "class-not-assigned");
  const enrollment = await db.schoolEnrollment.findFirst({ where: { organizationId, studentId: data.studentId, classId: data.classId, status: "ACTIVE", student: { status: "ACTIVE" }, academicYear: { terms: { some: { id: data.termId } } } }, include: { campus: { include: { settings: true } } } });
  if (!enrollment) throw new SchoolNotFoundError("Active student enrollment not found.");
  const now = new Date();
  const attendanceDate = new Date(data.date);
  if (attendanceDate > now) throw new SchoolStateError("Attendance cannot be recorded for a future date.", "future-attendance");
  const closeDays = enrollment.campus.settings?.attendanceCloseDays ?? 7;
  const oldestAllowed = new Date(now);
  oldestAllowed.setHours(0, 0, 0, 0);
  oldestAllowed.setDate(oldestAllowed.getDate() - closeDays);
  if (attendanceDate < oldestAllowed) throw new SchoolStateError("The attendance correction window has closed.", "attendance-closed");
  return db.schoolAttendance.upsert({ where: { studentId_date: { studentId: data.studentId, date: data.date } }, update: { status: data.status, reason: data.reason }, create: { organizationId, ...data } });
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

  await db.$transaction(
    valid.map((entry) =>
      db.schoolAttendance.upsert({
        where: { studentId_date: { studentId: entry.studentId, date: data.date } },
        update: { status: entry.status, reason: entry.reason ?? null },
        create: { organizationId, termId: data.termId, classId: data.classId, studentId: entry.studentId, date: data.date, status: entry.status, reason: entry.reason ?? null },
      }),
    ),
  );

  return { saved: valid.length, skipped: data.entries.length - valid.length };
}

export function listSchoolFeeInvoices(organizationId: string) {
  return db.schoolFeeInvoice.findMany({ where: { organizationId }, include: { student: true, payments: true, academicYear: true, term: true }, orderBy: { createdAt: "desc" } });
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
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${organizationId}:school-receipt`}))`;
    const invoice = await tx.schoolFeeInvoice.findFirst({ where: { id: invoiceId, organizationId, status: { in: ["ISSUED", "PART_PAID"] } }, include: { payments: true, student: { include: { campus: { include: { settings: true } } } } } });
    if (!invoice) throw new SchoolNotFoundError("Open invoice not found.");
    const paid = invoice.payments.filter((p) => !p.refundedAt).reduce((sum, p) => sum.plus(p.amount), new Prisma.Decimal(0));
    const due = invoice.amount.minus(invoice.discount).minus(paid);
    const amount = decimal(data.amount);
    if (amount.lte(0) || amount.gt(due)) throw new SchoolStateError("Payment exceeds the outstanding invoice balance.", "payment-exceeds-balance");
    const receiptPrefix = invoice.student.campus.settings?.receiptPrefix?.trim() || "SCH";
    const payment = await tx.schoolFeePayment.create({ data: { organizationId, invoiceId, studentId: invoice.studentId, receiptNumber: await nextCode(organizationId, receiptPrefix, () => tx.schoolFeePayment.count({ where: { organizationId } })), ...data, amount } });
    await tx.schoolFeeInvoice.update({ where: { id: invoiceId }, data: { status: amount.eq(due) ? "PAID" : "PART_PAID" } });
    return payment;
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
 * Reads a campus's `SchoolSettings.gradingScale` (`[{ grade, min, max }, …]`
 * as percentages, edited via the Settings > Grading scale control) and
 * returns the matching letter grade for a mark percentage. Returns null if
 * the campus has no grading scale configured or none of its bands match —
 * callers keep whatever grade (if any) was already supplied in that case.
 */
function resolveGradeFromScale(gradingScale: Prisma.JsonValue | null | undefined, percent: number): string | null {
  if (!Array.isArray(gradingScale)) return null;
  for (const entry of gradingScale) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    const grade = typeof row.grade === "string" ? row.grade : null;
    const min = typeof row.min === "number" ? row.min : null;
    const max = typeof row.max === "number" ? row.max : null;
    if (grade && min !== null && max !== null && percent >= min && percent <= max) return grade;
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

  // Auto-derive the letter grade from the campus's configured grading scale
  // (Settings > Grading scale) when the caller didn't supply one explicitly —
  // an explicit grade always wins, so a teacher can still override it.
  let grade = data.grade;
  if (!grade) {
    const percent = marks.div(exam.totalMarks).times(100).toNumber();
    grade = resolveGradeFromScale(enrollment.student.campus.settings?.gradingScale, percent);
  }

  return db.schoolExamResult.upsert({ where: { examId_studentId: { examId: data.examId, studentId: data.studentId } }, update: { marks, grade, remark: data.remark }, create: { organizationId, ...data, marks, grade } });
}

export function listSchoolExams(organizationId: string) { return db.schoolExam.findMany({ where: { organizationId }, include: { academicYear: true, term: true, subject: true, results: { include: { student: true, class: true } } }, orderBy: { examDate: "desc" } }); }

export async function createSchoolExam(organizationId: string, data: { academicYearId: string; termId: string; subjectId: string; name: string; totalMarks: Prisma.Decimal.Value; weight: Prisma.Decimal.Value; examDate?: Date | null }) {
  const term = await db.schoolTerm.findFirst({ where: { id: data.termId, organizationId, academicYearId: data.academicYearId } });
  const subject = await db.schoolSubject.findFirst({ where: { id: data.subjectId, organizationId, active: true } });
  if (!term || !subject) throw new SchoolNotFoundError("Academic period or subject not found.");
  return db.schoolExam.create({ data: { organizationId, ...data, totalMarks: decimal(data.totalMarks), weight: decimal(data.weight), status: "OPEN" } });
}

export async function publishSchoolExam(organizationId: string, examId: string) {
  const exam = await db.schoolExam.findFirst({ where: { id: examId, organizationId }, include: { results: true } });
  if (!exam) throw new SchoolNotFoundError("Exam not found.");
  if (exam.status !== "MODERATION" || exam.results.length === 0) throw new SchoolStateError("Only moderated exams with results can be published.");
  const now = new Date();
  return db.$transaction([db.schoolExamResult.updateMany({ where: { examId, organizationId }, data: { publishedAt: now } }), db.schoolExam.update({ where: { id: examId }, data: { status: "PUBLISHED", publishedAt: now } })]);
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
export function createSchoolLibraryBook(organizationId: string, data: { accessionCode: string; isbn?: string | null; title: string; author?: string | null; category?: string | null; totalCopies: number }) { if(data.totalCopies<1) throw new SchoolStateError("At least one copy is required."); return db.schoolLibraryBook.create({ data: { organizationId, ...data, availableCopies: data.totalCopies } }); }

export function listSchoolTransport(organizationId: string) { return db.schoolTransportRoute.findMany({ where: { organizationId }, include: { campus: true, assignments: { include: { student: true } } }, orderBy: { name: "asc" } }); }
export async function createSchoolTransportRoute(organizationId: string, data: { campusId: string; code: string; name: string; vehicle?: string | null; driverName?: string | null; stops?: string[]; fee: Prisma.Decimal.Value }) { if(!(await db.schoolCampus.findFirst({where:{id:data.campusId,organizationId}}))) throw new SchoolNotFoundError("Campus not found."); return db.schoolTransportRoute.create({data:{organizationId,...data,stops:data.stops ?? Prisma.JsonNull,fee:decimal(data.fee)}}); }
export async function assignSchoolTransport(organizationId:string,routeId:string,studentId:string,stopName?:string|null){const [route,student]=await Promise.all([db.schoolTransportRoute.findFirst({where:{id:routeId,organizationId,active:true}}),db.schoolStudent.findFirst({where:{id:studentId,organizationId,status:"ACTIVE"}})]);if(!route||!student)throw new SchoolNotFoundError("Route or student not found.");return db.schoolTransportAssignment.upsert({where:{routeId_studentId:{routeId,studentId}},update:{stopName,active:true},create:{organizationId,routeId,studentId,stopName}});}

export function listSchoolPayrollAdjustments(organizationId:string){return db.schoolPayrollAdjustment.findMany({where:{organizationId},orderBy:{createdAt:"desc"}});}
export function createSchoolPayrollAdjustment(organizationId:string,data:{employeeId:string;period:string;type:string;description:string;amount:Prisma.Decimal.Value}){return db.schoolPayrollAdjustment.create({data:{organizationId,...data,amount:decimal(data.amount)}});}

export function listSchoolSettings(organizationId:string){return db.schoolCampus.findMany({where:{organizationId},include:{settings:true},orderBy:{name:"asc"}});}
export async function upsertSchoolSettings(organizationId:string,data:{campusId:string;attendanceCloseDays:number;receiptPrefix:string;allowRanking:boolean;gradingScale?:Prisma.InputJsonValue}){if(!(await db.schoolCampus.findFirst({where:{id:data.campusId,organizationId}})))throw new SchoolNotFoundError("Campus not found.");const values={attendanceCloseDays:data.attendanceCloseDays,receiptPrefix:data.receiptPrefix,allowRanking:data.allowRanking,gradingScale:data.gradingScale};return db.schoolSettings.upsert({where:{campusId:data.campusId},update:values,create:{organizationId,...data}});}

export async function getSchoolSummary(organizationId: string) {
  const [students, classes, attendance, invoices, payments, overdueLoans, routes] = await Promise.all([
    db.schoolStudent.count({ where: { organizationId, status: "ACTIVE" } }),
    db.schoolClass.count({ where: { organizationId, active: true } }),
    db.schoolAttendance.groupBy({ by: ["status"], where: { organizationId }, _count: true }),
    db.schoolFeeInvoice.findMany({ where: { organizationId, status: { in: ["ISSUED", "PART_PAID"] } }, include: { payments: true } }),
    db.schoolFeePayment.aggregate({ where: { organizationId, refundedAt: null }, _sum: { amount: true } }),
    db.schoolLibraryLoan.count({ where: { organizationId, status: { in: ["BORROWED", "OVERDUE"] }, dueAt: { lt: new Date() } } }),
    db.schoolTransportRoute.count({ where: { organizationId, active: true } }),
  ]);
  const outstanding = invoices.reduce((total, invoice) => total.plus(invoice.amount.minus(invoice.discount).minus(invoice.payments.filter((p) => !p.refundedAt).reduce((sum, p) => sum.plus(p.amount), new Prisma.Decimal(0)))), new Prisma.Decimal(0));
  return { activeStudents: students, activeClasses: classes, attendance: Object.fromEntries(attendance.map((item) => [item.status, item._count])), collections: payments._sum.amount ?? new Prisma.Decimal(0), outstanding, overdueLoans, activeRoutes: routes };
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

  const [attendance, payments, classes] = await Promise.all([
    db.schoolAttendance.findMany({
      where: { organizationId, date: { gte: lookback, lt: queryEnd }, ...(filters.classId ? { classId: filters.classId } : {}), ...(filters.campusId ? { class: { campusId: filters.campusId } } : {}) },
      select: { date: true, status: true, classId: true },
    }),
    db.schoolFeePayment.findMany({
      where: { organizationId, refundedAt: null, receivedAt: { gte: lookback, lt: queryEnd }, ...(studentWhere ? { student: studentWhere } : {}) },
      select: { receivedAt: true, amount: true },
    }),
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
      collections: payments.filter((payment) => inRange(payment.receivedAt, start, end)).reduce((sum, payment) => sum + Number(payment.amount), 0),
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
