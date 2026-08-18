import type { LocalDatabase } from "@/db/local-database";
import { recordOfflineMutation } from "@/modules/offline-mutation-recorder";
import {
  SCHOOL_ENTITY_TYPES,
  type SchoolCampusPayload,
  type SchoolAcademicYearPayload,
  type SchoolTermPayload,
  type SchoolStudentPayload,
  type SchoolStudentStatusTransitionPayload,
  type SchoolGuardianPayload,
  type SchoolGuardianLinkPayload,
  type SchoolClassPayload,
  type SchoolSubjectPayload,
  type SchoolEnrollmentPayload,
  type SchoolAttendancePayload,
  type SchoolFeeInvoicePayload,
  type SchoolFeePaymentPayload,
  type SchoolFeeStructurePayload,
  type SchoolFeeStructureIssuancePayload,
  type SchoolExamPayload,
  type SchoolExamResultPayload,
  type SchoolExamModerationSubmitPayload,
  type SchoolExamPublishPayload,
  type SchoolTimetableEntryPayload,
  type SchoolLibraryBookPayload,
  type SchoolLibraryLoanPayload,
  type SchoolLibraryLoanReturnPayload,
  type SchoolTransportRoutePayload,
  type SchoolTransportAssignmentPayload,
  type SchoolPayrollAdjustmentPayload,
  type SchoolSettingsPayload,
} from "@/modules/school/types";

export interface SchoolAdapterContext { db: LocalDatabase; organizationId: string; actingUserName: string | null }

/**
 * Milestone 6 shipped campus/academic-year/term, all CREATE-only. Milestone
 * 7 adds students, guardians, classes, subjects, enrollment, and
 * attendance. `updateStudentStatus` is the module's first genuine UPDATE:
 * `baseVersion` must be the cached student row's own version, and
 * `entityId` must be the student's real, already-synced id - the same
 * "the target must have synced at least once" constraint POS's Sell
 * screen already applies to session selection (see local-stock-overlay.ts
 * and PosSellScreen.tsx's session picker for the established pattern).
 */
export function createSchoolAdapter(ctx: SchoolAdapterContext) {
  const base = { db: ctx.db, organizationId: ctx.organizationId, moduleKey: "school" as const, actingUserName: ctx.actingUserName };

  return {
    createCampus: (entityId: string, payload: SchoolCampusPayload) =>
      recordOfflineMutation({ ...base, entityType: SCHOOL_ENTITY_TYPES.CAMPUS, entityId, operation: "CREATE", baseVersion: 0, payload }),

    createAcademicYear: (entityId: string, payload: SchoolAcademicYearPayload) =>
      recordOfflineMutation({ ...base, entityType: SCHOOL_ENTITY_TYPES.ACADEMIC_YEAR, entityId, operation: "CREATE", baseVersion: 0, payload }),

    createTerm: (entityId: string, payload: SchoolTermPayload) =>
      recordOfflineMutation({ ...base, entityType: SCHOOL_ENTITY_TYPES.TERM, entityId, operation: "CREATE", baseVersion: 0, payload }),

    createStudent: (entityId: string, payload: SchoolStudentPayload) =>
      recordOfflineMutation({ ...base, entityType: SCHOOL_ENTITY_TYPES.STUDENT, entityId, operation: "CREATE", baseVersion: 0, payload }),

    updateStudentStatus: (studentId: string, payload: SchoolStudentStatusTransitionPayload, baseVersion: number) =>
      recordOfflineMutation({ ...base, entityType: SCHOOL_ENTITY_TYPES.STUDENT_STATUS_TRANSITION, entityId: studentId, operation: "UPDATE", baseVersion, payload }),

    createGuardian: (entityId: string, payload: SchoolGuardianPayload) =>
      recordOfflineMutation({ ...base, entityType: SCHOOL_ENTITY_TYPES.GUARDIAN, entityId, operation: "CREATE", baseVersion: 0, payload }),

    linkGuardian: (entityId: string, payload: SchoolGuardianLinkPayload) =>
      recordOfflineMutation({ ...base, entityType: SCHOOL_ENTITY_TYPES.GUARDIAN_LINK, entityId, operation: "CREATE", baseVersion: 0, payload }),

    createClass: (entityId: string, payload: SchoolClassPayload) =>
      recordOfflineMutation({ ...base, entityType: SCHOOL_ENTITY_TYPES.CLASS, entityId, operation: "CREATE", baseVersion: 0, payload }),

    createSubject: (entityId: string, payload: SchoolSubjectPayload) =>
      recordOfflineMutation({ ...base, entityType: SCHOOL_ENTITY_TYPES.SUBJECT, entityId, operation: "CREATE", baseVersion: 0, payload }),

    enrollStudent: (entityId: string, payload: SchoolEnrollmentPayload) =>
      recordOfflineMutation({ ...base, entityType: SCHOOL_ENTITY_TYPES.ENROLLMENT, entityId, operation: "CREATE", baseVersion: 0, payload }),

    recordAttendance: (entityId: string, payload: SchoolAttendancePayload) =>
      recordOfflineMutation({ ...base, entityType: SCHOOL_ENTITY_TYPES.ATTENDANCE, entityId, operation: "CREATE", baseVersion: 0, payload }),

    createFeeInvoice: (entityId: string, payload: SchoolFeeInvoicePayload) =>
      recordOfflineMutation({ ...base, entityType: SCHOOL_ENTITY_TYPES.FEE_INVOICE, entityId, operation: "CREATE", baseVersion: 0, payload }),

    recordFeePayment: (entityId: string, payload: SchoolFeePaymentPayload) =>
      recordOfflineMutation({ ...base, entityType: SCHOOL_ENTITY_TYPES.FEE_PAYMENT, entityId, operation: "CREATE", baseVersion: 0, payload }),

    createFeeStructure: (entityId: string, payload: SchoolFeeStructurePayload) =>
      recordOfflineMutation({ ...base, entityType: SCHOOL_ENTITY_TYPES.FEE_STRUCTURE, entityId, operation: "CREATE", baseVersion: 0, payload }),

    /** entityId is a client-generated correlation id, not tied to any single invoice: the eligible-student set is computed fresh at sync time, matching the bulk fan-out design (see school.adapters.ts server-side). */
    issueFeeStructure: (entityId: string, payload: SchoolFeeStructureIssuancePayload) =>
      recordOfflineMutation({ ...base, entityType: SCHOOL_ENTITY_TYPES.FEE_STRUCTURE_ISSUANCE, entityId, operation: "CREATE", baseVersion: 0, payload }),

    createExam: (entityId: string, payload: SchoolExamPayload) =>
      recordOfflineMutation({ ...base, entityType: SCHOOL_ENTITY_TYPES.EXAM, entityId, operation: "CREATE", baseVersion: 0, payload }),

    recordExamResult: (entityId: string, payload: SchoolExamResultPayload) =>
      recordOfflineMutation({ ...base, entityType: SCHOOL_ENTITY_TYPES.EXAM_RESULT, entityId, operation: "CREATE", baseVersion: 0, payload }),

    /** entityId is a client-generated correlation id, not the exam's own id: SchoolExam has no updatedAt to check a baseVersion against, so this is an event, like pos.session_open/close. */
    submitExamForModeration: (entityId: string, payload: SchoolExamModerationSubmitPayload) =>
      recordOfflineMutation({ ...base, entityType: SCHOOL_ENTITY_TYPES.EXAM_MODERATION_SUBMIT, entityId, operation: "CREATE", baseVersion: 0, payload }),

    publishExam: (entityId: string, payload: SchoolExamPublishPayload) =>
      recordOfflineMutation({ ...base, entityType: SCHOOL_ENTITY_TYPES.EXAM_PUBLISH, entityId, operation: "CREATE", baseVersion: 0, payload }),

    createTimetableEntry: (entityId: string, payload: SchoolTimetableEntryPayload) =>
      recordOfflineMutation({ ...base, entityType: SCHOOL_ENTITY_TYPES.TIMETABLE_ENTRY, entityId, operation: "CREATE", baseVersion: 0, payload }),

    createLibraryBook: (entityId: string, payload: SchoolLibraryBookPayload) =>
      recordOfflineMutation({ ...base, entityType: SCHOOL_ENTITY_TYPES.LIBRARY_BOOK, entityId, operation: "CREATE", baseVersion: 0, payload }),

    borrowLibraryBook: (entityId: string, payload: SchoolLibraryLoanPayload) =>
      recordOfflineMutation({ ...base, entityType: SCHOOL_ENTITY_TYPES.LIBRARY_LOAN, entityId, operation: "CREATE", baseVersion: 0, payload }),

    /** entityId is a client-generated correlation id, not the loan's own id: SchoolLibraryLoan has no updatedAt to check a baseVersion against, so this is an event, like exam_moderation_submit. */
    returnLibraryBook: (entityId: string, payload: SchoolLibraryLoanReturnPayload) =>
      recordOfflineMutation({ ...base, entityType: SCHOOL_ENTITY_TYPES.LIBRARY_LOAN_RETURN, entityId, operation: "CREATE", baseVersion: 0, payload }),

    createTransportRoute: (entityId: string, payload: SchoolTransportRoutePayload) =>
      recordOfflineMutation({ ...base, entityType: SCHOOL_ENTITY_TYPES.TRANSPORT_ROUTE, entityId, operation: "CREATE", baseVersion: 0, payload }),

    /** entityId is a client-generated correlation id: assignSchoolTransport upserts on the (routeId, studentId) unique key server-side, the same idempotency guarantee guardian_link relies on. */
    assignTransport: (entityId: string, payload: SchoolTransportAssignmentPayload) =>
      recordOfflineMutation({ ...base, entityType: SCHOOL_ENTITY_TYPES.TRANSPORT_ASSIGNMENT, entityId, operation: "CREATE", baseVersion: 0, payload }),

    createPayrollAdjustment: (entityId: string, payload: SchoolPayrollAdjustmentPayload) =>
      recordOfflineMutation({ ...base, entityType: SCHOOL_ENTITY_TYPES.PAYROLL_ADJUSTMENT, entityId, operation: "CREATE", baseVersion: 0, payload }),

    /** entityId is the campus's own id (settings are per-campus, not a fixed sentinel), and baseVersion must be the cached settings row's version - 0 if this campus has never had settings configured before, mirroring pos.settings_receipt_footer/sale_prefix's "never configured" convention. */
    updateSettings: (campusId: string, payload: SchoolSettingsPayload, baseVersion: number) =>
      recordOfflineMutation({ ...base, entityType: SCHOOL_ENTITY_TYPES.SETTINGS, entityId: campusId, operation: "UPDATE", baseVersion, payload }),
  };
}

export type SchoolAdapter = ReturnType<typeof createSchoolAdapter>;
