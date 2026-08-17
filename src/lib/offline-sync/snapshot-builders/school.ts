import "server-only";

import { db } from "@/lib/db";
import type { OfflineDeviceContext } from "@/lib/offline-sync/auth";
import { OFFLINE_SYNC_LIMITS } from "@/lib/offline-sync/contract";
import { versionOf, type OfflineSnapshotBuilderResult, type OfflineSnapshotRow } from "@/lib/offline-sync/snapshot-builders/types";

// Attendance volume grows far faster than any other School collection (one
// row per student per class day), so it gets its own, narrower bound -
// same reasoning as POS's RECENT_SALES_TAKE - rather than the general
// snapshotRowsPerCollection cap every other School collection uses.
const RECENT_ATTENDANCE_TAKE = 500;

/**
 * Milestone 6 shipped campuses, academic years, and terms. Milestone 7
 * adds students, guardians, guardian links, classes, subjects,
 * enrollment, and recent attendance. Unlike Fleet/Installment/POS, School
 * has no per-user ownership narrowing at this layer yet: any device
 * authorized for the school module sees every row in the organization,
 * matching how the web app's own screens work today (gated by
 * school.*.manage to *write*, not to *read*).
 */
export async function buildSchoolSnapshot(context: OfflineDeviceContext): Promise<OfflineSnapshotBuilderResult> {
  const organizationId = context.device.organizationId;
  const take = OFFLINE_SYNC_LIMITS.snapshotRowsPerCollection;

  const [
    campuses,
    academicYears,
    terms,
    students,
    guardians,
    guardianLinks,
    classes,
    subjects,
    enrollments,
    attendance,
  ] = await Promise.all([
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
    db.schoolStudent.findMany({
      where: { organizationId },
      select: { id: true, campusId: true, admissionNumber: true, firstName: true, lastName: true, dateOfBirth: true, gender: true, status: true, admissionDate: true, medicalNotes: true, updatedAt: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      take: take + 1,
    }),
    db.schoolGuardian.findMany({
      where: { organizationId },
      select: { id: true, guardianNumber: true, firstName: true, lastName: true, email: true, phone: true, address: true, occupation: true, updatedAt: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      take: take + 1,
    }),
    db.schoolStudentGuardian.findMany({
      where: { organizationId },
      select: { id: true, studentId: true, guardianId: true, relationship: true, primary: true, authorizedPickup: true },
      take: take + 1,
    }),
    db.schoolClass.findMany({
      where: { organizationId, active: true },
      select: { id: true, campusId: true, code: true, name: true, gradeLevel: true, capacity: true },
      orderBy: { name: "asc" },
      take: take + 1,
    }),
    db.schoolSubject.findMany({
      where: { organizationId, active: true },
      select: { id: true, code: true, name: true, description: true },
      orderBy: { name: "asc" },
      take: take + 1,
    }),
    db.schoolEnrollment.findMany({
      where: { organizationId, status: "ACTIVE" },
      select: { id: true, campusId: true, academicYearId: true, studentId: true, classId: true, status: true, enrolledAt: true, endedAt: true },
      take: take + 1,
    }),
    db.schoolAttendance.findMany({
      where: { organizationId },
      select: { id: true, termId: true, classId: true, studentId: true, date: true, status: true, reason: true, updatedAt: true },
      orderBy: { date: "desc" },
      take: RECENT_ATTENDANCE_TAKE + 1,
    }),
  ]);

  const truncated =
    campuses.length > take ||
    academicYears.length > take ||
    terms.length > take ||
    students.length > take ||
    guardians.length > take ||
    guardianLinks.length > take ||
    classes.length > take ||
    subjects.length > take ||
    enrollments.length > take ||
    attendance.length > RECENT_ATTENDANCE_TAKE;
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
  for (const { id, updatedAt, ...payload } of students.slice(0, take)) {
    rows.push({ entityType: "school.student", entityId: id, version: versionOf(updatedAt), payload });
  }
  for (const { id, updatedAt, ...payload } of guardians.slice(0, take)) {
    rows.push({ entityType: "school.guardian", entityId: id, version: versionOf(updatedAt), payload });
  }
  for (const { id, ...payload } of guardianLinks.slice(0, take)) {
    // SchoolStudentGuardian has no updatedAt column: version 0.
    rows.push({ entityType: "school.guardian_link", entityId: id, version: 0, payload });
  }
  for (const { id, ...payload } of classes.slice(0, take)) {
    // SchoolClass has no updatedAt column: version 0.
    rows.push({ entityType: "school.class", entityId: id, version: 0, payload });
  }
  for (const { id, ...payload } of subjects.slice(0, take)) {
    // SchoolSubject has no updatedAt column: version 0.
    rows.push({ entityType: "school.subject", entityId: id, version: 0, payload });
  }
  for (const { id, ...payload } of enrollments.slice(0, take)) {
    // SchoolEnrollment has no updatedAt column: version 0.
    rows.push({ entityType: "school.enrollment", entityId: id, version: 0, payload });
  }
  for (const { id, updatedAt, ...payload } of attendance.slice(0, RECENT_ATTENDANCE_TAKE)) {
    rows.push({ entityType: "school.attendance", entityId: id, version: versionOf(updatedAt), payload });
  }

  return { rows, truncated };
}
