import "server-only";

import { db } from "@/lib/db";
import type { OfflineDeviceContext } from "@/lib/offline-sync/auth";
import { OFFLINE_SYNC_LIMITS } from "@/lib/offline-sync/contract";
import { versionOf, type OfflineSnapshotBuilderResult, type OfflineSnapshotRow } from "@/lib/offline-sync/snapshot-builders/types";

/**
 * Milestone 6 foundational slice: campuses, academic years, and terms only
 * - the reference data later School milestones (students, enrollment,
 * fees, exams) will scope their own rows against. Unlike Fleet/Installment
 * /POS, School has no per-user ownership narrowing at this layer yet: any
 * device authorized for the school module sees every campus in the
 * organization, matching how the web app's own academic-setup screens
 * work today (gated by school.campuses.manage / school.academics.manage
 * to *write*, not to *read*).
 */
export async function buildSchoolSnapshot(context: OfflineDeviceContext): Promise<OfflineSnapshotBuilderResult> {
  const organizationId = context.device.organizationId;
  const take = OFFLINE_SYNC_LIMITS.snapshotRowsPerCollection;

  const [campuses, academicYears, terms] = await Promise.all([
    db.schoolCampus.findMany({
      where: { organizationId, active: true },
      select: { id: true, code: true, name: true, address: true, phone: true, email: true, active: true, updatedAt: true },
      orderBy: { name: "asc" },
      take: take + 1,
    }),
    db.schoolAcademicYear.findMany({
      where: { organizationId },
      select: { id: true, name: true, startDate: true, endDate: true, current: true, closedAt: true },
      orderBy: { startDate: "desc" },
      take: take + 1,
    }),
    db.schoolTerm.findMany({
      where: { organizationId },
      select: { id: true, academicYearId: true, name: true, startDate: true, endDate: true, current: true, closedAt: true },
      orderBy: { startDate: "desc" },
      take: take + 1,
    }),
  ]);

  const truncated = campuses.length > take || academicYears.length > take || terms.length > take;
  const rows: OfflineSnapshotRow[] = [];

  for (const { id, updatedAt, ...payload } of campuses.slice(0, take)) {
    rows.push({ entityType: "school.campus", entityId: id, version: versionOf(updatedAt), payload });
  }
  for (const { id, ...payload } of academicYears.slice(0, take)) {
    // SchoolAcademicYear has no updatedAt column: version 0, same convention as any other undated reference model.
    rows.push({ entityType: "school.academic_year", entityId: id, version: 0, payload });
  }
  for (const { id, ...payload } of terms.slice(0, take)) {
    // SchoolTerm has no updatedAt column either: version 0.
    rows.push({ entityType: "school.term", entityId: id, version: 0, payload });
  }

  return { rows, truncated };
}
