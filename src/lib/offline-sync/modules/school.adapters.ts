import "server-only";

import { z } from "zod";
import { db } from "@/lib/db";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import {
  createSchoolCampus,
  createSchoolAcademicYear,
  createSchoolTerm,
  createSchoolStudent,
  transitionSchoolStudent,
  createSchoolGuardian,
  linkSchoolGuardian,
  createSchoolClass,
  createSchoolSubject,
  enrollSchoolStudent,
  recordSchoolAttendance,
  createSchoolFeeInvoice,
  recordSchoolFeePayment,
  createSchoolFeeStructure,
  issueSchoolFeeStructure,
  createSchoolExam,
  recordSchoolExamResult,
  submitSchoolExamForModeration,
  publishSchoolExam,
  createSchoolTimetableEntry,
  createSchoolLibraryBook,
  borrowSchoolLibraryBook,
  returnSchoolLibraryBook,
  createSchoolTransportRoute,
  assignSchoolTransport,
  createSchoolPayrollAdjustment,
  upsertSchoolSettings,
} from "@/modules/school/service";
import { versionOf } from "@/lib/offline-sync/version";
import { defineOfflineAdapter } from "@/lib/offline-sync/registry";

const shortText = z.string().trim().min(1).max(200);
const longText = z.string().trim().max(5000);
const cuid = z.string().trim().min(1).max(50);
const dateInput = z.coerce.date();
const moneyAmountPositive = z
  .string()
  .trim()
  .regex(/^\d{1,12}(\.\d{1,2})?$/, "Must be a positive number with at most 2 decimal places.")
  .refine((value) => Number(value) > 0, "Must be greater than zero.");

const campusSchema = z.object({
  code: shortText,
  name: shortText,
  address: z.string().trim().max(5000).nullable().optional(),
  phone: shortText.nullable().optional(),
  email: z.string().trim().email().nullable().optional(),
});

const academicYearSchema = z.object({
  name: shortText,
  startDate: dateInput,
  endDate: dateInput,
  current: z.boolean().optional(),
});

const termSchema = z.object({
  academicYearId: cuid,
  name: shortText,
  startDate: dateInput,
  endDate: dateInput,
  current: z.boolean().optional(),
});

const studentSchema = z.object({
  campusId: cuid,
  firstName: shortText,
  lastName: shortText,
  dateOfBirth: dateInput.nullable().optional(),
  gender: shortText.nullable().optional(),
  admissionDate: dateInput.nullable().optional(),
  medicalNotes: longText.nullable().optional(),
});

const studentStatusTransitionSchema = z.object({
  toStatus: z.enum(["APPLICANT", "ACTIVE", "SUSPENDED", "WITHDRAWN", "GRADUATED"]),
  reason: longText.nullable().optional(),
});

const guardianSchema = z.object({
  firstName: shortText,
  lastName: shortText,
  email: z.string().trim().email().nullable(),
  phone: shortText,
  address: longText.nullable().optional(),
  occupation: shortText.nullable().optional(),
});

const guardianLinkSchema = z.object({
  studentId: cuid,
  guardianId: cuid,
  relationship: shortText,
  primary: z.boolean(),
});

const classSchema = z.object({
  campusId: cuid,
  code: shortText,
  name: shortText,
  gradeLevel: shortText.nullable().optional(),
  capacity: z.number().int().positive().max(10000).nullable().optional(),
});

const subjectSchema = z.object({
  code: shortText,
  name: shortText,
  description: longText.nullable().optional(),
});

const enrollmentSchema = z.object({
  campusId: cuid,
  academicYearId: cuid,
  studentId: cuid,
  classId: cuid,
});

const attendanceSchema = z.object({
  termId: cuid,
  classId: cuid,
  studentId: cuid,
  date: dateInput,
  status: z.enum(["PRESENT", "ABSENT", "LATE", "EXCUSED"]),
  reason: shortText.nullable().optional(),
});

const feeInvoiceSchema = z.object({
  academicYearId: cuid,
  termId: cuid.nullable().optional(),
  studentId: cuid,
  description: shortText,
  amount: moneyAmountPositive,
  discount: z.number().min(0).optional(),
  dueDate: dateInput.nullable().optional(),
});

const feePaymentSchema = z.object({
  invoiceId: cuid,
  amount: moneyAmountPositive,
  method: z.enum(["CASH", "CARD", "MOBILE_MONEY", "BANK_TRANSFER", "ONLINE", "OTHER"]),
  reference: shortText.nullable().optional(),
});

const feeStructureSchema = z.object({
  campusId: cuid,
  academicYearId: cuid,
  termId: cuid.nullable().optional(),
  classId: cuid.nullable().optional(),
  name: shortText,
  description: longText.nullable().optional(),
  amount: moneyAmountPositive,
  dueDate: dateInput.nullable().optional(),
});

const feeStructureIssuanceSchema = z.object({
  feeStructureId: cuid,
});

const examSchema = z.object({
  academicYearId: cuid,
  termId: cuid,
  subjectId: cuid,
  name: shortText,
  totalMarks: moneyAmountPositive,
  weight: moneyAmountPositive,
  examDate: dateInput.nullable().optional(),
});

const examResultSchema = z.object({
  examId: cuid,
  studentId: cuid,
  classId: cuid,
  subjectId: cuid,
  marks: z.number().min(0),
  grade: shortText.nullable().optional(),
  remark: shortText.nullable().optional(),
});

const examModerationSubmitSchema = z.object({
  examId: cuid,
});

const examPublishSchema = z.object({
  examId: cuid,
});

const timetableEntrySchema = z.object({
  campusId: cuid,
  termId: cuid,
  classId: cuid,
  subjectId: cuid,
  teacherName: shortText,
  room: shortText.nullable().optional(),
  dayOfWeek: z.number().int().min(1).max(7),
  startsAt: shortText,
  endsAt: shortText,
});

const libraryBookSchema = z.object({
  accessionCode: shortText,
  isbn: shortText.nullable().optional(),
  title: shortText,
  author: shortText.nullable().optional(),
  category: shortText.nullable().optional(),
  totalCopies: z.number().int().min(1).max(10000),
});

const libraryBorrowSchema = z.object({
  bookId: cuid,
  studentId: cuid,
  dueAt: dateInput,
});

const libraryReturnSchema = z.object({
  loanId: cuid,
});

const transportRouteSchema = z.object({
  campusId: cuid,
  code: shortText,
  name: shortText,
  vehicle: shortText.nullable().optional(),
  driverName: shortText.nullable().optional(),
  stops: z.array(shortText).optional(),
  fee: z.number().min(0),
});

const transportAssignmentSchema = z.object({
  routeId: cuid,
  studentId: cuid,
  stopName: shortText.nullable().optional(),
});

const payrollAdjustmentSchema = z.object({
  employeeId: shortText,
  period: shortText,
  type: shortText,
  description: shortText,
  amount: moneyAmountPositive,
});

const gradingScaleBandSchema = z.object({
  grade: shortText,
  min: z.number(),
  max: z.number(),
});

const settingsSchema = z.object({
  attendanceCloseDays: z.number().int().min(0).max(365),
  receiptPrefix: shortText,
  allowRanking: z.boolean(),
  gradingScale: z.array(gradingScaleBandSchema).nullable().optional(),
});

/**
 * Milestone 6 of the offline expansion: the School foundational slice.
 * Campus, academic year, and term are the reference data every later
 * School entity type (students, enrollment, fees, exams) hangs off of, so
 * this is deliberately the first and smallest School slice shipped - it
 * exercises the multi-campus/multi-year scoping risk cheaply before
 * milestones 7-10 build the much larger surface on top of it. All three
 * are CREATE-only, matching the web app: there is no edit action for a
 * campus, academic year, or term in src/app/app/school/actions.ts today.
 */
export const schoolOfflineAdapters = [
  defineOfflineAdapter({
    entityType: "school.campus",
    operation: "CREATE",
    payloadSchema: campusSchema,
    checkPermission: (tenant) => hasPermission(tenant, PERMISSIONS.SCHOOL_CAMPUSES_MANAGE),
    apply: async (tenant, _entityId, payload) => {
      const record = await createSchoolCampus(tenant.organizationId, payload);
      return { id: record.id, name: record.name };
    },
  }),
  defineOfflineAdapter({
    entityType: "school.academic_year",
    operation: "CREATE",
    payloadSchema: academicYearSchema,
    checkPermission: (tenant) => hasPermission(tenant, PERMISSIONS.SCHOOL_ACADEMICS_MANAGE),
    apply: async (tenant, _entityId, payload) => {
      const record = await createSchoolAcademicYear(tenant.organizationId, payload);
      return { id: record.id, name: record.name };
    },
  }),
  defineOfflineAdapter({
    entityType: "school.term",
    operation: "CREATE",
    payloadSchema: termSchema,
    checkPermission: (tenant) => hasPermission(tenant, PERMISSIONS.SCHOOL_ACADEMICS_MANAGE),
    apply: async (tenant, _entityId, payload) => {
      const record = await createSchoolTerm(tenant.organizationId, payload);
      return { id: record.id, name: record.name };
    },
  }),

  // --- Milestone 7: students, guardians, classes, subjects, enrollment,
  // attendance. school.student_status_transition is the second genuine
  // UPDATE case (after pos.register): entityId is the student's own id,
  // baseVersion is the cached SchoolStudent row's updatedAt. Every other
  // action here is CREATE. Several (enrollment, attendance, guardian
  // linking) reference another entity's real id (studentId/classId/
  // termId/guardianId) - exactly like POS's session-open-before-selling
  // constraint, those references only resolve once the referenced entity
  // has itself been confirmed by a prior sync; a reference to a still-
  // locally-pending entity fails safely as ENTITY_DELETED/not-found at
  // sync time rather than corrupting anything.
  defineOfflineAdapter({
    entityType: "school.student",
    operation: "CREATE",
    payloadSchema: studentSchema,
    checkPermission: (tenant) => hasPermission(tenant, PERMISSIONS.SCHOOL_STUDENTS_MANAGE),
    apply: async (tenant, _entityId, payload) => {
      const record = await createSchoolStudent(tenant.organizationId, payload);
      return { id: record.id, admissionNumber: record.admissionNumber };
    },
  }),
  defineOfflineAdapter({
    entityType: "school.student_status_transition",
    operation: "UPDATE",
    payloadSchema: studentStatusTransitionSchema,
    checkPermission: (tenant) => hasPermission(tenant, PERMISSIONS.SCHOOL_STUDENTS_MANAGE),
    loadCurrentVersion: async (tenant, entityId) => {
      const student = await db.schoolStudent.findFirst({ where: { id: entityId, organizationId: tenant.organizationId }, select: { updatedAt: true } });
      return student ? versionOf(student.updatedAt) : null;
    },
    apply: async (tenant, entityId, payload) => {
      const record = await transitionSchoolStudent(tenant.organizationId, entityId, payload.toStatus, payload.reason);
      return { id: record.id, status: record.status };
    },
  }),
  defineOfflineAdapter({
    entityType: "school.guardian",
    operation: "CREATE",
    payloadSchema: guardianSchema,
    checkPermission: (tenant) => hasPermission(tenant, PERMISSIONS.SCHOOL_STUDENTS_MANAGE),
    apply: async (tenant, _entityId, payload) => {
      const record = await createSchoolGuardian(tenant.organizationId, payload);
      return { id: record.id, guardianNumber: record.guardianNumber };
    },
  }),
  defineOfflineAdapter({
    entityType: "school.guardian_link",
    operation: "CREATE",
    payloadSchema: guardianLinkSchema,
    checkPermission: (tenant) => hasPermission(tenant, PERMISSIONS.SCHOOL_STUDENTS_MANAGE),
    apply: async (tenant, _entityId, payload) => {
      const record = await linkSchoolGuardian(tenant.organizationId, payload.studentId, payload.guardianId, payload.relationship, payload.primary);
      return { studentId: record.studentId, guardianId: record.guardianId };
    },
  }),
  defineOfflineAdapter({
    entityType: "school.class",
    operation: "CREATE",
    payloadSchema: classSchema,
    checkPermission: (tenant) => hasPermission(tenant, PERMISSIONS.SCHOOL_ACADEMICS_MANAGE),
    apply: async (tenant, _entityId, payload) => {
      const record = await createSchoolClass(tenant.organizationId, payload);
      return { id: record.id, name: record.name };
    },
  }),
  defineOfflineAdapter({
    entityType: "school.subject",
    operation: "CREATE",
    payloadSchema: subjectSchema,
    checkPermission: (tenant) => hasPermission(tenant, PERMISSIONS.SCHOOL_ACADEMICS_MANAGE),
    apply: async (tenant, _entityId, payload) => {
      const record = await createSchoolSubject(tenant.organizationId, payload);
      return { id: record.id, name: record.name };
    },
  }),
  defineOfflineAdapter({
    entityType: "school.enrollment",
    operation: "CREATE",
    payloadSchema: enrollmentSchema,
    checkPermission: (tenant) => hasPermission(tenant, PERMISSIONS.SCHOOL_ENROLLMENT_MANAGE),
    apply: async (tenant, _entityId, payload) => {
      const record = await enrollSchoolStudent(tenant.organizationId, payload);
      return { id: record.id, classId: record.classId };
    },
  }),
  defineOfflineAdapter({
    entityType: "school.attendance",
    operation: "CREATE",
    payloadSchema: attendanceSchema,
    checkPermission: (tenant) => hasPermission(tenant, PERMISSIONS.SCHOOL_ATTENDANCE_MANAGE),
    apply: async (tenant, _entityId, payload) => {
      const record = await recordSchoolAttendance(tenant.organizationId, payload);
      return { id: record.id, status: record.status };
    },
  }),

  // --- Milestone 8: fees. school.fee_structure_issuance is a bulk fan-out
  // modeled as a CREATE of an issuance *event* (payload only carries
  // feeStructureId), not N individual invoice mutations: the eligible-
  // student set is computed fresh at sync time from live server data, so
  // the offline mutation is an instruction ("issue this structure now"),
  // never a client-side snapshot of who to bill. Safety is double-covered
  // - the ledger's (organizationId, mutationId) uniqueness prevents a
  // retried push from re-running the whole fan-out, and
  // issueSchoolFeeStructure's own per-student dedup (skips anyone already
  // invoiced for that structure) prevents a duplicate bill even if two
  // devices queue the same issuance while both offline.
  defineOfflineAdapter({
    entityType: "school.fee_invoice",
    operation: "CREATE",
    payloadSchema: feeInvoiceSchema,
    checkPermission: (tenant) => hasPermission(tenant, PERMISSIONS.SCHOOL_FEES_MANAGE),
    apply: async (tenant, _entityId, payload) => {
      const record = await createSchoolFeeInvoice(tenant.organizationId, payload);
      return { id: record.id, invoiceNumber: record.invoiceNumber };
    },
  }),
  defineOfflineAdapter({
    entityType: "school.fee_payment",
    operation: "CREATE",
    payloadSchema: feePaymentSchema,
    checkPermission: (tenant) => hasPermission(tenant, PERMISSIONS.SCHOOL_FEES_MANAGE),
    apply: async (tenant, _entityId, payload) => {
      const { invoiceId, ...data } = payload;
      const record = await recordSchoolFeePayment(tenant.organizationId, invoiceId, data);
      return { id: record.id, receiptNumber: record.receiptNumber };
    },
  }),
  defineOfflineAdapter({
    entityType: "school.fee_structure",
    operation: "CREATE",
    payloadSchema: feeStructureSchema,
    checkPermission: (tenant) => hasPermission(tenant, PERMISSIONS.SCHOOL_FEES_MANAGE),
    apply: async (tenant, _entityId, payload) => {
      const record = await createSchoolFeeStructure(tenant.organizationId, payload);
      return { id: record.id, name: record.name };
    },
  }),
  defineOfflineAdapter({
    entityType: "school.fee_structure_issuance",
    operation: "CREATE",
    payloadSchema: feeStructureIssuanceSchema,
    checkPermission: (tenant) => hasPermission(tenant, PERMISSIONS.SCHOOL_FEES_MANAGE),
    apply: async (tenant, _entityId, payload) => {
      return issueSchoolFeeStructure(tenant.organizationId, payload.feeStructureId);
    },
  }),

  // --- Milestone 9: exams. school.exam_moderation_submit and
  // school.exam_publish are modeled as CREATE events (a client-generated
  // correlation entityId, the real examId carried in the payload) rather
  // than UPDATE against the exam's own id: SchoolExam has no updatedAt
  // column, so there is no natural version to check baseVersion against -
  // the same reasoning that made pos.session_open/close events rather
  // than edits. Their safety comes entirely from submitSchoolExamForMod
  // eration's/publishSchoolExam's own status-and-has-results guards,
  // rechecked server-side regardless of what the client believed the
  // exam's status was.
  defineOfflineAdapter({
    entityType: "school.exam",
    operation: "CREATE",
    payloadSchema: examSchema,
    checkPermission: (tenant) => hasPermission(tenant, PERMISSIONS.SCHOOL_EXAMS_MANAGE),
    apply: async (tenant, _entityId, payload) => {
      const record = await createSchoolExam(tenant.organizationId, payload);
      return { id: record.id, name: record.name };
    },
  }),
  defineOfflineAdapter({
    entityType: "school.exam_result",
    operation: "CREATE",
    payloadSchema: examResultSchema,
    checkPermission: (tenant) => hasPermission(tenant, PERMISSIONS.SCHOOL_EXAMS_MANAGE),
    apply: async (tenant, _entityId, payload) => {
      const record = await recordSchoolExamResult(tenant.organizationId, payload);
      return { id: record.id, marks: record.marks.toString(), grade: record.grade };
    },
  }),
  defineOfflineAdapter({
    entityType: "school.exam_moderation_submit",
    operation: "CREATE",
    payloadSchema: examModerationSubmitSchema,
    checkPermission: (tenant) => hasPermission(tenant, PERMISSIONS.SCHOOL_EXAMS_MANAGE),
    apply: async (tenant, _entityId, payload) => {
      const record = await submitSchoolExamForModeration(tenant.organizationId, payload.examId);
      return { id: record.id, status: record.status };
    },
  }),
  defineOfflineAdapter({
    entityType: "school.exam_publish",
    operation: "CREATE",
    payloadSchema: examPublishSchema,
    checkPermission: (tenant) => hasPermission(tenant, PERMISSIONS.SCHOOL_EXAMS_PUBLISH),
    apply: async (tenant, _entityId, payload) => {
      const [, exam] = await publishSchoolExam(tenant.organizationId, payload.examId);
      return { id: exam.id, status: exam.status };
    },
  }),

  // --- Milestone 10: timetable, library, transport, payroll adjustments,
  // and settings. school.library_loan_return and school.transport_
  // assignment follow the established event/reference conventions above:
  // a return has no updatedAt column to version against (event, like
  // exam_moderation_submit); a transport assignment references two other
  // entities' real ids and is already idempotent server-side via
  // assignSchoolTransport's upsert on the (routeId, studentId) unique key
  // (the same reasoning as guardian_link). school.settings is this
  // milestone's one genuine UPDATE: entityId is the campus's own id (not a
  // fixed sentinel, since settings are per-campus), and loadCurrentVersion
  // returns 0 rather than null when a campus has no settings row yet -
  // "never configured" is not "deleted", the same distinction pos.settings_
  // receipt_footer/sale_prefix already make.
  defineOfflineAdapter({
    entityType: "school.timetable_entry",
    operation: "CREATE",
    payloadSchema: timetableEntrySchema,
    checkPermission: (tenant) => hasPermission(tenant, PERMISSIONS.SCHOOL_TIMETABLES_MANAGE),
    apply: async (tenant, _entityId, payload) => {
      const record = await createSchoolTimetableEntry(tenant.organizationId, payload);
      return { id: record.id, classId: record.classId };
    },
  }),
  defineOfflineAdapter({
    entityType: "school.library_book",
    operation: "CREATE",
    payloadSchema: libraryBookSchema,
    checkPermission: (tenant) => hasPermission(tenant, PERMISSIONS.SCHOOL_LIBRARY_MANAGE),
    apply: async (tenant, _entityId, payload) => {
      const record = await createSchoolLibraryBook(tenant.organizationId, payload);
      return { id: record.id, accessionCode: record.accessionCode };
    },
  }),
  defineOfflineAdapter({
    entityType: "school.library_loan",
    operation: "CREATE",
    payloadSchema: libraryBorrowSchema,
    checkPermission: (tenant) => hasPermission(tenant, PERMISSIONS.SCHOOL_LIBRARY_MANAGE),
    apply: async (tenant, _entityId, payload) => {
      const record = await borrowSchoolLibraryBook(tenant.organizationId, payload.bookId, payload.studentId, payload.dueAt);
      return { id: record.id, bookId: record.bookId };
    },
  }),
  defineOfflineAdapter({
    entityType: "school.library_loan_return",
    operation: "CREATE",
    payloadSchema: libraryReturnSchema,
    checkPermission: (tenant) => hasPermission(tenant, PERMISSIONS.SCHOOL_LIBRARY_MANAGE),
    apply: async (tenant, _entityId, payload) => {
      const record = await returnSchoolLibraryBook(tenant.organizationId, payload.loanId);
      return { id: record.id, status: record.status };
    },
  }),
  defineOfflineAdapter({
    entityType: "school.transport_route",
    operation: "CREATE",
    payloadSchema: transportRouteSchema,
    checkPermission: (tenant) => hasPermission(tenant, PERMISSIONS.SCHOOL_TRANSPORT_MANAGE),
    apply: async (tenant, _entityId, payload) => {
      const record = await createSchoolTransportRoute(tenant.organizationId, payload);
      return { id: record.id, name: record.name };
    },
  }),
  defineOfflineAdapter({
    entityType: "school.transport_assignment",
    operation: "CREATE",
    payloadSchema: transportAssignmentSchema,
    checkPermission: (tenant) => hasPermission(tenant, PERMISSIONS.SCHOOL_TRANSPORT_MANAGE),
    apply: async (tenant, _entityId, payload) => {
      const record = await assignSchoolTransport(tenant.organizationId, payload.routeId, payload.studentId, payload.stopName);
      return { routeId: record.routeId, studentId: record.studentId };
    },
  }),
  defineOfflineAdapter({
    entityType: "school.payroll_adjustment",
    operation: "CREATE",
    payloadSchema: payrollAdjustmentSchema,
    checkPermission: (tenant) => hasPermission(tenant, PERMISSIONS.SCHOOL_PAYROLL_MANAGE),
    apply: async (tenant, _entityId, payload) => {
      const record = await createSchoolPayrollAdjustment(tenant.organizationId, payload);
      return { id: record.id, amount: record.amount.toString() };
    },
  }),
  defineOfflineAdapter({
    entityType: "school.settings",
    operation: "UPDATE",
    payloadSchema: settingsSchema,
    checkPermission: (tenant) => hasPermission(tenant, PERMISSIONS.SCHOOL_SETTINGS_MANAGE),
    loadCurrentVersion: async (tenant, entityId) => {
      const settings = await db.schoolSettings.findFirst({ where: { campusId: entityId, organizationId: tenant.organizationId }, select: { updatedAt: true } });
      return settings ? versionOf(settings.updatedAt) : 0;
    },
    apply: async (tenant, entityId, payload) => {
      const record = await upsertSchoolSettings(tenant.organizationId, {
        campusId: entityId,
        attendanceCloseDays: payload.attendanceCloseDays,
        receiptPrefix: payload.receiptPrefix,
        allowRanking: payload.allowRanking,
        gradingScale: payload.gradingScale ?? undefined,
      });
      return { campusId: record.campusId, receiptPrefix: record.receiptPrefix };
    },
  }),
];
