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
  };
}

export type SchoolAdapter = ReturnType<typeof createSchoolAdapter>;
