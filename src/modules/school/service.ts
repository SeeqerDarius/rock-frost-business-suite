import "server-only";

import { Prisma, type HotelPaymentMethod, type SchoolAttendanceStatus, type SchoolStudentStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { createWithUniqueRetry } from "@/lib/unique-retry";

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

export async function recordSchoolAttendance(organizationId: string, data: { termId: string; classId: string; studentId: string; date: Date; status: SchoolAttendanceStatus; reason?: string | null }) {
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

export async function recordSchoolExamResult(organizationId: string, data: { examId: string; studentId: string; classId: string; subjectId: string; marks: Prisma.Decimal.Value; grade?: string | null; remark?: string | null }) {
  const exam = await db.schoolExam.findFirst({ where: { id: data.examId, organizationId, subjectId: data.subjectId, status: { in: ["DRAFT", "OPEN", "MODERATION"] } } });
  const enrollment = await db.schoolEnrollment.findFirst({ where: { organizationId, studentId: data.studentId, classId: data.classId, status: "ACTIVE", academicYearId: exam?.academicYearId } });
  if (!exam || !enrollment) throw new SchoolNotFoundError("Exam or active enrollment not found.");
  const marks = decimal(data.marks);
  if (marks.lt(0) || marks.gt(exam.totalMarks)) throw new SchoolStateError("Marks must be within the exam total.", "marks-out-of-range");
  return db.schoolExamResult.upsert({ where: { examId_studentId: { examId: data.examId, studentId: data.studentId } }, update: { marks, grade: data.grade, remark: data.remark }, create: { organizationId, ...data, marks } });
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
