import { Prisma } from "@prisma/client";

/**
 * Deterministic marking rules for School Assignments & Assessments.
 *
 * Deliberately free of Prisma queries, `server-only`, and the clock so every
 * rule is unit-testable and the same function runs for preview, submission,
 * and teacher re-marking. Only question types with an unambiguous right
 * answer are marked automatically; short-text and essay answers always go to
 * a teacher. Nothing here calls an AI model.
 *
 * All arithmetic uses Prisma.Decimal (decimal.js) so 0.1 + 0.2 style float
 * drift can never move a mark across a boundary.
 */

export type AssignmentQuestionType = "SINGLE_CHOICE" | "MULTI_SELECT" | "TRUE_FALSE" | "NUMERIC" | "SHORT_TEXT" | "ESSAY";

export const AUTO_MARKED_TYPES: readonly AssignmentQuestionType[] = ["SINGLE_CHOICE", "MULTI_SELECT", "TRUE_FALSE", "NUMERIC"];
export const TEACHER_MARKED_TYPES: readonly AssignmentQuestionType[] = ["SHORT_TEXT", "ESSAY"];

export const QUESTION_TYPE_LABELS: Record<AssignmentQuestionType, string> = {
  SINGLE_CHOICE: "Single choice",
  MULTI_SELECT: "Multiple select",
  TRUE_FALSE: "True or false",
  NUMERIC: "Numeric answer",
  SHORT_TEXT: "Short written answer",
  ESSAY: "Essay",
};

/** Shown to teachers when authoring and to students when answering, so both read the same rule. */
export const QUESTION_TYPE_RULES: Record<AssignmentQuestionType, string> = {
  SINGLE_CHOICE: "Marked automatically. Full marks for the one correct option, otherwise zero.",
  MULTI_SELECT: "Marked automatically. Full marks only when the selection exactly matches every correct option. No partial credit.",
  TRUE_FALSE: "Marked automatically. Full marks for the correct choice, otherwise zero.",
  NUMERIC: "Marked automatically. Full marks when the answer is within the stated tolerance of the expected value, otherwise zero.",
  SHORT_TEXT: "Marked by the teacher.",
  ESSAY: "Marked by the teacher.",
};

export const TRUE_FALSE_OPTIONS = [
  { id: "true", label: "True" },
  { id: "false", label: "False" },
] as const;

export const MAX_OPTIONS = 8;
export const MAX_QUESTION_POINTS = 1000;
export const MAX_TEXT_ANSWER_LENGTH = 10000;

export interface QuestionOption {
  id: string;
  label: string;
}

/** The immutable shape stored inside SchoolAssignmentVersion.questions. */
export interface VersionQuestion {
  id: string;
  position: number;
  type: AssignmentQuestionType;
  prompt: string;
  points: string;
  options: QuestionOption[];
  correctOptionIds: string[];
  numericAnswer: string | null;
  numericTolerance: string | null;
  markingGuide: string | null;
}

/** What a student is allowed to see before results are released: no answer keys. */
export interface StudentQuestion {
  id: string;
  position: number;
  type: AssignmentQuestionType;
  prompt: string;
  points: string;
  options: QuestionOption[];
  rule: string;
  numericTolerance: string | null;
}

export interface QuestionAnswer {
  optionIds?: string[];
  value?: string;
}

export type AnswerMap = Record<string, QuestionAnswer>;

export interface QuestionResult {
  /** Points awarded, two decimal places, as a string. Null while a teacher still has to mark it. */
  awarded: string | null;
  /** True/false for auto-marked questions, null for teacher-marked ones. */
  correct: boolean | null;
  auto: boolean;
  feedback?: string | null;
}

export type QuestionResultMap = Record<string, QuestionResult>;

export interface SubmissionGrade {
  autoScore: string;
  maxScore: string;
  /** Null while any teacher-marked question is unmarked. */
  score: string | null;
  requiresReview: boolean;
  questionResults: QuestionResultMap;
}

export class AssignmentDefinitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AssignmentDefinitionError";
  }
}

const ZERO = new Prisma.Decimal(0);
const dec = (value: Prisma.Decimal.Value) => new Prisma.Decimal(value);
const money = (value: Prisma.Decimal) => value.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toFixed(2);

export function isAutoMarked(type: AssignmentQuestionType) {
  return AUTO_MARKED_TYPES.includes(type);
}

/**
 * Strict numeric parsing for student answers and teacher keys: optional
 * sign, digits, optional decimal part. Rejects "1e3", "0x10", "Infinity",
 * thousands separators, and empty strings so a malformed answer is simply
 * wrong instead of being coerced into a surprising number.
 */
export function parseStrictNumber(raw: string | null | undefined): Prisma.Decimal | null {
  if (raw === null || raw === undefined) return null;
  const text = raw.trim();
  if (!/^[-+]?(\d+(\.\d+)?|\.\d+)$/.test(text)) return null;
  return dec(text);
}

/**
 * Validates a teacher-authored question before it is saved or published.
 * Throws AssignmentDefinitionError with a message suitable for the teacher.
 */
export function validateQuestionDefinition(question: Omit<VersionQuestion, "id" | "position">): void {
  const points = parseStrictNumber(question.points);
  if (!points || points.lte(0) || points.gt(MAX_QUESTION_POINTS) || points.decimalPlaces() > 2) {
    throw new AssignmentDefinitionError(`Points must be greater than 0 and at most ${MAX_QUESTION_POINTS}, with up to two decimal places.`);
  }
  if (!question.prompt.trim()) throw new AssignmentDefinitionError("Every question needs a prompt.");

  if (question.type === "SINGLE_CHOICE" || question.type === "MULTI_SELECT") {
    const options = question.options;
    if (options.length < 2 || options.length > MAX_OPTIONS) throw new AssignmentDefinitionError(`Choice questions need between 2 and ${MAX_OPTIONS} options.`);
    if (options.some((option) => !option.label.trim())) throw new AssignmentDefinitionError("Every option needs text.");
    const ids = new Set(options.map((option) => option.id));
    if (ids.size !== options.length) throw new AssignmentDefinitionError("Option identifiers must be unique.");
    const labels = new Set(options.map((option) => option.label.trim().toLowerCase()));
    if (labels.size !== options.length) throw new AssignmentDefinitionError("Two options have the same text. Students could not tell them apart.");
    const correct = new Set(question.correctOptionIds);
    if ([...correct].some((id) => !ids.has(id))) throw new AssignmentDefinitionError("A correct answer refers to an option that does not exist.");
    if (question.type === "SINGLE_CHOICE" && correct.size !== 1) throw new AssignmentDefinitionError("Single choice questions need exactly one correct option.");
    if (question.type === "MULTI_SELECT" && correct.size < 1) throw new AssignmentDefinitionError("Multiple select questions need at least one correct option.");
    return;
  }
  if (question.type === "TRUE_FALSE") {
    if (question.correctOptionIds.length !== 1 || !["true", "false"].includes(question.correctOptionIds[0])) {
      throw new AssignmentDefinitionError("Choose whether the statement is true or false.");
    }
    return;
  }
  if (question.type === "NUMERIC") {
    if (!parseStrictNumber(question.numericAnswer)) throw new AssignmentDefinitionError("Numeric questions need an expected answer written as a plain number, for example 12.5.");
    const tolerance = question.numericTolerance === null || question.numericTolerance === "" ? ZERO : parseStrictNumber(question.numericTolerance);
    if (!tolerance || tolerance.lt(0)) throw new AssignmentDefinitionError("Tolerance must be zero or a positive number.");
    return;
  }
  // SHORT_TEXT / ESSAY carry no answer key and are always teacher-marked.
}

/** Strips answer keys and marking guides so a version is safe to render for a student. */
export function toStudentQuestions(questions: VersionQuestion[]): StudentQuestion[] {
  return [...questions]
    .sort((a, b) => a.position - b.position)
    .map((question) => ({
      id: question.id,
      position: question.position,
      type: question.type,
      prompt: question.prompt,
      points: question.points,
      options: question.type === "TRUE_FALSE" ? [...TRUE_FALSE_OPTIONS] : question.options.map((option) => ({ id: option.id, label: option.label })),
      rule: QUESTION_TYPE_RULES[question.type],
      // Students may see the allowed margin (it is part of the question), never the answer.
      numericTolerance: question.type === "NUMERIC" ? question.numericTolerance ?? "0" : null,
    }));
}

export function computeMaxScore(questions: Pick<VersionQuestion, "points">[]): string {
  return money(questions.reduce((sum, question) => sum.plus(dec(question.points)), ZERO));
}

function sameSet(a: string[], b: string[]) {
  const left = new Set(a);
  const right = new Set(b);
  return left.size === right.size && [...left].every((value) => right.has(value));
}

/** Marks one question. Teacher-marked types return awarded=null. */
export function gradeQuestion(question: VersionQuestion, answer: QuestionAnswer | undefined): QuestionResult {
  const points = dec(question.points);
  if (!isAutoMarked(question.type)) return { awarded: null, correct: null, auto: false };

  let correct = false;
  if (question.type === "SINGLE_CHOICE" || question.type === "TRUE_FALSE") {
    const chosen = answer?.optionIds ?? [];
    correct = chosen.length === 1 && question.correctOptionIds.length === 1 && chosen[0] === question.correctOptionIds[0];
  } else if (question.type === "MULTI_SELECT") {
    const chosen = answer?.optionIds ?? [];
    correct = chosen.length > 0 && sameSet(chosen, question.correctOptionIds);
  } else if (question.type === "NUMERIC") {
    const expected = parseStrictNumber(question.numericAnswer);
    const given = parseStrictNumber(answer?.value);
    const tolerance = parseStrictNumber(question.numericTolerance ?? "0") ?? ZERO;
    correct = Boolean(expected && given && given.minus(expected).abs().lte(tolerance));
  }
  return { awarded: money(correct ? points : ZERO), correct, auto: true };
}

/**
 * Normalizes raw form input against the version so only answers to real
 * questions, with real option ids, are ever stored. Unknown question ids,
 * unknown option ids, and over-long text are dropped or truncated.
 */
export function normalizeAnswers(questions: VersionQuestion[], raw: AnswerMap): AnswerMap {
  const normalized: AnswerMap = {};
  for (const question of questions) {
    const answer = raw[question.id];
    if (!answer) continue;
    if (question.type === "SINGLE_CHOICE" || question.type === "MULTI_SELECT" || question.type === "TRUE_FALSE") {
      const validIds = new Set(question.type === "TRUE_FALSE" ? TRUE_FALSE_OPTIONS.map((option) => option.id) : question.options.map((option) => option.id));
      const chosen = [...new Set((answer.optionIds ?? []).filter((id) => validIds.has(id)))];
      if (chosen.length === 0) continue;
      normalized[question.id] = { optionIds: question.type === "MULTI_SELECT" ? chosen.sort() : chosen.slice(0, 1) };
    } else {
      const value = (answer.value ?? "").slice(0, MAX_TEXT_ANSWER_LENGTH).trim();
      if (value) normalized[question.id] = { value };
    }
  }
  return normalized;
}

/** Marks a whole submission against the version it was answered on. */
export function gradeSubmission(questions: VersionQuestion[], answers: AnswerMap): SubmissionGrade {
  const questionResults: QuestionResultMap = {};
  let autoScore = ZERO;
  let requiresReview = false;
  for (const question of questions) {
    const result = gradeQuestion(question, answers[question.id]);
    questionResults[question.id] = result;
    if (result.awarded !== null) autoScore = autoScore.plus(dec(result.awarded));
    else requiresReview = true;
  }
  const maxScore = computeMaxScore(questions);
  return { autoScore: money(autoScore), maxScore, score: requiresReview ? null : money(autoScore), requiresReview, questionResults };
}

/**
 * Applies a teacher's marks for teacher-marked questions (and optional
 * overrides of auto-marked ones) and returns the new per-question results
 * and total. Every awarded value must be between 0 and that question's
 * points with at most two decimal places.
 */
export function applyTeacherMarks(
  questions: VersionQuestion[],
  current: QuestionResultMap,
  marks: Record<string, { awarded?: string | null; feedback?: string | null }>,
): { questionResults: QuestionResultMap; score: string | null; complete: boolean } {
  const next: QuestionResultMap = {};
  let total = ZERO;
  let complete = true;
  for (const question of questions) {
    const existing = current[question.id] ?? { awarded: null, correct: null, auto: isAutoMarked(question.type) };
    const mark = marks[question.id];
    let awarded = existing.awarded;
    if (mark && mark.awarded !== undefined && mark.awarded !== null && mark.awarded !== "") {
      const value = parseStrictNumber(mark.awarded);
      const points = dec(question.points);
      if (!value || value.lt(0) || value.gt(points) || value.decimalPlaces() > 2) {
        throw new AssignmentDefinitionError(`Marks for question ${question.position} must be between 0 and ${points.toFixed(2)}, with up to two decimal places.`);
      }
      awarded = money(value);
    }
    const feedback = mark?.feedback !== undefined ? (mark.feedback?.trim() || null) : existing.feedback ?? null;
    next[question.id] = { ...existing, awarded, feedback };
    if (awarded === null) complete = false;
    else total = total.plus(dec(awarded));
  }
  return { questionResults: next, score: complete ? money(total) : null, complete };
}

export interface AttemptSummary {
  id: string;
  attemptNumber: number;
  gradingStatus: "PENDING_REVIEW" | "AUTO_GRADED" | "REVIEWED";
  score: string | null;
  maxScore: string;
}

export type MarkState =
  | { state: "none" }
  | { state: "pending"; attempt: AttemptSummary }
  | { state: "final"; attempt: AttemptSummary; score: string; maxScore: string };

/**
 * Which attempt is the student's mark for the assignment.
 *
 * - LATEST: the most recent attempt. If it still needs teacher marking the
 *   mark is pending, even if an earlier attempt was final.
 * - HIGHEST: the best final attempt, but only once no attempt is waiting for
 *   teacher marking (a pending attempt might turn out higher).
 */
export function resolveCountingAttempt(attempts: AttemptSummary[], scoring: "HIGHEST" | "LATEST"): MarkState {
  if (attempts.length === 0) return { state: "none" };
  const ordered = [...attempts].sort((a, b) => a.attemptNumber - b.attemptNumber);
  if (scoring === "LATEST") {
    const latest = ordered[ordered.length - 1];
    if (latest.score === null || latest.gradingStatus === "PENDING_REVIEW") return { state: "pending", attempt: latest };
    return { state: "final", attempt: latest, score: latest.score, maxScore: latest.maxScore };
  }
  const pending = ordered.find((attempt) => attempt.score === null || attempt.gradingStatus === "PENDING_REVIEW");
  if (pending) return { state: "pending", attempt: pending };
  // Compare as percentages so attempts on versions with different maximums rank fairly.
  const best = ordered.reduce((winner, attempt) => {
    const percent = dec(attempt.score!).div(dec(attempt.maxScore));
    const winnerPercent = dec(winner.score!).div(dec(winner.maxScore));
    return percent.gt(winnerPercent) ? attempt : winner;
  });
  return { state: "final", attempt: best, score: best.score!, maxScore: best.maxScore };
}

/**
 * Converts an assignment mark to the linked exam's scale. The broadsheet
 * computes percent = marks / totalMarks, so scaling preserves the student's
 * percentage exactly (to two decimal places), and the exam's own weight then
 * decides its share of the subject result.
 */
export function scaleToExamMarks(score: string, maxScore: string, examTotalMarks: string): string {
  const max = dec(maxScore);
  if (max.lte(0)) throw new AssignmentDefinitionError("The assignment has no marks to scale.");
  const scaled = dec(score).div(max).times(dec(examTotalMarks));
  const clamped = Prisma.Decimal.max(ZERO, Prisma.Decimal.min(scaled, dec(examTotalMarks)));
  return money(clamped);
}

export type FeedbackRelease = "IMMEDIATE" | "AFTER_DUE" | "ON_RELEASE";

/**
 * Whether a student may see their score, teacher feedback, and (if the
 * teacher allowed it) the correct answers. Correct answers are never shown
 * before this point, whatever the setting.
 */
export function isResultReleased(params: { feedbackRelease: FeedbackRelease; status: string; dueAt: Date; now: Date }): boolean {
  if (params.status === "GRADED") return true;
  if (params.feedbackRelease === "IMMEDIATE") return true;
  if (params.feedbackRelease === "AFTER_DUE") return params.now.getTime() >= params.dueAt.getTime();
  return false;
}

export type StudentAvailability = "scheduled" | "open" | "late" | "closed";

/** Whether a student can submit right now, from the assignment's own dates and status. */
export function studentAvailability(params: { status: string; availableFrom: Date; dueAt: Date; allowLateSubmissions: boolean; now: Date }): StudentAvailability {
  if (params.status !== "PUBLISHED") return "closed";
  if (params.now.getTime() < params.availableFrom.getTime()) return "scheduled";
  if (params.now.getTime() <= params.dueAt.getTime()) return "open";
  return params.allowLateSubmissions ? "late" : "closed";
}

export type TeacherDisplayState = "Draft" | "Scheduled" | "Open" | "Past due" | "Closed" | "Graded";

export function teacherDisplayState(params: { status: string; availableFrom: Date; dueAt: Date; now: Date }): TeacherDisplayState {
  if (params.status === "DRAFT") return "Draft";
  if (params.status === "GRADED") return "Graded";
  if (params.status === "CLOSED") return "Closed";
  if (params.now.getTime() < params.availableFrom.getTime()) return "Scheduled";
  if (params.now.getTime() <= params.dueAt.getTime()) return "Open";
  return "Past due";
}
