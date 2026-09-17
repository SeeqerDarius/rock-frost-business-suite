import { describe, expect, it } from "vitest";
import { computeBroadsheetRows } from "@/modules/school/broadsheet-service";
import { resolveGradeFromScale } from "@/modules/school/service";

const GHANA_SCALE = [
  { grade: "A1", min: 75, max: 100, remark: "Excellent" },
  { grade: "B2", min: 70, max: 74, remark: "Very Good" },
  { grade: "C6", min: 50, max: 54, remark: "Credit" },
  { grade: "F9", min: 0, max: 39, remark: "Fail" },
];

describe("resolveGradeFromScale", () => {
  it("returns the matching band's grade and remark", () => {
    expect(resolveGradeFromScale(GHANA_SCALE, 80)).toEqual({ grade: "A1", remark: "Excellent" });
    expect(resolveGradeFromScale(GHANA_SCALE, 52)).toEqual({ grade: "C6", remark: "Credit" });
    expect(resolveGradeFromScale(GHANA_SCALE, 10)).toEqual({ grade: "F9", remark: "Fail" });
  });

  it("returns null when nothing matches or no scale is configured", () => {
    expect(resolveGradeFromScale(GHANA_SCALE, 60)).toBeNull();
    expect(resolveGradeFromScale(null, 80)).toBeNull();
    expect(resolveGradeFromScale(undefined, 80)).toBeNull();
  });
});

const SUBJECTS = [
  { id: "math", code: "MATH", name: "Mathematics" },
  { id: "eng", code: "ENG", name: "English" },
  { id: "sci", code: "SCI", name: "Science" },
];

const STUDENTS = [
  { studentId: "s1", admissionNumber: "A001", firstName: "Ama", lastName: "Boateng" },
  { studentId: "s2", admissionNumber: "A002", firstName: "Kwame", lastName: "Mensah" },
  { studentId: "s3", admissionNumber: "A003", firstName: "Efua", lastName: "Owusu" },
];

describe("computeBroadsheetRows", () => {
  it("ranks the best-performing student first, breaking ties by total then name", () => {
    const results = [
      { studentId: "s1", subjectId: "math", percent: 80 },
      { studentId: "s1", subjectId: "eng", percent: 90 },
      { studentId: "s2", subjectId: "math", percent: 85 },
      { studentId: "s2", subjectId: "eng", percent: 85 },
      { studentId: "s3", subjectId: "math", percent: 40 },
      { studentId: "s3", subjectId: "eng", percent: 40 },
    ];
    const rows = computeBroadsheetRows(STUDENTS, SUBJECTS, results, null, true);
    // s1 average = 85, s2 average = 85 (tie), s3 average = 40.
    // Tie broken by total: both totals are 170 too, so alphabetical by last name wins (Boateng before Mensah).
    expect(rows.map((row) => row.studentId)).toEqual(["s1", "s2", "s3"]);
    expect(rows[0].position).toBe(1);
    expect(rows[1].position).toBe(1); // tied for first
    expect(rows[2].position).toBe(3); // next distinct position skips the tied slot
  });

  it("excludes a subject the student wasn't examined in from their average, instead of scoring it zero", () => {
    const results = [
      { studentId: "s1", subjectId: "math", percent: 60 },
      { studentId: "s1", subjectId: "eng", percent: 80 },
      // s1 has no Science result - a real absence from that exam, not a zero.
    ];
    const rows = computeBroadsheetRows([STUDENTS[0]], SUBJECTS, results, null, true);
    expect(rows[0].subjectsExamined).toBe(2);
    expect(rows[0].average).toBe(70);
    expect(rows[0].cells.find((cell) => cell.subjectId === "sci")?.percent).toBeNull();
  });

  it("sorts alphabetically and omits positions entirely when ranking is disabled", () => {
    const results = [
      { studentId: "s2", subjectId: "math", percent: 95 },
      { studentId: "s1", subjectId: "math", percent: 50 },
    ];
    const rows = computeBroadsheetRows(STUDENTS, SUBJECTS, results, null, false);
    expect(rows.every((row) => row.position === null)).toBe(true);
    expect(rows.map((row) => row.studentId)).toEqual(["s1", "s2", "s3"]); // alphabetical by last name
  });

  it("attaches grade and remark per cell from the campus grading scale", () => {
    const results = [{ studentId: "s1", subjectId: "math", percent: 80 }];
    const rows = computeBroadsheetRows([STUDENTS[0]], SUBJECTS, results, GHANA_SCALE, true);
    const cell = rows[0].cells.find((c) => c.subjectId === "math");
    expect(cell).toMatchObject({ grade: "A1", remark: "Excellent" });
  });

  it("leaves students with zero results at the bottom with a null average", () => {
    const rows = computeBroadsheetRows(STUDENTS, SUBJECTS, [], null, true);
    expect(rows.every((row) => row.average === null && row.position === null)).toBe(true);
  });
});
