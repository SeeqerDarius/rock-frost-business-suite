import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as school from "@/modules/school/service";
import { cleanupTestOrg, createTestOrg, type TestOrg } from "../setup/fixtures";
import { testDb } from "../setup/db";

let orgA: TestOrg;
let orgB: TestOrg;
let campusA: Awaited<ReturnType<typeof school.createSchoolCampus>>;
let campusB: Awaited<ReturnType<typeof school.createSchoolCampus>>;
let studentB: Awaited<ReturnType<typeof school.createSchoolStudent>>;

beforeAll(async () => {
  orgA = await createTestOrg("orgA-school");
  orgB = await createTestOrg("orgB-school");
  campusA = await school.createSchoolCampus(orgA.organizationId, { code: "A", name: "A Campus" });
  campusB = await school.createSchoolCampus(orgB.organizationId, { code: "B", name: "B Campus" });
  studentB = await school.createSchoolStudent(orgB.organizationId, { campusId: campusB.id, firstName: "Student", lastName: "B" });
});

afterAll(async () => {
  await cleanupTestOrg(orgA);
  await cleanupTestOrg(orgB);
});

describe("School service — real tenant isolation and customer-readiness guards", () => {
  it("rejects creating a student under another tenant campus", async () => {
    await expect(school.createSchoolStudent(orgA.organizationId, { campusId: campusB.id, firstName: "Bad", lastName: "Reference" })).rejects.toThrow(school.SchoolNotFoundError);
  });

  it("rejects linking a foreign guardian or student", async () => {
    const guardian = await school.createSchoolGuardian(orgA.organizationId, { firstName: "Guardian", lastName: "A", phone: "123" });
    await expect(school.linkSchoolGuardian(orgA.organizationId, studentB.id, guardian.id, "Parent")).rejects.toThrow(school.SchoolNotFoundError);
  });

  it("prevents fee overpayment", async () => {
    const student = await school.createSchoolStudent(orgA.organizationId, { campusId: campusA.id, firstName: "Student", lastName: "A" });
    const year = await school.createSchoolAcademicYear(orgA.organizationId, { name: "2030", startDate: new Date("2030-01-01"), endDate: new Date("2030-12-31") });
    const invoice = await school.createSchoolFeeInvoice(orgA.organizationId, { academicYearId: year.id, studentId: student.id, description: "Tuition", amount: "100" });
    await expect(school.recordSchoolFeePayment(orgA.organizationId, invoice.id, { amount: "101", method: "CASH" })).rejects.toThrow(school.SchoolStateError);
  });

  it("lists only its own campuses", async () => {
    const list = await school.listSchoolCampuses(orgA.organizationId);
    expect(list.map((campus) => campus.id)).toContain(campusA.id);
    expect(list.map((campus) => campus.id)).not.toContain(campusB.id);
  });

  it("records valid student lifecycle transitions and closes terminal enrollments", async () => {
    const year = await school.createSchoolAcademicYear(orgA.organizationId, { name: "2031", startDate: new Date("2031-01-01"), endDate: new Date("2031-12-31") });
    const schoolClass = await school.createSchoolClass(orgA.organizationId, { campusId: campusA.id, code: "P1", name: "Primary 1" });
    const student = await school.createSchoolStudent(orgA.organizationId, { campusId: campusA.id, firstName: "Lifecycle", lastName: "Student" });
    await school.enrollSchoolStudent(orgA.organizationId, { campusId: campusA.id, academicYearId: year.id, studentId: student.id, classId: schoolClass.id });

    await school.transitionSchoolStudent(orgA.organizationId, student.id, "SUSPENDED", "Disciplinary review");
    await school.transitionSchoolStudent(orgA.organizationId, student.id, "ACTIVE", "Cleared to return");
    await school.transitionSchoolStudent(orgA.organizationId, student.id, "GRADUATED", "Programme completed");

    const [updated, enrollment, history] = await Promise.all([
      testDb.schoolStudent.findUniqueOrThrow({ where: { id: student.id } }),
      testDb.schoolEnrollment.findFirstOrThrow({ where: { studentId: student.id, academicYearId: year.id } }),
      testDb.schoolStudentLifecycleEvent.findMany({ where: { studentId: student.id }, orderBy: { createdAt: "asc" } }),
    ]);
    expect(updated.status).toBe("GRADUATED");
    expect(enrollment.status).toBe("COMPLETED");
    expect(history.map((event) => [event.fromStatus, event.toStatus])).toEqual([
      ["ACTIVE", "SUSPENDED"],
      ["SUSPENDED", "ACTIVE"],
      ["ACTIVE", "GRADUATED"],
    ]);
    await expect(school.transitionSchoolStudent(orgA.organizationId, student.id, "ACTIVE")).rejects.toThrow(school.SchoolStateError);
  });

  it("creates fee structures once per eligible student and uses the campus receipt prefix", async () => {
    const year = await school.createSchoolAcademicYear(orgA.organizationId, { name: "2032", startDate: new Date("2032-01-01"), endDate: new Date("2032-12-31") });
    const schoolClass = await school.createSchoolClass(orgA.organizationId, { campusId: campusA.id, code: "P2", name: "Primary 2" });
    const student = await school.createSchoolStudent(orgA.organizationId, { campusId: campusA.id, firstName: "Fee", lastName: "Student" });
    await school.enrollSchoolStudent(orgA.organizationId, { campusId: campusA.id, academicYearId: year.id, studentId: student.id, classId: schoolClass.id });
    await school.upsertSchoolSettings(orgA.organizationId, { campusId: campusA.id, attendanceCloseDays: 7, receiptPrefix: "RFS", allowRanking: false });
    const structure = await school.createSchoolFeeStructure(orgA.organizationId, { campusId: campusA.id, academicYearId: year.id, classId: schoolClass.id, name: "Tuition", amount: "250" });

    expect(await school.issueSchoolFeeStructure(orgA.organizationId, structure.id)).toEqual({ eligible: 1, issued: 1, skipped: 0 });
    expect(await school.issueSchoolFeeStructure(orgA.organizationId, structure.id)).toEqual({ eligible: 1, issued: 0, skipped: 1 });
    const invoice = await testDb.schoolFeeInvoice.findFirstOrThrow({ where: { feeStructureId: structure.id, studentId: student.id } });
    const payment = await school.recordSchoolFeePayment(orgA.organizationId, invoice.id, { amount: "100", method: "CASH" });
    expect(payment.receiptNumber).toMatch(/^RFS-\d{5}$/);
  });

  it("enforces the configured attendance correction window", async () => {
    const now = new Date();
    const year = await school.createSchoolAcademicYear(orgA.organizationId, { name: `Attendance ${now.getFullYear()}`, startDate: new Date(now.getFullYear(), 0, 1), endDate: new Date(now.getFullYear(), 11, 31) });
    const term = await school.createSchoolTerm(orgA.organizationId, { academicYearId: year.id, name: "Current", startDate: new Date(now.getFullYear(), 0, 1), endDate: new Date(now.getFullYear(), 11, 31) });
    const schoolClass = await school.createSchoolClass(orgA.organizationId, { campusId: campusA.id, code: "ATT", name: "Attendance Class" });
    const student = await school.createSchoolStudent(orgA.organizationId, { campusId: campusA.id, firstName: "Attendance", lastName: "Student" });
    await school.enrollSchoolStudent(orgA.organizationId, { campusId: campusA.id, academicYearId: year.id, studentId: student.id, classId: schoolClass.id });
    await school.upsertSchoolSettings(orgA.organizationId, { campusId: campusA.id, attendanceCloseDays: 1, receiptPrefix: "SCH", allowRanking: false });
    const oldDate = new Date(now);
    oldDate.setDate(oldDate.getDate() - 3);
    oldDate.setHours(0, 0, 0, 0);
    await expect(school.recordSchoolAttendance(orgA.organizationId, orgA.userId, { termId: term.id, classId: schoolClass.id, studentId: student.id, date: oldDate, status: "PRESENT" })).rejects.toThrow("correction window has closed");
  });
});
