import type { LocalDatabase } from "@/db/local-database";
import { recordOfflineMutation } from "@/modules/offline-mutation-recorder";
import {
  SCHOOL_ENTITY_TYPES,
  type SchoolCampusPayload,
  type SchoolAcademicYearPayload,
  type SchoolTermPayload,
} from "@/modules/school/types";

export interface SchoolAdapterContext { db: LocalDatabase; organizationId: string; actingUserName: string | null }

/**
 * Milestone 6: the School foundational slice. Campus, academic year, and
 * term are all CREATE-only, matching the web app - there is no edit
 * action for any of them in src/app/app/school/actions.ts today.
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
  };
}

export type SchoolAdapter = ReturnType<typeof createSchoolAdapter>;
