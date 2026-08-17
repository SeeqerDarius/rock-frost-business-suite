import "server-only";

import { z } from "zod";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { createSchoolCampus, createSchoolAcademicYear, createSchoolTerm } from "@/modules/school/service";
import { defineOfflineAdapter } from "@/lib/offline-sync/registry";

const shortText = z.string().trim().min(1).max(200);
const cuid = z.string().trim().min(1).max(50);
const dateInput = z.coerce.date();

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
];
