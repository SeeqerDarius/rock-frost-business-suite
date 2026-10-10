import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import * as school from "@/modules/school/service";
import * as assignments from "@/modules/school/assignments-service";
import { cleanupTestOrg, createTestOrg, type TestOrg } from "../setup/fixtures";
import { testDb } from "../setup/db";

/**
 * Real-Postgres proof for School Assignments & Assessments: add-on
 * entitlement, tenant isolation, teacher class scope, student scoping,
 * idempotent and concurrency-safe submission, immutable published versions,
 * and the cumulative-record opt-in writing through the existing exam
 * results instead of a second gradebook.
 */

const extraUserIds: string[] = [];
let orgA: TestOrg;
let orgB: TestOrg;
let ungranted: TestOrg;

async function addUser(org: TestOrg, roleName: string, label: string) {
  const runId = `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const user = await testDb.user.create({ data: { name: `Integration ${runId}`, email: `itest-${runId}@example.invalid`, passwordHash: await bcrypt.hash("not-a-real-password", 4), status: "ACTIVE" } });
  const role = await testDb.role.findFirst({ where: { organizationId: null, name: roleName } });
  if (!role) throw new Error(`${roleName} role missing`);
  await testDb.organizationMember.create({ data: { organizationId: org.organizationId, userId: user.id, roleId: role.id, status: "ACTIVE", joinedAt: new Date() } });
  extraUserIds.push(user.id);
  return user;
}

async function setupSchool(org: TestOrg, token: string) {
  const campus = await school.createSchoolCampus(org.organizationId, { code: `${token}C`, name: `${token} Campus` });
  const year = await school.createSchoolAcademicYear(org.organizationId, { name: `${token} year`, startDate: new Date("2026-01-01"), endDate: new Date("2026-12-31") });
  const term = await school.createSchoolTerm(org.organizationId, { academicYearId: year.id, name: `${token} term`, startDate: new Date("2026-09-01"), endDate: new Date("2026-12-15") });
  const [classOne, classTwo] = await Promise.all([
    school.createSchoolClass(org.organizationId, { campusId: campus.id, code: `${token}1`, name: `${token} Class 1` }),
    school.createSchoolClass(org.organizationId, { campusId: campus.id, code: `${token}2`, name: `${token} Class 2` }),
  ]);
  const subject = await school.createSchoolSubject(org.organizationId, { code: `${token}MAT`, name: `${token} Mathematics` });
  return { campus, year, term, classOne, classTwo, subject };
}

async function addStudent(org: TestOrg, setup: Awaited<ReturnType<typeof setupSchool>>, classId: string, label: string) {
  const student = await school.createSchoolStudent(org.organizationId, { campusId: setup.campus.id, firstName: label, lastName: "Learner" });
  await testDb.schoolStudent.update({ where: { id: student.id }, data: { status: "ACTIVE" } });
  await school.enrollSchoolStudent(org.organizationId, { campusId: setup.campus.id, academicYearId: setup.year.id, studentId: student.id, classId });
  const user = await addUser(org, "Student", `student-${label}`);
  await testDb.schoolStudent.update({ where: { id: student.id }, data: { userId: user.id } });
  return { student, user };
}

const settings = (setup: Awaited<ReturnType<typeof setupSchool>>, classId: string, overrides: Partial<assignments.AssignmentSettingsInput> = {}): assignments.AssignmentSettingsInput => ({
  classId,
  subjectId: setup.subject.id,
  termId: setup.term.id,
  title: "Fractions practice",
  instructions: null,
  availableFrom: new Date(Date.now() - 60 * 60 * 1000),
  dueAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  allowLateSubmissions: false,
  maxAttempts: 1,
  attemptScoring: "HIGHEST",
  feedbackRelease: "ON_RELEASE",
  showCorrectAnswers: true,
  ...overrides,
});

const singleChoice: assignments.QuestionInput = { type: "SINGLE_CHOICE", prompt: "1/2 + 1/4 =", points: "2", options: [{ id: "a", label: "3/4" }, { id: "b", label: "2/6" }], correctOptionIds: ["a"], numericAnswer: null, numericTolerance: null, markingGuide: null };
const numeric: assignments.QuestionInput = { type: "NUMERIC", prompt: "0.5 x 3 =", points: "3", options: [], correctOptionIds: [], numericAnswer: "1.5", numericTolerance: "0", markingGuide: null };
const essay: assignments.QuestionInput = { type: "ESSAY", prompt: "Explain equivalent fractions.", points: "5", options: [], correctOptionIds: [], numericAnswer: null, numericTolerance: null, markingGuide: "Mentions multiplying top and bottom" };

async function publishedAssignment(org: TestOrg, setup: Awaited<ReturnType<typeof setupSchool>>, classId: string, questions = [singleChoice, numeric], overrides: Partial<assignments.AssignmentSettingsInput> = {}) {
  const assignment = await assignments.createSchoolAssignment(org.organizationId, org.userId, settings(setup, classId, overrides));
  const created = [];
  for (const question of questions) created.push(await assignments.addSchoolAssignmentQuestion(org.organizationId, org.userId, assignment.id, question));
  const { version } = await assignments.publishSchoolAssignment(org.organizationId, org.userId, assignment.id);
  return { assignment, version, questions: created };
}

let setupA: Awaited<ReturnType<typeof setupSchool>>;
let setupB: Awaited<ReturnType<typeof setupSchool>>;

beforeAll(async () => {
  [orgA, orgB, ungranted] = await Promise.all([createTestOrg("assign-a"), createTestOrg("assign-b"), createTestOrg("assign-none")]);
  await testDb.organization.update({ where: { id: ungranted.organizationId }, data: { schoolAssignmentsGranted: false } });
  [setupA, setupB] = await Promise.all([setupSchool(orgA, `A${Date.now()}`), setupSchool(orgB, `B${Date.now()}`)]);
});

afterAll(async () => {
  await cleanupTestOrg(orgA);
  await cleanupTestOrg(orgB);
  await cleanupTestOrg(ungranted);
  for (const userId of extraUserIds) await testDb.user.delete({ where: { id: userId } }).catch(() => {});
});

describe("School Assignments & Assessments: entitlement, isolation, grading, and gradebook", () => {
  it("refuses every operation for a school without the add-on grant", async () => {
    const setup = await setupSchool(ungranted, `N${Date.now()}`);
    expect(await assignments.isSchoolAssignmentsAvailable(ungranted.organizationId)).toBe(false);
    await expect(assignments.createSchoolAssignment(ungranted.organizationId, ungranted.userId, settings(setup, setup.classOne.id))).rejects.toBeInstanceOf(assignments.SchoolAssignmentsNotGrantedError);
    await expect(assignments.listSchoolAssignmentsForStaff(ungranted.organizationId, ungranted.userId)).rejects.toBeInstanceOf(assignments.SchoolAssignmentsNotGrantedError);
    await expect(assignments.listSchoolAssignmentsForStudent(ungranted.organizationId, ungranted.userId)).rejects.toBeInstanceOf(assignments.SchoolAssignmentsNotGrantedError);
  });

  it("revokes access immediately when the School module itself is disabled", async () => {
    const schoolModule = await testDb.module.findFirst({ where: { code: "school" } });
    await testDb.organizationModule.updateMany({ where: { organizationId: orgB.organizationId, moduleId: schoolModule!.id }, data: { enabled: false } });
    try {
      expect(await assignments.isSchoolAssignmentsAvailable(orgB.organizationId)).toBe(false);
    } finally {
      await testDb.organizationModule.updateMany({ where: { organizationId: orgB.organizationId, moduleId: schoolModule!.id }, data: { enabled: true } });
    }
  });

  it("keeps one school's assignments, questions, and submissions out of another school's reach", async () => {
    const { assignment, questions } = await publishedAssignment(orgA, setupA, setupA.classOne.id);
    await expect(assignments.getSchoolAssignmentForStaff(orgB.organizationId, orgB.userId, assignment.id)).rejects.toBeInstanceOf(school.SchoolNotFoundError);
    await expect(assignments.updateSchoolAssignmentSettings(orgB.organizationId, orgB.userId, assignment.id, settings(setupB, setupB.classOne.id))).rejects.toBeInstanceOf(school.SchoolNotFoundError);
    await expect(assignments.publishSchoolAssignment(orgB.organizationId, orgB.userId, assignment.id)).rejects.toBeInstanceOf(school.SchoolNotFoundError);
    await expect(assignments.closeSchoolAssignment(orgB.organizationId, orgB.userId, assignment.id)).rejects.toBeInstanceOf(school.SchoolNotFoundError);
    await expect(assignments.updateSchoolAssignmentQuestion(orgB.organizationId, orgB.userId, questions[0].id, singleChoice)).rejects.toBeInstanceOf(school.SchoolNotFoundError);
    await expect(assignments.setSchoolAssignmentGradebookInclusion(orgB.organizationId, orgB.userId, assignment.id, { include: false })).rejects.toBeInstanceOf(school.SchoolNotFoundError);
    // A class from another organization can never be the target.
    await expect(assignments.createSchoolAssignment(orgB.organizationId, orgB.userId, settings(setupB, setupA.classOne.id))).rejects.toBeInstanceOf(school.SchoolNotFoundError);

    const { user } = await addStudent(orgA, setupA, setupA.classOne.id, "Iso");
    const { submission } = await assignments.submitSchoolAssignmentAttempt(orgA.organizationId, user.id, assignment.id, { versionId: assignment.currentVersionId ?? (await testDb.schoolAssignment.findUniqueOrThrow({ where: { id: assignment.id } })).currentVersionId!, idempotencyKey: randomUUID(), answers: {} });
    await expect(assignments.getSchoolAssignmentSubmissionForStaff(orgB.organizationId, orgB.userId, submission.id)).rejects.toBeInstanceOf(school.SchoolNotFoundError);
    await expect(assignments.reviewSchoolAssignmentSubmission(orgB.organizationId, orgB.userId, submission.id, { marks: {}, feedback: "x" })).rejects.toBeInstanceOf(school.SchoolNotFoundError);
    // A student account from school A cannot use school B's id space either.
    await expect(assignments.listSchoolAssignmentsForStudent(orgB.organizationId, user.id)).rejects.toBeInstanceOf(school.SchoolStateError);
  });

  it("limits a class-assigned teacher to their own classes", async () => {
    const teacher = await addUser(orgA, "Teacher", "teacher");
    await school.assignSchoolClassTeacher(orgA.organizationId, setupA.classOne.id, teacher.id);
    const own = await assignments.createSchoolAssignment(orgA.organizationId, teacher.id, settings(setupA, setupA.classOne.id, { title: "Mine" }));
    expect(own.classId).toBe(setupA.classOne.id);
    await expect(assignments.createSchoolAssignment(orgA.organizationId, teacher.id, settings(setupA, setupA.classTwo.id))).rejects.toMatchObject({ code: "class-not-assigned" });
    const other = await assignments.createSchoolAssignment(orgA.organizationId, orgA.userId, settings(setupA, setupA.classTwo.id, { title: "Not theirs" }));
    await expect(assignments.getSchoolAssignmentForStaff(orgA.organizationId, teacher.id, other.id)).rejects.toMatchObject({ code: "class-not-assigned" });
    const visible = await assignments.listSchoolAssignmentsForStaff(orgA.organizationId, teacher.id);
    expect(visible.every((item) => item.classId === setupA.classOne.id)).toBe(true);
    expect(visible.some((item) => item.id === other.id)).toBe(false);
  });

  it("shows students only their class's published work and only their own answers, with keys hidden until release", async () => {
    const { assignment, version } = await publishedAssignment(orgA, setupA, setupA.classOne.id);
    const draft = await assignments.createSchoolAssignment(orgA.organizationId, orgA.userId, settings(setupA, setupA.classOne.id, { title: "Still a draft" }));
    const ama = await addStudent(orgA, setupA, setupA.classOne.id, "Ama");
    const kofi = await addStudent(orgA, setupA, setupA.classOne.id, "Kofi");
    const otherClass = await addStudent(orgA, setupA, setupA.classTwo.id, "Esi");

    const list = await assignments.listSchoolAssignmentsForStudent(orgA.organizationId, ama.user.id);
    expect(list.assignments.some((item) => item.id === assignment.id)).toBe(true);
    expect(list.assignments.some((item) => item.id === draft.id)).toBe(false);
    await expect(assignments.getSchoolAssignmentForStudent(orgA.organizationId, otherClass.user.id, assignment.id)).rejects.toBeInstanceOf(school.SchoolNotFoundError);
    await expect(assignments.getSchoolAssignmentForStudent(orgA.organizationId, ama.user.id, draft.id)).rejects.toBeInstanceOf(school.SchoolNotFoundError);
    await expect(assignments.submitSchoolAssignmentAttempt(orgA.organizationId, otherClass.user.id, assignment.id, { versionId: version.id, idempotencyKey: randomUUID(), answers: {} })).rejects.toBeInstanceOf(school.SchoolNotFoundError);

    const view = await assignments.getSchoolAssignmentForStudent(orgA.organizationId, ama.user.id, assignment.id);
    expect(JSON.stringify(view.questions)).not.toContain("correctOptionIds");
    expect(JSON.stringify(view.questions)).not.toContain("1.5");

    const [single, num] = (await testDb.schoolAssignmentQuestion.findMany({ where: { assignmentId: assignment.id }, orderBy: { position: "asc" } }));
    await assignments.submitSchoolAssignmentAttempt(orgA.organizationId, ama.user.id, assignment.id, { versionId: version.id, idempotencyKey: randomUUID(), answers: { [single.id]: { optionIds: ["a"] }, [num.id]: { value: "1.5" } } });
    await assignments.submitSchoolAssignmentAttempt(orgA.organizationId, kofi.user.id, assignment.id, { versionId: version.id, idempotencyKey: randomUUID(), answers: { [single.id]: { optionIds: ["b"] } } });

    const amaView = await assignments.getSchoolAssignmentForStudent(orgA.organizationId, ama.user.id, assignment.id);
    expect(amaView.attempts).toHaveLength(1);
    expect(amaView.released).toBe(false);
    expect(amaView.attempts[0].score).toBeNull();
    expect(amaView.attempts[0].questions.every((question) => question.correctOptionIds === null && question.awarded === null)).toBe(true);
    // Kofi's answers never appear in Ama's view.
    expect(JSON.stringify(amaView)).not.toContain(kofi.student.id);

    await assignments.closeSchoolAssignment(orgA.organizationId, orgA.userId, assignment.id);
    await assignments.markSchoolAssignmentGraded(orgA.organizationId, orgA.userId, assignment.id);
    const released = await assignments.getSchoolAssignmentForStudent(orgA.organizationId, ama.user.id, assignment.id);
    expect(released.released).toBe(true);
    expect(released.attempts[0].score).toBe("5.00");
    expect(released.attempts[0].questions[0].correctOptionIds).toEqual(["a"]);
  });

  it("treats a retried submit as the same attempt and serializes concurrent attempts", async () => {
    const { assignment, version } = await publishedAssignment(orgA, setupA, setupA.classOne.id, [singleChoice], { maxAttempts: 2 });
    const { user, student } = await addStudent(orgA, setupA, setupA.classOne.id, "Retry");
    const key = randomUUID();
    const first = await assignments.submitSchoolAssignmentAttempt(orgA.organizationId, user.id, assignment.id, { versionId: version.id, idempotencyKey: key, answers: {} });
    const retried = await assignments.submitSchoolAssignmentAttempt(orgA.organizationId, user.id, assignment.id, { versionId: version.id, idempotencyKey: key, answers: {} });
    expect(first.duplicate).toBe(false);
    expect(retried.duplicate).toBe(true);
    expect(retried.submission.id).toBe(first.submission.id);

    const outcomes = await Promise.allSettled([randomUUID(), randomUUID(), randomUUID()].map((idempotencyKey) => assignments.submitSchoolAssignmentAttempt(orgA.organizationId, user.id, assignment.id, { versionId: version.id, idempotencyKey, answers: {} })));
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === "rejected").every((outcome) => (outcome as PromiseRejectedResult).reason?.code === "no-attempts")).toBe(true);
    const rows = await testDb.schoolAssignmentSubmission.findMany({ where: { assignmentId: assignment.id, studentId: student.id } });
    expect(rows.map((row) => row.attemptNumber).sort()).toEqual([1, 2]);
  });

  it("keeps past submissions on their published version when the teacher edits and republishes", async () => {
    const { assignment, version, questions } = await publishedAssignment(orgA, setupA, setupA.classOne.id, [singleChoice], { maxAttempts: 2 });
    const { user } = await addStudent(orgA, setupA, setupA.classOne.id, "Version");
    const { submission } = await assignments.submitSchoolAssignmentAttempt(orgA.organizationId, user.id, assignment.id, { versionId: version.id, idempotencyKey: randomUUID(), answers: { [questions[0].id]: { optionIds: ["a"] } } });
    expect(submission.score?.toFixed(2)).toBe("2.00");

    // Change the right answer and the points, then republish.
    await assignments.updateSchoolAssignmentQuestion(orgA.organizationId, orgA.userId, questions[0].id, { ...singleChoice, points: "4", correctOptionIds: ["b"] });
    expect(await assignments.hasUnpublishedChanges(orgA.organizationId, assignment.id)).toBe(true);
    // Students cannot answer the unpublished edit.
    const { version: v2 } = await assignments.publishSchoolAssignment(orgA.organizationId, orgA.userId, assignment.id);
    expect(v2.version).toBe(2);
    await expect(assignments.publishSchoolAssignment(orgA.organizationId, orgA.userId, assignment.id)).rejects.toMatchObject({ code: "no-changes" });

    const old = await testDb.schoolAssignmentSubmission.findUniqueOrThrow({ where: { id: submission.id } });
    expect(old.versionId).toBe(version.id);
    expect(old.score?.toFixed(2)).toBe("2.00");
    expect(old.maxScore.toFixed(2)).toBe("2.00");

    // A form rendered from version 1 cannot be graded against version 2.
    await expect(assignments.submitSchoolAssignmentAttempt(orgA.organizationId, user.id, assignment.id, { versionId: version.id, idempotencyKey: randomUUID(), answers: {} })).rejects.toMatchObject({ code: "version-changed" });
    const second = await assignments.submitSchoolAssignmentAttempt(orgA.organizationId, user.id, assignment.id, { versionId: v2.id, idempotencyKey: randomUUID(), answers: { [questions[0].id]: { optionIds: ["b"] } } });
    expect(second.submission.score?.toFixed(2)).toBe("4.00");
    expect(second.submission.versionId).toBe(v2.id);
  });

  it("writes nothing to the gradebook by default and records scaled exam results only after an explicit opt-in", async () => {
    const { assignment, version, questions } = await publishedAssignment(orgA, setupA, setupA.classOne.id, [singleChoice, essay]);
    const exam = await school.createSchoolExam(orgA.organizationId, { academicYearId: setupA.year.id, termId: setupA.term.id, subjectId: setupA.subject.id, name: "Class assignment 1", totalMarks: "20", weight: "30" });
    const ama = await addStudent(orgA, setupA, setupA.classOne.id, "Book");
    const { submission } = await assignments.submitSchoolAssignmentAttempt(orgA.organizationId, ama.user.id, assignment.id, { versionId: version.id, idempotencyKey: randomUUID(), answers: { [questions[0].id]: { optionIds: ["a"] }, [questions[1].id]: { value: "Multiply both." } } });
    expect(submission.gradingStatus).toBe("PENDING_REVIEW");
    expect(submission.score).toBeNull();
    expect(await testDb.schoolExamResult.count({ where: { examId: exam.id } })).toBe(0);

    // Excluded by default: marking does not touch the gradebook.
    await assignments.reviewSchoolAssignmentSubmission(orgA.organizationId, orgA.userId, submission.id, { marks: { [questions[1].id]: { awarded: "3" } }, feedback: "Good start" });
    expect(await testDb.schoolExamResult.count({ where: { examId: exam.id } })).toBe(0);

    // A mismatched exam (different subject) is refused.
    const otherSubject = await school.createSchoolSubject(orgA.organizationId, { code: `X${Date.now()}`, name: "Other" });
    const wrongExam = await school.createSchoolExam(orgA.organizationId, { academicYearId: setupA.year.id, termId: setupA.term.id, subjectId: otherSubject.id, name: "Wrong", totalMarks: "10", weight: "10" });
    await expect(assignments.setSchoolAssignmentGradebookInclusion(orgA.organizationId, orgA.userId, assignment.id, { include: true, examId: wrongExam.id })).rejects.toMatchObject({ code: "exam-mismatch" });

    await assignments.setSchoolAssignmentGradebookInclusion(orgA.organizationId, orgA.userId, assignment.id, { include: true, examId: exam.id, note: "Counts as CA1" });
    const recorded = await testDb.schoolExamResult.findUniqueOrThrow({ where: { examId_studentId: { examId: exam.id, studentId: ama.student.id } } });
    // 5 of 7 points, scaled to 20 marks.
    expect(recorded.marks.toFixed(2)).toBe("14.29");
    expect(recorded.classId).toBe(setupA.classOne.id);

    // Manual entry into the linked exam is refused, so there is one source of marks.
    await expect(school.recordSchoolExamResult(orgA.organizationId, orgA.userId, { examId: exam.id, studentId: ama.student.id, classId: setupA.classOne.id, subjectId: setupA.subject.id, marks: "1" })).rejects.toMatchObject({ code: "assignment-linked" });

    // Regrading updates the recorded result and keeps a history entry.
    await assignments.reviewSchoolAssignmentSubmission(orgA.organizationId, orgA.userId, submission.id, { marks: { [questions[1].id]: { awarded: "5" } }, feedback: "Excellent", note: "Re-read the answer" });
    const regraded = await testDb.schoolExamResult.findUniqueOrThrow({ where: { examId_studentId: { examId: exam.id, studentId: ama.student.id } } });
    expect(regraded.marks.toFixed(2)).toBe("20.00");
    const history = await testDb.schoolAssignmentEvent.findMany({ where: { assignmentId: assignment.id }, orderBy: { createdAt: "asc" } });
    expect(history.map((event) => event.action)).toEqual(expect.arrayContaining(["inclusion_changed", "gradebook_recorded", "grade_changed"]));
    expect(history.find((event) => event.action === "inclusion_changed")?.note).toBe("Counts as CA1");
    expect(await testDb.auditLog.count({ where: { organizationId: orgA.organizationId, action: "school.assignment.inclusion_changed" } })).toBeGreaterThan(0);

    // Opt out removes exactly what the assignment wrote.
    await assignments.setSchoolAssignmentGradebookInclusion(orgA.organizationId, orgA.userId, assignment.id, { include: false, note: "Not part of CA after all" });
    expect(await testDb.schoolExamResult.count({ where: { examId: exam.id } })).toBe(0);
    const after = await testDb.schoolAssignment.findUniqueOrThrow({ where: { id: assignment.id } });
    expect(after).toMatchObject({ includeInGradebook: false, gradebookExamId: null });
    // The assignment's own marks are untouched.
    expect((await testDb.schoolAssignmentSubmission.findUniqueOrThrow({ where: { id: submission.id } })).score?.toFixed(2)).toBe("7.00");
  });

  it("refuses to overwrite hand-entered results or change a published exam", async () => {
    const { assignment, version, questions } = await publishedAssignment(orgA, setupA, setupA.classOne.id, [singleChoice]);
    const learner = await addStudent(orgA, setupA, setupA.classOne.id, "Locked");
    const manual = await school.createSchoolExam(orgA.organizationId, { academicYearId: setupA.year.id, termId: setupA.term.id, subjectId: setupA.subject.id, name: "Hand entered", totalMarks: "10", weight: "10" });
    await school.recordSchoolExamResult(orgA.organizationId, orgA.userId, { examId: manual.id, studentId: learner.student.id, classId: setupA.classOne.id, subjectId: setupA.subject.id, marks: "6" });
    await expect(assignments.setSchoolAssignmentGradebookInclusion(orgA.organizationId, orgA.userId, assignment.id, { include: true, examId: manual.id })).rejects.toMatchObject({ code: "exam-has-results" });

    const exam = await school.createSchoolExam(orgA.organizationId, { academicYearId: setupA.year.id, termId: setupA.term.id, subjectId: setupA.subject.id, name: "Class assignment 2", totalMarks: "10", weight: "10" });
    await assignments.setSchoolAssignmentGradebookInclusion(orgA.organizationId, orgA.userId, assignment.id, { include: true, examId: exam.id });
    // Another assignment cannot claim the same exam.
    const { assignment: rival } = await publishedAssignment(orgA, setupA, setupA.classOne.id, [singleChoice]);
    await expect(assignments.setSchoolAssignmentGradebookInclusion(orgA.organizationId, orgA.userId, rival.id, { include: true, examId: exam.id })).rejects.toMatchObject({ code: "exam-linked" });

    await assignments.submitSchoolAssignmentAttempt(orgA.organizationId, learner.user.id, assignment.id, { versionId: version.id, idempotencyKey: randomUUID(), answers: { [questions[0].id]: { optionIds: ["a"] } } });
    expect((await testDb.schoolExamResult.findUniqueOrThrow({ where: { examId_studentId: { examId: exam.id, studentId: learner.student.id } } })).marks.toFixed(2)).toBe("10.00");

    await school.submitSchoolExamForModeration(orgA.organizationId, exam.id);
    await school.publishSchoolExam(orgA.organizationId, exam.id);
    await expect(assignments.setSchoolAssignmentGradebookInclusion(orgA.organizationId, orgA.userId, assignment.id, { include: false, note: "Too late" })).rejects.toMatchObject({ code: "exam-locked" });
    const staffView = await assignments.getSchoolAssignmentForStaff(orgA.organizationId, orgA.userId, assignment.id);
    expect(staffView.roster.find((row) => row.studentId === learner.student.id)?.gradebook).toBe("included");
  });
});
