import { useCallback, useEffect, useState } from "react";
import type { LocalDatabase } from "@/db/local-database";
import {
  SCHOOL_ENTITY_TYPES,
  type SchoolCampusRecord,
  type SchoolAcademicYearRecord,
  type SchoolTermRecord,
  type SchoolStudentRecord,
  type SchoolGuardianRecord,
  type SchoolGuardianLinkRecord,
  type SchoolClassRecord,
  type SchoolSubjectRecord,
  type SchoolEnrollmentRecord,
  type SchoolAttendanceRecord,
  type SchoolFeeInvoiceRecord,
  type SchoolFeeStructureRecord,
} from "@/modules/school/types";

export interface SchoolCampusRow { entityId: string; hasPendingLocalChange: boolean; data: SchoolCampusRecord }
export interface SchoolAcademicYearRow { entityId: string; hasPendingLocalChange: boolean; data: SchoolAcademicYearRecord }
export interface SchoolTermRow { entityId: string; hasPendingLocalChange: boolean; data: SchoolTermRecord }
export interface SchoolStudentRow { entityId: string; version: number; hasPendingLocalChange: boolean; data: SchoolStudentRecord }
export interface SchoolGuardianRow { entityId: string; hasPendingLocalChange: boolean; data: SchoolGuardianRecord }
export interface SchoolGuardianLinkRow { entityId: string; hasPendingLocalChange: boolean; data: SchoolGuardianLinkRecord }
export interface SchoolClassRow { entityId: string; hasPendingLocalChange: boolean; data: SchoolClassRecord }
export interface SchoolSubjectRow { entityId: string; hasPendingLocalChange: boolean; data: SchoolSubjectRecord }
export interface SchoolEnrollmentRow { entityId: string; hasPendingLocalChange: boolean; data: SchoolEnrollmentRecord }
export interface SchoolAttendanceRow { entityId: string; hasPendingLocalChange: boolean; data: SchoolAttendanceRecord }
export interface SchoolFeeInvoiceRow { entityId: string; hasPendingLocalChange: boolean; data: SchoolFeeInvoiceRecord }
export interface SchoolFeeStructureRow { entityId: string; version: number; hasPendingLocalChange: boolean; data: SchoolFeeStructureRecord }

export interface SchoolSnapshot {
  campuses: SchoolCampusRow[];
  academicYears: SchoolAcademicYearRow[];
  terms: SchoolTermRow[];
  students: SchoolStudentRow[];
  guardians: SchoolGuardianRow[];
  guardianLinks: SchoolGuardianLinkRow[];
  classes: SchoolClassRow[];
  subjects: SchoolSubjectRow[];
  enrollments: SchoolEnrollmentRow[];
  attendance: SchoolAttendanceRow[];
  feeInvoices: SchoolFeeInvoiceRow[];
  feeStructures: SchoolFeeStructureRow[];
}

const EMPTY_SNAPSHOT: SchoolSnapshot = {
  campuses: [], academicYears: [], terms: [], students: [], guardians: [],
  guardianLinks: [], classes: [], subjects: [], enrollments: [], attendance: [],
  feeInvoices: [], feeStructures: [],
};

/** Reads every School entity type this device has cached. Mirrors pos-data.ts's usePosSnapshot; will grow with each later School milestone. */
export function useSchoolSnapshot(db: LocalDatabase) {
  const [snapshot, setSnapshot] = useState<SchoolSnapshot>(EMPTY_SNAPSHOT);

  const reload = useCallback(async () => {
    const [campuses, academicYears, terms, students, guardians, guardianLinks, classes, subjects, enrollments, attendance, feeInvoices, feeStructures] = await Promise.all([
      db.listCachedRecords("school", SCHOOL_ENTITY_TYPES.CAMPUS),
      db.listCachedRecords("school", SCHOOL_ENTITY_TYPES.ACADEMIC_YEAR),
      db.listCachedRecords("school", SCHOOL_ENTITY_TYPES.TERM),
      db.listCachedRecords("school", SCHOOL_ENTITY_TYPES.STUDENT),
      db.listCachedRecords("school", SCHOOL_ENTITY_TYPES.GUARDIAN),
      db.listCachedRecords("school", SCHOOL_ENTITY_TYPES.GUARDIAN_LINK),
      db.listCachedRecords("school", SCHOOL_ENTITY_TYPES.CLASS),
      db.listCachedRecords("school", SCHOOL_ENTITY_TYPES.SUBJECT),
      db.listCachedRecords("school", SCHOOL_ENTITY_TYPES.ENROLLMENT),
      db.listCachedRecords("school", SCHOOL_ENTITY_TYPES.ATTENDANCE),
      db.listCachedRecords("school", SCHOOL_ENTITY_TYPES.FEE_INVOICE_RECORD),
      db.listCachedRecords("school", SCHOOL_ENTITY_TYPES.FEE_STRUCTURE),
    ]);

    setSnapshot({
      campuses: campuses
        .map((r) => ({ entityId: r.entityId, hasPendingLocalChange: r.hasPendingLocalChange, data: r.payload as SchoolCampusRecord }))
        .sort((a, b) => a.data.name.localeCompare(b.data.name)),
      academicYears: academicYears
        .map((r) => ({ entityId: r.entityId, hasPendingLocalChange: r.hasPendingLocalChange, data: r.payload as SchoolAcademicYearRecord }))
        .sort((a, b) => (a.data.startDate < b.data.startDate ? 1 : -1)),
      terms: terms
        .map((r) => ({ entityId: r.entityId, hasPendingLocalChange: r.hasPendingLocalChange, data: r.payload as SchoolTermRecord }))
        .sort((a, b) => (a.data.startDate < b.data.startDate ? 1 : -1)),
      students: students
        .map((r) => ({ entityId: r.entityId, version: r.version, hasPendingLocalChange: r.hasPendingLocalChange, data: r.payload as SchoolStudentRecord }))
        .sort((a, b) => a.data.lastName.localeCompare(b.data.lastName)),
      guardians: guardians
        .map((r) => ({ entityId: r.entityId, hasPendingLocalChange: r.hasPendingLocalChange, data: r.payload as SchoolGuardianRecord }))
        .sort((a, b) => a.data.lastName.localeCompare(b.data.lastName)),
      guardianLinks: guardianLinks.map((r) => ({ entityId: r.entityId, hasPendingLocalChange: r.hasPendingLocalChange, data: r.payload as SchoolGuardianLinkRecord })),
      classes: classes
        .map((r) => ({ entityId: r.entityId, hasPendingLocalChange: r.hasPendingLocalChange, data: r.payload as SchoolClassRecord }))
        .sort((a, b) => a.data.name.localeCompare(b.data.name)),
      subjects: subjects
        .map((r) => ({ entityId: r.entityId, hasPendingLocalChange: r.hasPendingLocalChange, data: r.payload as SchoolSubjectRecord }))
        .sort((a, b) => a.data.name.localeCompare(b.data.name)),
      enrollments: enrollments.map((r) => ({ entityId: r.entityId, hasPendingLocalChange: r.hasPendingLocalChange, data: r.payload as SchoolEnrollmentRecord })),
      attendance: attendance
        .map((r) => ({ entityId: r.entityId, hasPendingLocalChange: r.hasPendingLocalChange, data: r.payload as SchoolAttendanceRecord }))
        .sort((a, b) => (a.data.date < b.data.date ? 1 : -1)),
      feeInvoices: feeInvoices
        .map((r) => ({ entityId: r.entityId, hasPendingLocalChange: r.hasPendingLocalChange, data: r.payload as SchoolFeeInvoiceRecord }))
        .sort((a, b) => (a.data.issuedAt ?? "") < (b.data.issuedAt ?? "") ? 1 : -1),
      feeStructures: feeStructures
        .map((r) => ({ entityId: r.entityId, version: r.version, hasPendingLocalChange: r.hasPendingLocalChange, data: r.payload as SchoolFeeStructureRecord }))
        .sort((a, b) => a.data.name.localeCompare(b.data.name)),
    });
  }, [db]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { snapshot, reload };
}
