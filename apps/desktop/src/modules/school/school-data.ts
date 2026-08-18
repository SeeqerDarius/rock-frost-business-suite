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
  type SchoolExamRecord,
  type SchoolTimetableEntryRecord,
  type SchoolLibraryBookRecord,
  type SchoolLibraryLoanRecord,
  type SchoolTransportRouteRecord,
  type SchoolTransportAssignmentRecord,
  type SchoolPayrollAdjustmentRecord,
  type SchoolSettingsRecord,
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
export interface SchoolExamRow { entityId: string; hasPendingLocalChange: boolean; data: SchoolExamRecord }
export interface SchoolTimetableEntryRow { entityId: string; hasPendingLocalChange: boolean; data: SchoolTimetableEntryRecord }
export interface SchoolLibraryBookRow { entityId: string; hasPendingLocalChange: boolean; data: SchoolLibraryBookRecord }
export interface SchoolLibraryLoanRow { entityId: string; hasPendingLocalChange: boolean; data: SchoolLibraryLoanRecord }
export interface SchoolTransportRouteRow { entityId: string; hasPendingLocalChange: boolean; data: SchoolTransportRouteRecord }
export interface SchoolTransportAssignmentRow { entityId: string; hasPendingLocalChange: boolean; data: SchoolTransportAssignmentRecord }
export interface SchoolPayrollAdjustmentRow { entityId: string; hasPendingLocalChange: boolean; data: SchoolPayrollAdjustmentRecord }
/** entityId is the campus's own id - see school.adapters.ts server-side and SchoolSettingsPayload's docstring. */
export interface SchoolSettingsRow { entityId: string; version: number; hasPendingLocalChange: boolean; data: SchoolSettingsRecord }

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
  exams: SchoolExamRow[];
  timetableEntries: SchoolTimetableEntryRow[];
  libraryBooks: SchoolLibraryBookRow[];
  libraryLoans: SchoolLibraryLoanRow[];
  transportRoutes: SchoolTransportRouteRow[];
  transportAssignments: SchoolTransportAssignmentRow[];
  payrollAdjustments: SchoolPayrollAdjustmentRow[];
  settings: SchoolSettingsRow[];
}

const EMPTY_SNAPSHOT: SchoolSnapshot = {
  campuses: [], academicYears: [], terms: [], students: [], guardians: [],
  guardianLinks: [], classes: [], subjects: [], enrollments: [], attendance: [],
  feeInvoices: [], feeStructures: [], exams: [], timetableEntries: [], libraryBooks: [],
  libraryLoans: [], transportRoutes: [], transportAssignments: [], payrollAdjustments: [], settings: [],
};

/** Reads every School entity type this device has cached. Mirrors pos-data.ts's usePosSnapshot; will grow with each later School milestone. */
export function useSchoolSnapshot(db: LocalDatabase) {
  const [snapshot, setSnapshot] = useState<SchoolSnapshot>(EMPTY_SNAPSHOT);

  const reload = useCallback(async () => {
    const [
      campuses, academicYears, terms, students, guardians, guardianLinks, classes, subjects, enrollments, attendance,
      feeInvoices, feeStructures, exams, timetableEntries, libraryBooks, libraryLoans, transportRoutes, transportAssignments,
      payrollAdjustments, settings,
    ] = await Promise.all([
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
      db.listCachedRecords("school", SCHOOL_ENTITY_TYPES.EXAM),
      db.listCachedRecords("school", SCHOOL_ENTITY_TYPES.TIMETABLE_ENTRY),
      db.listCachedRecords("school", SCHOOL_ENTITY_TYPES.LIBRARY_BOOK),
      db.listCachedRecords("school", SCHOOL_ENTITY_TYPES.LIBRARY_LOAN),
      db.listCachedRecords("school", SCHOOL_ENTITY_TYPES.TRANSPORT_ROUTE),
      db.listCachedRecords("school", SCHOOL_ENTITY_TYPES.TRANSPORT_ASSIGNMENT),
      db.listCachedRecords("school", SCHOOL_ENTITY_TYPES.PAYROLL_ADJUSTMENT),
      db.listCachedRecords("school", SCHOOL_ENTITY_TYPES.SETTINGS),
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
      exams: exams
        .map((r) => ({ entityId: r.entityId, hasPendingLocalChange: r.hasPendingLocalChange, data: r.payload as SchoolExamRecord }))
        .sort((a, b) => (a.data.examDate ?? "") < (b.data.examDate ?? "") ? 1 : -1),
      timetableEntries: timetableEntries
        .map((r) => ({ entityId: r.entityId, hasPendingLocalChange: r.hasPendingLocalChange, data: r.payload as SchoolTimetableEntryRecord }))
        .sort((a, b) => a.data.dayOfWeek - b.data.dayOfWeek || a.data.startsAt.localeCompare(b.data.startsAt)),
      libraryBooks: libraryBooks
        .map((r) => ({ entityId: r.entityId, hasPendingLocalChange: r.hasPendingLocalChange, data: r.payload as SchoolLibraryBookRecord }))
        .sort((a, b) => a.data.title.localeCompare(b.data.title)),
      libraryLoans: libraryLoans
        .map((r) => ({ entityId: r.entityId, hasPendingLocalChange: r.hasPendingLocalChange, data: r.payload as SchoolLibraryLoanRecord }))
        .sort((a, b) => (a.data.borrowedAt < b.data.borrowedAt ? 1 : -1)),
      transportRoutes: transportRoutes
        .map((r) => ({ entityId: r.entityId, hasPendingLocalChange: r.hasPendingLocalChange, data: r.payload as SchoolTransportRouteRecord }))
        .sort((a, b) => a.data.name.localeCompare(b.data.name)),
      transportAssignments: transportAssignments.map((r) => ({ entityId: r.entityId, hasPendingLocalChange: r.hasPendingLocalChange, data: r.payload as SchoolTransportAssignmentRecord })),
      payrollAdjustments: payrollAdjustments
        .map((r) => ({ entityId: r.entityId, hasPendingLocalChange: r.hasPendingLocalChange, data: r.payload as SchoolPayrollAdjustmentRecord }))
        .sort((a, b) => (a.data.createdAt < b.data.createdAt ? 1 : -1)),
      settings: settings.map((r) => ({ entityId: r.entityId, version: r.version, hasPendingLocalChange: r.hasPendingLocalChange, data: r.payload as SchoolSettingsRecord })),
    });
  }, [db]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { snapshot, reload };
}
