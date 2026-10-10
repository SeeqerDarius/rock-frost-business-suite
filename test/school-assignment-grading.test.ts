import { describe, expect, it } from "vitest";
import {
  AssignmentDefinitionError,
  applyTeacherMarks,
  computeMaxScore,
  gradeQuestion,
  gradeSubmission,
  isResultReleased,
  normalizeAnswers,
  parseStrictNumber,
  resolveCountingAttempt,
  scaleToExamMarks,
  studentAvailability,
  teacherDisplayState,
  toStudentQuestions,
  validateQuestionDefinition,
  type VersionQuestion,
} from "@/modules/school/assignment-grading";

const q = (overrides: Partial<VersionQuestion>): VersionQuestion => ({
  id: "q1",
  position: 1,
  type: "SINGLE_CHOICE",
  prompt: "Pick one",
  points: "2.00",
  options: [{ id: "a", label: "A" }, { id: "b", label: "B" }, { id: "c", label: "C" }],
  correctOptionIds: ["b"],
  numericAnswer: null,
  numericTolerance: null,
  markingGuide: null,
  ...overrides,
});

describe("assignment grading rules", () => {
  it("marks single choice and true/false all-or-nothing", () => {
    expect(gradeQuestion(q({}), { optionIds: ["b"] })).toEqual({ awarded: "2.00", correct: true, auto: true });
    expect(gradeQuestion(q({}), { optionIds: ["a"] }).awarded).toBe("0.00");
    expect(gradeQuestion(q({}), { optionIds: ["a", "b"] }).correct).toBe(false);
    expect(gradeQuestion(q({}), undefined).awarded).toBe("0.00");
    const tf = q({ type: "TRUE_FALSE", options: [], correctOptionIds: ["false"] });
    expect(gradeQuestion(tf, { optionIds: ["false"] }).correct).toBe(true);
    expect(gradeQuestion(tf, { optionIds: ["true"] }).correct).toBe(false);
  });

  it("marks multi-select only on an exact match, with no partial credit", () => {
    const multi = q({ type: "MULTI_SELECT", correctOptionIds: ["a", "c"] });
    expect(gradeQuestion(multi, { optionIds: ["c", "a"] }).awarded).toBe("2.00");
    expect(gradeQuestion(multi, { optionIds: ["a"] }).awarded).toBe("0.00");
    expect(gradeQuestion(multi, { optionIds: ["a", "b", "c"] }).awarded).toBe("0.00");
    expect(gradeQuestion(multi, { optionIds: [] }).awarded).toBe("0.00");
  });

  it("marks numeric answers within the tolerance, inclusive, using exact decimals", () => {
    const numeric = q({ type: "NUMERIC", options: [], correctOptionIds: [], numericAnswer: "0.3", numericTolerance: "0.05" });
    expect(gradeQuestion(numeric, { value: "0.3" }).correct).toBe(true);
    expect(gradeQuestion(numeric, { value: "0.35" }).correct).toBe(true);
    expect(gradeQuestion(numeric, { value: "0.25" }).correct).toBe(true);
    expect(gradeQuestion(numeric, { value: "0.3500001" }).correct).toBe(false);
    expect(gradeQuestion(numeric, { value: "1e-1" }).correct).toBe(false);
    expect(gradeQuestion(numeric, { value: "" }).correct).toBe(false);
    const exact = q({ type: "NUMERIC", options: [], correctOptionIds: [], numericAnswer: "12", numericTolerance: "0" });
    expect(gradeQuestion(exact, { value: "12.0" }).correct).toBe(true);
    expect(gradeQuestion(exact, { value: "12.01" }).correct).toBe(false);
  });

  it("never auto-marks written answers", () => {
    expect(gradeQuestion(q({ type: "ESSAY", options: [], correctOptionIds: [] }), { value: "Long answer" })).toEqual({ awarded: null, correct: null, auto: false });
    const grade = gradeSubmission([q({}), q({ id: "q2", position: 2, type: "SHORT_TEXT", options: [], correctOptionIds: [], points: "3" })], { q1: { optionIds: ["b"] } });
    expect(grade).toMatchObject({ autoScore: "2.00", maxScore: "5.00", score: null, requiresReview: true });
  });

  it("produces a final score when every question is objective", () => {
    const grade = gradeSubmission([q({}), q({ id: "q2", position: 2, points: "0.1" }), q({ id: "q3", position: 3, points: "0.2" })], { q1: { optionIds: ["b"] }, q2: { optionIds: ["b"] }, q3: { optionIds: ["b"] } });
    expect(grade).toMatchObject({ autoScore: "2.30", maxScore: "2.30", score: "2.30", requiresReview: false });
  });

  it("drops answers to unknown questions and options", () => {
    const answers = normalizeAnswers([q({}), q({ id: "q2", type: "MULTI_SELECT", correctOptionIds: ["a"] })], {
      q1: { optionIds: ["b", "a"] },
      q2: { optionIds: ["z", "c", "a", "a"] },
      ghost: { optionIds: ["a"] },
    });
    expect(answers).toEqual({ q1: { optionIds: ["b"] }, q2: { optionIds: ["a", "c"] } });
  });

  it("validates question definitions", () => {
    expect(() => validateQuestionDefinition({ ...q({}), correctOptionIds: [] })).toThrow(AssignmentDefinitionError);
    expect(() => validateQuestionDefinition({ ...q({}), correctOptionIds: ["a", "b"] })).toThrow(AssignmentDefinitionError);
    expect(() => validateQuestionDefinition({ ...q({}), correctOptionIds: ["z"] })).toThrow(AssignmentDefinitionError);
    expect(() => validateQuestionDefinition({ ...q({}), points: "0" })).toThrow(AssignmentDefinitionError);
    expect(() => validateQuestionDefinition({ ...q({}), points: "1.005" })).toThrow(AssignmentDefinitionError);
    expect(() => validateQuestionDefinition({ ...q({}), options: [{ id: "a", label: "Same" }, { id: "b", label: "same" }] })).toThrow(AssignmentDefinitionError);
    expect(() => validateQuestionDefinition({ ...q({ type: "NUMERIC", options: [], correctOptionIds: [], numericAnswer: "abc" }) })).toThrow(AssignmentDefinitionError);
    expect(() => validateQuestionDefinition({ ...q({ type: "NUMERIC", options: [], correctOptionIds: [], numericAnswer: "4", numericTolerance: "-1" }) })).toThrow(AssignmentDefinitionError);
    expect(() => validateQuestionDefinition(q({}))).not.toThrow();
    expect(() => validateQuestionDefinition(q({ type: "ESSAY", options: [], correctOptionIds: [] }))).not.toThrow();
  });

  it("never exposes answer keys or marking guides to students", () => {
    const [student] = toStudentQuestions([q({ markingGuide: "secret" })]);
    expect(student).not.toHaveProperty("correctOptionIds");
    expect(student).not.toHaveProperty("markingGuide");
    expect(student).not.toHaveProperty("numericAnswer");
    expect(JSON.stringify(toStudentQuestions([q({ type: "NUMERIC", options: [], correctOptionIds: [], numericAnswer: "42" })]))).not.toContain("42");
  });

  it("enforces teacher mark boundaries", () => {
    const questions = [q({ type: "ESSAY", options: [], correctOptionIds: [], points: "5" })];
    const base = { q1: { awarded: null, correct: null, auto: false } };
    expect(applyTeacherMarks(questions, base, { q1: { awarded: "5" } })).toMatchObject({ score: "5.00", complete: true });
    expect(applyTeacherMarks(questions, base, { q1: { awarded: "0" } })).toMatchObject({ score: "0.00", complete: true });
    expect(applyTeacherMarks(questions, base, {})).toMatchObject({ score: null, complete: false });
    expect(() => applyTeacherMarks(questions, base, { q1: { awarded: "5.01" } })).toThrow(AssignmentDefinitionError);
    expect(() => applyTeacherMarks(questions, base, { q1: { awarded: "-1" } })).toThrow(AssignmentDefinitionError);
    expect(() => applyTeacherMarks(questions, base, { q1: { awarded: "2.333" } })).toThrow(AssignmentDefinitionError);
  });

  it("chooses the counting attempt by policy", () => {
    const a1 = { id: "1", attemptNumber: 1, gradingStatus: "AUTO_GRADED" as const, score: "8.00", maxScore: "10.00" };
    const a2 = { id: "2", attemptNumber: 2, gradingStatus: "AUTO_GRADED" as const, score: "6.00", maxScore: "10.00" };
    const pending = { id: "3", attemptNumber: 3, gradingStatus: "PENDING_REVIEW" as const, score: null, maxScore: "10.00" };
    expect(resolveCountingAttempt([], "HIGHEST")).toEqual({ state: "none" });
    expect(resolveCountingAttempt([a2, a1], "HIGHEST")).toMatchObject({ state: "final", score: "8.00" });
    expect(resolveCountingAttempt([a1, a2], "LATEST")).toMatchObject({ state: "final", score: "6.00" });
    expect(resolveCountingAttempt([a1, a2, pending], "HIGHEST").state).toBe("pending");
    expect(resolveCountingAttempt([a1, a2, pending], "LATEST").state).toBe("pending");
  });

  it("scales a mark to the linked exam total without changing the percentage", () => {
    expect(scaleToExamMarks("7.00", "10.00", "100")).toBe("70.00");
    expect(scaleToExamMarks("1.00", "3.00", "30")).toBe("10.00");
    expect(scaleToExamMarks("2.00", "3.00", "100")).toBe("66.67");
    expect(scaleToExamMarks("10.00", "10.00", "40")).toBe("40.00");
    expect(computeMaxScore([{ points: "0.10" }, { points: "0.20" }])).toBe("0.30");
  });

  it("releases results and opens submissions only at the configured points", () => {
    const due = new Date("2026-10-20T17:00:00Z");
    const before = new Date("2026-10-19T00:00:00Z");
    const after = new Date("2026-10-21T00:00:00Z");
    expect(isResultReleased({ feedbackRelease: "IMMEDIATE", status: "PUBLISHED", dueAt: due, now: before })).toBe(true);
    expect(isResultReleased({ feedbackRelease: "AFTER_DUE", status: "PUBLISHED", dueAt: due, now: before })).toBe(false);
    expect(isResultReleased({ feedbackRelease: "AFTER_DUE", status: "PUBLISHED", dueAt: due, now: after })).toBe(true);
    expect(isResultReleased({ feedbackRelease: "ON_RELEASE", status: "CLOSED", dueAt: due, now: after })).toBe(false);
    expect(isResultReleased({ feedbackRelease: "ON_RELEASE", status: "GRADED", dueAt: due, now: after })).toBe(true);
    const from = new Date("2026-10-18T00:00:00Z");
    expect(studentAvailability({ status: "DRAFT", availableFrom: from, dueAt: due, allowLateSubmissions: true, now: before })).toBe("closed");
    expect(studentAvailability({ status: "PUBLISHED", availableFrom: from, dueAt: due, allowLateSubmissions: false, now: new Date("2026-10-17T00:00:00Z") })).toBe("scheduled");
    expect(studentAvailability({ status: "PUBLISHED", availableFrom: from, dueAt: due, allowLateSubmissions: false, now: due })).toBe("open");
    expect(studentAvailability({ status: "PUBLISHED", availableFrom: from, dueAt: due, allowLateSubmissions: false, now: after })).toBe("closed");
    expect(studentAvailability({ status: "PUBLISHED", availableFrom: from, dueAt: due, allowLateSubmissions: true, now: after })).toBe("late");
    expect(studentAvailability({ status: "CLOSED", availableFrom: from, dueAt: due, allowLateSubmissions: true, now: after })).toBe("closed");
    expect(teacherDisplayState({ status: "PUBLISHED", availableFrom: from, dueAt: due, now: after })).toBe("Past due");
  });

  it("parses numbers strictly", () => {
    expect(parseStrictNumber(" -12.5 ")?.toString()).toBe("-12.5");
    expect(parseStrictNumber(".5")?.toString()).toBe("0.5");
    for (const bad of ["", "1,000", "0x10", "Infinity", "1e3", "12.", "abc"]) expect(parseStrictNumber(bad)).toBeNull();
  });
});

describe("published version comparison", () => {
  it("treats a JSONB round-trip (reordered keys) as unchanged and a real edit as changed", async () => {
    const { sameQuestionSnapshot } = await import("@/modules/school/assignment-grading");
    const original = q({});
    const reordered = Object.fromEntries(Object.entries(original).reverse()) as unknown as VersionQuestion;
    expect(sameQuestionSnapshot([original], [reordered])).toBe(true);
    expect(sameQuestionSnapshot([original], [{ ...original, correctOptionIds: ["a"] }])).toBe(false);
    expect(sameQuestionSnapshot([original], [{ ...original, position: 7 }])).toBe(true);
  });
});
