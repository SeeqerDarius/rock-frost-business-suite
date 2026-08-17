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
];
