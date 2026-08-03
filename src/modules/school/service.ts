import "server-only";

import { Prisma, type HotelPaymentMethod, type SchoolAttendanceStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { createWithUniqueRetry } from "@/lib/unique-retry";

export class SchoolStateError extends Error {}
export class SchoolNotFoundError extends Error {}

const decimal = (value: Prisma.Decimal.Value) => new Prisma.Decimal(value);

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
  return db.schoolStudent.findMany({ where: { organizationId }, include: { campus: true, guardians: { include: { guardian: true } }, enrollments: { include: { class: true, academicYear: true } } }, orderBy: [{ lastName: "asc" }, { firstName: "asc" }] });
}

export function createSchoolStudent(organizationId: string, data: { campusId: string; firstName: string; lastName: string; dateOfBirth?: Date | null; gender?: string | null; admissionDate?: Date | null; medicalNotes?: string | null }) {
  return createWithUniqueRetry(async () => {
    const campus = await db.schoolCampus.findFirst({ where: { id: data.campusId, organizationId, active: true } });
    if (!campus) throw new SchoolNotFoundError("Campus not found.");
    return db.schoolStudent.create({ data: { organizationId, admissionNumber: await nextCode(organizationId, "STU", () => db.schoolStudent.count({ where: { organizationId } })), status: "ACTIVE", ...data } });
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
  if (class_.capacity && class_._count.enrollments >= class_.capacity) throw new SchoolStateError("Class capacity has been reached.");
  return db.schoolEnrollment.create({ data: { organizationId, ...data } });
}

export async function recordSchoolAttendance(organizationId: string, data: { termId: string; classId: string; studentId: string; date: Date; status: SchoolAttendanceStatus; reason?: string | null }) {
  const enrollment = await db.schoolEnrollment.findFirst({ where: { organizationId, studentId: data.studentId, classId: data.classId, status: "ACTIVE", academicYear: { terms: { some: { id: data.termId } } } } });
  if (!enrollment) throw new SchoolNotFoundError("Active student enrollment not found.");
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
    const invoice = await tx.schoolFeeInvoice.findFirst({ where: { id: invoiceId, organizationId, status: { in: ["ISSUED", "PART_PAID"] } }, include: { payments: true } });
    if (!invoice) throw new SchoolNotFoundError("Open invoice not found.");
    const paid = invoice.payments.filter((p) => !p.refundedAt).reduce((sum, p) => sum.plus(p.amount), new Prisma.Decimal(0));
    const due = invoice.amount.minus(invoice.discount).minus(paid);
    const amount = decimal(data.amount);
    if (amount.lte(0) || amount.gt(due)) throw new SchoolStateError("Payment exceeds the outstanding invoice balance.");
    const payment = await tx.schoolFeePayment.create({ data: { organizationId, invoiceId, studentId: invoice.studentId, receiptNumber: await nextCode(organizationId, "SRC", () => tx.schoolFeePayment.count({ where: { organizationId } })), ...data, amount } });
    await tx.schoolFeeInvoice.update({ where: { id: invoiceId }, data: { status: amount.eq(due) ? "PAID" : "PART_PAID" } });
    return payment;
  });
}

export async function createSchoolTimetableEntry(organizationId: string, data: { campusId: string; termId: string; classId: string; subjectId: string; teacherName: string; room?: string | null; dayOfWeek: number; startsAt: string; endsAt: string }) {
  if (data.dayOfWeek < 1 || data.dayOfWeek > 7 || data.endsAt <= data.startsAt) throw new SchoolStateError("Invalid timetable period.");
  const conflict = await db.schoolTimetableEntry.findFirst({ where: { organizationId, termId: data.termId, dayOfWeek: data.dayOfWeek, startsAt: { lt: data.endsAt }, endsAt: { gt: data.startsAt }, OR: [{ classId: data.classId }, { teacherName: data.teacherName }, ...(data.room ? [{ room: data.room }] : [])] } });
  if (conflict) throw new SchoolStateError("Timetable conflicts with an existing class, teacher, or room period.");
  return db.schoolTimetableEntry.create({ data: { organizationId, ...data } });
}

export async function recordSchoolExamResult(organizationId: string, data: { examId: string; studentId: string; classId: string; subjectId: string; marks: Prisma.Decimal.Value; grade?: string | null; remark?: string | null }) {
  const exam = await db.schoolExam.findFirst({ where: { id: data.examId, organizationId, subjectId: data.subjectId, status: { in: ["DRAFT", "OPEN", "MODERATION"] } } });
  const enrollment = await db.schoolEnrollment.findFirst({ where: { organizationId, studentId: data.studentId, classId: data.classId, status: "ACTIVE", academicYearId: exam?.academicYearId } });
  if (!exam || !enrollment) throw new SchoolNotFoundError("Exam or active enrollment not found.");
  const marks = decimal(data.marks);
  if (marks.lt(0) || marks.gt(exam.totalMarks)) throw new SchoolStateError("Marks must be within the exam total.");
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
    if (claimed.count !== 1) throw new SchoolStateError("No copy is available.");
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
