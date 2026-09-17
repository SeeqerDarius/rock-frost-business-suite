import "server-only";

import { db } from "@/lib/db";
import { resolveGradeFromScale } from "./service";
import type { Prisma } from "@prisma/client";

/**
 * The Ghana-style exam broadsheet: subjects run across the columns, every
 * enrolled student is a row, and the class is ranked by average
 * performance across every subject examined that term - the format used
 * on a GES terminal report / master sheet. `allowRanking`
 * (`SchoolSettings`, Settings > Grading scale) gates whether Position is
 * computed at all; when it's off, rows stay in alphabetical order and no
 * student sees where they placed against classmates.
 */

export interface BroadsheetSubjectCell {
  subjectId: string;
  percent: number | null;
  grade: string | null;
  remark: string | null;
}

export interface BroadsheetRow {
  studentId: string;
  admissionNumber: string;
  firstName: string;
  lastName: string;
  cells: BroadsheetSubjectCell[];
  subjectsExamined: number;
  total: number;
  average: number | null;
  position: number | null;
}

export interface BroadsheetSubjectColumn {
  id: string;
  code: string;
  name: string;
}

export interface Broadsheet {
  classId: string;
  className: string;
  termId: string;
  termName: string;
  academicYearName: string;
  allowRanking: boolean;
  subjects: BroadsheetSubjectColumn[];
  rows: BroadsheetRow[];
}

interface StudentInput {
  studentId: string;
  admissionNumber: string;
  firstName: string;
  lastName: string;
}

interface SubjectResultInput {
  studentId: string;
  subjectId: string;
  /** Weighted percent (0-100) already combining every exam recorded for
   * this subject in the term, per that exam's `weight`. */
  percent: number;
}

/**
 * Pure aggregation core, kept free of Prisma so ranking/tie-break behavior
 * is directly unit-testable: sorts students by average percent across the
 * subjects they were actually examined in (a student missing one exam
 * isn't penalized by an artificial zero), descending, ties broken by total
 * percent, then by last name/first name for a fully deterministic order.
 */
export function computeBroadsheetRows(
  students: StudentInput[],
  subjects: BroadsheetSubjectColumn[],
  results: SubjectResultInput[],
  gradingScale: Prisma.JsonValue | null | undefined,
  allowRanking: boolean,
): BroadsheetRow[] {
  const percentByStudentSubject = new Map<string, Map<string, number>>();
  for (const result of results) {
    if (!percentByStudentSubject.has(result.studentId)) percentByStudentSubject.set(result.studentId, new Map());
    percentByStudentSubject.get(result.studentId)!.set(result.subjectId, result.percent);
  }

  const rows: BroadsheetRow[] = students.map((student) => {
    const subjectPercents = percentByStudentSubject.get(student.studentId) ?? new Map<string, number>();
    const cells: BroadsheetSubjectCell[] = subjects.map((subject) => {
      const percent = subjectPercents.get(subject.id) ?? null;
      if (percent === null) return { subjectId: subject.id, percent: null, grade: null, remark: null };
      const band = resolveGradeFromScale(gradingScale, percent);
      return { subjectId: subject.id, percent, grade: band?.grade ?? null, remark: band?.remark ?? null };
    });
    const examined = cells.filter((cell) => cell.percent !== null);
    const total = examined.reduce((sum, cell) => sum + (cell.percent ?? 0), 0);
    const average = examined.length > 0 ? total / examined.length : null;
    return { studentId: student.studentId, admissionNumber: student.admissionNumber, firstName: student.firstName, lastName: student.lastName, cells, subjectsExamined: examined.length, total, average, position: null };
  });

  const nameSort = (a: BroadsheetRow, b: BroadsheetRow) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName);

  if (!allowRanking) return rows.sort(nameSort);

  const ranked = [...rows].sort((a, b) => {
    if (a.average === null && b.average === null) return nameSort(a, b);
    if (a.average === null) return 1;
    if (b.average === null) return -1;
    return b.average - a.average || b.total - a.total || nameSort(a, b);
  });

  let position = 0;
  let previous: { average: number; total: number } | null = null;
  return ranked.map((row, index) => {
    if (row.average === null) return row;
    if (!previous || previous.average !== row.average || previous.total !== row.total) position = index + 1;
    previous = { average: row.average, total: row.total };
    return { ...row, position };
  });
}

export async function getSchoolBroadsheet(organizationId: string, classId: string, termId: string): Promise<Broadsheet> {
  const [schoolClass, term, enrollments, examResults] = await Promise.all([
    db.schoolClass.findFirst({ where: { id: classId, organizationId }, include: { campus: { include: { settings: true } } } }),
    db.schoolTerm.findFirst({ where: { id: termId, organizationId }, include: { academicYear: true } }),
    db.schoolEnrollment.findMany({ where: { organizationId, classId, status: "ACTIVE" }, include: { student: true } }),
    db.schoolExamResult.findMany({
      where: { organizationId, classId, exam: { termId, status: "PUBLISHED" } },
      include: { subject: true, exam: true },
    }),
  ]);
  if (!schoolClass || !term) throw new Error("Class or term not found.");

  const students: StudentInput[] = enrollments.map((enrollment) => ({
    studentId: enrollment.student.id,
    admissionNumber: enrollment.student.admissionNumber,
    firstName: enrollment.student.firstName,
    lastName: enrollment.student.lastName,
  }));

  const subjectsById = new Map<string, BroadsheetSubjectColumn>();
  for (const result of examResults) subjectsById.set(result.subjectId, { id: result.subjectId, code: result.subject.code, name: result.subject.name });
  const subjects = [...subjectsById.values()].sort((a, b) => a.name.localeCompare(b.name));

  // A subject can carry more than one published exam in the same term
  // (e.g. mid-term + end-of-term) - each exam's own `weight` combines them
  // into one weighted percent per student per subject, exactly like a
  // school's own continuous-assessment + exam split.
  const weightedByStudentSubject = new Map<string, { weightedSum: number; weightTotal: number }>();
  for (const result of examResults) {
    const key = `${result.studentId}:${result.subjectId}`;
    const percent = (Number(result.marks) / Number(result.exam.totalMarks)) * 100;
    const weight = Number(result.exam.weight);
    const existing = weightedByStudentSubject.get(key) ?? { weightedSum: 0, weightTotal: 0 };
    existing.weightedSum += percent * weight;
    existing.weightTotal += weight;
    weightedByStudentSubject.set(key, existing);
  }
  const results: SubjectResultInput[] = [...weightedByStudentSubject.entries()].map(([key, { weightedSum, weightTotal }]) => {
    const [studentId, subjectId] = key.split(":");
    return { studentId, subjectId, percent: weightTotal > 0 ? weightedSum / weightTotal : 0 };
  });

  const allowRanking = schoolClass.campus.settings?.allowRanking ?? false;
  const rows = computeBroadsheetRows(students, subjects, results, schoolClass.campus.settings?.gradingScale, allowRanking);

  return {
    classId: schoolClass.id,
    className: schoolClass.name,
    termId: term.id,
    termName: term.name,
    academicYearName: term.academicYear.name,
    allowRanking,
    subjects,
    rows,
  };
}
