export interface SchoolCampusPayload extends Record<string, unknown> {
  code: string;
  name: string;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
}

export interface SchoolAcademicYearPayload extends Record<string, unknown> {
  name: string;
  startDate: string;
  endDate: string;
  current?: boolean;
}

export interface SchoolTermPayload extends Record<string, unknown> {
  academicYearId: string;
  name: string;
  startDate: string;
  endDate: string;
  current?: boolean;
}

/** Shape of a pulled `school.campus` row's payload (see buildSchoolSnapshot server-side). */
export interface SchoolCampusRecord extends Record<string, unknown> {
  code: string;
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  active: boolean;
}

/** Shape of a pulled `school.academic_year` row's payload. */
export interface SchoolAcademicYearRecord extends Record<string, unknown> {
  name: string;
  startDate: string;
  endDate: string;
  current: boolean;
  closedAt: string | null;
}

/** Shape of a pulled `school.term` row's payload. */
export interface SchoolTermRecord extends Record<string, unknown> {
  academicYearId: string;
  name: string;
  startDate: string;
  endDate: string;
  current: boolean;
  closedAt: string | null;
}

export const SCHOOL_ENTITY_TYPES = {
  CAMPUS: "school.campus",
  ACADEMIC_YEAR: "school.academic_year",
  TERM: "school.term",
} as const;
