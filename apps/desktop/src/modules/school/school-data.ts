import { useCallback, useEffect, useState } from "react";
import type { LocalDatabase } from "@/db/local-database";
import {
  SCHOOL_ENTITY_TYPES,
  type SchoolCampusRecord,
  type SchoolAcademicYearRecord,
  type SchoolTermRecord,
} from "@/modules/school/types";

export interface SchoolCampusRow { entityId: string; hasPendingLocalChange: boolean; data: SchoolCampusRecord }
export interface SchoolAcademicYearRow { entityId: string; hasPendingLocalChange: boolean; data: SchoolAcademicYearRecord }
export interface SchoolTermRow { entityId: string; hasPendingLocalChange: boolean; data: SchoolTermRecord }

export interface SchoolSnapshot {
  campuses: SchoolCampusRow[];
  academicYears: SchoolAcademicYearRow[];
  terms: SchoolTermRow[];
}

const EMPTY_SNAPSHOT: SchoolSnapshot = { campuses: [], academicYears: [], terms: [] };

/** Reads every School entity type this device has cached. Mirrors pos-data.ts's usePosSnapshot; will grow with each later School milestone. */
export function useSchoolSnapshot(db: LocalDatabase) {
  const [snapshot, setSnapshot] = useState<SchoolSnapshot>(EMPTY_SNAPSHOT);

  const reload = useCallback(async () => {
    const [campuses, academicYears, terms] = await Promise.all([
      db.listCachedRecords("school", SCHOOL_ENTITY_TYPES.CAMPUS),
      db.listCachedRecords("school", SCHOOL_ENTITY_TYPES.ACADEMIC_YEAR),
      db.listCachedRecords("school", SCHOOL_ENTITY_TYPES.TERM),
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
    });
  }, [db]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { snapshot, reload };
}
