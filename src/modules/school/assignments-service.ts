import "server-only";

import { Prisma, type SchoolAssignmentAttemptScoring, type SchoolAssignmentFeedbackRelease, type SchoolAssignmentQuestionType } from "@prisma/client";
import { db } from "@/lib/db";
import { logAuditEvent } from "@/lib/audit";
import { entitledModuleKeysForOrganization } from "@/lib/tenant/entitlements";
import { resolveGradeFromScale, resolveTeacherClassScope, SchoolNotFoundError, SchoolStateError } from "./service";
import { resolveSchoolPortalScope } from "./portal-service";
import {
  AssignmentDefinitionError,
  applyTeacherMarks,
  computeMaxScore,
  gradeSubmission,
  isResultReleased,
  normalizeAnswers,
  resolveCountingAttempt,
  sameQuestionSnapshot,
  scaleToExamMarks,
  studentAvailability,
  toStudentQuestions,
  validateQuestionDefinition,
  type AnswerMap,
  type AttemptSummary,
  type MarkState,
  type QuestionOption,
  type QuestionResultMap,
  type VersionQuestion,
} from "./assignment-grading";

/**
 * School Assignments & Assessments (paid add-on). See docs/SCHOOL_ASSIGNMENTS.md.
 *
 * Every exported function re-checks, on the server, the organization's add-on
 * grant and School entitlement, the acting teacher's class scope (the same
 * SchoolClassTeacher rule exams already use) or the acting student's own
 * portal link. Callers pass only ids; nothing trusts a client-supplied
 * student id. Page/action permission checks sit in front of this layer as
 * well, but this layer is the security boundary.
 *
 * Gradebook rule: an assignment never keeps marks of its own in the
 * cumulative record. When a teacher opts it in, each student's counting mark
 * is scaled to one linked, unpublished SchoolExam's total and written as an
 * ordinary SchoolExamResult. The broadsheet then treats it exactly like any
 * other exam result, combined by the exam's existing weight once published.
 */

type Tx = Prisma.TransactionClient;
const EDITABLE_EXAM_STATUSES = ["DRAFT", "OPEN", "MODERATION"] as const;
const MAX_ATTEMPTS_LIMIT = 10;

export class SchoolAssignmentsNotGrantedError extends SchoolStateError {
  constructor() {
    super("Assignments & Assessments is not enabled for this school. Contact Rock Frost to add it.", "assignments-not-granted");
  }
}

/** Organization-level gate: the paid add-on grant plus a current School entitlement. */
export async function isSchoolAssignmentsAvailable(organizationId: string): Promise<boolean> {
  const [organization, modules] = await Promise.all([
    db.organization.findUnique({ where: { id: organizationId }, select: { schoolAssignmentsGranted: true } }),
    entitledModuleKeysForOrganization(organizationId),
  ]);
  return Boolean(organization?.schoolAssignmentsGranted) && modules.includes("school");
}

async function assertAvailable(organizationId: string) {
  if (!(await isSchoolAssignmentsAvailable(organizationId))) throw new SchoolAssignmentsNotGrantedError();
}

async function assertClassInScope(organizationId: string, actorUserId: string, classId: string) {
  const scope = await resolveTeacherClassScope(organizationId, actorUserId);
  if (scope && !scope.has(classId)) throw new SchoolStateError("You can only manage assignments for a class you're assigned to.", "class-not-assigned");
}

async function loadStaffAssignment(organizationId: string, actorUserId: string, assignmentId: string, tx: Tx | typeof db = db) {
  const assignment = await tx.schoolAssignment.findFirst({ where: { id: assignmentId, organizationId } });
  if (!assignment) throw new SchoolNotFoundError("Assignment not found.");
  await assertClassInScope(organizationId, actorUserId, assignment.classId);
  return assignment;
}

function wrapDefinitionError<T>(run: () => T): T {
  try {
    return run();
  } catch (error) {
    if (error instanceof AssignmentDefinitionError) throw new SchoolStateError(error.message, "invalid-question");
    throw error;
  }
}

async function recordEvent(tx: Tx, input: { organizationId: string; assignmentId: string; submissionId?: string | null; actorId: string | null; action: string; previousValue?: string | null; newValue?: string | null; note?: string | null }) {
  await tx.schoolAssignmentEvent.create({
    data: {
      organizationId: input.organizationId,
      assignmentId: input.assignmentId,
      submissionId: input.submissionId ?? null,
      actorId: input.actorId,
      action: input.action,
      previousValue: input.previousValue ?? null,
      newValue: input.newValue ?? null,
      note: input.note ?? null,
    },
  });
  await logAuditEvent({
    organizationId: input.organizationId,
    userId: input.actorId,
    module: "school",
    action: `school.assignment.${input.action}`,
    entityName: input.submissionId ? "SchoolAssignmentSubmission" : "SchoolAssignment",
    entityId: input.submissionId ?? input.assignmentId,
    metadata: { assignmentId: input.assignmentId, previousValue: input.previousValue ?? null, newValue: input.newValue ?? null },
  }, tx);
}

// ---------------------------------------------------------------------------
// Version snapshots

function questionRowToVersionQuestion(row: {
  id: string; position: number; type: SchoolAssignmentQuestionType; prompt: string; points: Prisma.Decimal; options: Prisma.JsonValue;
  correctOptionIds: string[]; numericAnswer: Prisma.Decimal | null; numericTolerance: Prisma.Decimal | null; markingGuide: string | null;
}): VersionQuestion {
  const options = Array.isArray(row.options)
    ? (row.options as unknown[]).flatMap((option) => {
        if (!option || typeof option !== "object") return [];
        const value = option as Record<string, unknown>;
        return typeof value.id === "string" && typeof value.label === "string" ? [{ id: value.id, label: value.label }] : [];
      })
    : [];
  return {
    id: row.id,
    position: row.position,
    type: row.type,
    prompt: row.prompt,
    points: row.points.toFixed(2),
    options,
    correctOptionIds: row.correctOptionIds,
    numericAnswer: row.numericAnswer ? row.numericAnswer.toString() : null,
    numericTolerance: row.numericTolerance ? row.numericTolerance.toString() : null,
    markingGuide: row.markingGuide,
  };
}

export function readVersionQuestions(value: Prisma.JsonValue): VersionQuestion[] {
  return Array.isArray(value) ? (value as unknown as VersionQuestion[]) : [];
}

// ---------------------------------------------------------------------------
// Teacher: assignments

export interface AssignmentSettingsInput {
  classId: string;
  subjectId: string;
  termId: string;
  title: string;
  instructions: string | null;
  availableFrom: Date;
  dueAt: Date;
  allowLateSubmissions: boolean;
  maxAttempts: number;
  attemptScoring: SchoolAssignmentAttemptScoring;
  feedbackRelease: SchoolAssignmentFeedbackRelease;
  showCorrectAnswers: boolean;
}

function assertSettingsShape(input: AssignmentSettingsInput) {
  if (input.dueAt.getTime() <= input.availableFrom.getTime()) throw new SchoolStateError("The due date must be after the date the assignment opens.", "invalid-dates");
  if (!Number.isInteger(input.maxAttempts) || input.maxAttempts < 1 || input.maxAttempts > MAX_ATTEMPTS_LIMIT) throw new SchoolStateError(`Attempts must be between 1 and ${MAX_ATTEMPTS_LIMIT}.`, "invalid-attempts");
}

async function resolveAcademicContext(organizationId: string, input: Pick<AssignmentSettingsInput, "classId" | "subjectId" | "termId">) {
  const [schoolClass, subject, term] = await Promise.all([
    db.schoolClass.findFirst({ where: { id: input.classId, organizationId, active: true } }),
    db.schoolSubject.findFirst({ where: { id: input.subjectId, organizationId, active: true } }),
    db.schoolTerm.findFirst({ where: { id: input.termId, organizationId } }),
  ]);
  if (!schoolClass || !subject || !term) throw new SchoolNotFoundError("Class, subject, or term not found.");
  return { schoolClass, subject, term };
}

export async function createSchoolAssignment(organizationId: string, actorUserId: string, input: AssignmentSettingsInput) {
  await assertAvailable(organizationId);
  assertSettingsShape(input);
  await assertClassInScope(organizationId, actorUserId, input.classId);
  const { term } = await resolveAcademicContext(organizationId, input);
  return db.$transaction(async (tx) => {
    const assignment = await tx.schoolAssignment.create({
      data: {
        organizationId,
        classId: input.classId,
        subjectId: input.subjectId,
        academicYearId: term.academicYearId,
        termId: term.id,
        title: input.title,
        instructions: input.instructions,
        availableFrom: input.availableFrom,
        dueAt: input.dueAt,
        allowLateSubmissions: input.allowLateSubmissions,
        maxAttempts: input.maxAttempts,
        attemptScoring: input.attemptScoring,
        feedbackRelease: input.feedbackRelease,
        showCorrectAnswers: input.showCorrectAnswers,
        createdById: actorUserId,
      },
    });
    await recordEvent(tx, { organizationId, assignmentId: assignment.id, actorId: actorUserId, action: "created", newValue: assignment.title });
    return assignment;
  });
}

export async function updateSchoolAssignmentSettings(organizationId: string, actorUserId: string, assignmentId: string, input: AssignmentSettingsInput) {
  await assertAvailable(organizationId);
  assertSettingsShape(input);
  const assignment = await loadStaffAssignment(organizationId, actorUserId, assignmentId);
  if (assignment.status === "CLOSED" || assignment.status === "GRADED") throw new SchoolStateError("Reopen the assignment before changing its settings.", "assignment-locked");
  const academicChanged = input.classId !== assignment.classId || input.subjectId !== assignment.subjectId || input.termId !== assignment.termId;
  if (academicChanged && assignment.status !== "DRAFT") throw new SchoolStateError("Class, subject, and term can only change while the assignment is a draft.", "assignment-published");
  if (academicChanged && assignment.includeInGradebook) throw new SchoolStateError("Remove the assignment from the cumulative record before changing its class, subject, or term.", "assignment-included");
  await assertClassInScope(organizationId, actorUserId, input.classId);
  const { term } = await resolveAcademicContext(organizationId, input);
  return db.$transaction(async (tx) => {
    const updated = await tx.schoolAssignment.update({
      where: { id: assignment.id },
      data: {
        classId: input.classId,
        subjectId: input.subjectId,
        academicYearId: term.academicYearId,
        termId: term.id,
        title: input.title,
        instructions: input.instructions,
        availableFrom: input.availableFrom,
        dueAt: input.dueAt,
        allowLateSubmissions: input.allowLateSubmissions,
        maxAttempts: input.maxAttempts,
        attemptScoring: input.attemptScoring,
        feedbackRelease: input.feedbackRelease,
        showCorrectAnswers: input.showCorrectAnswers,
      },
    });
    await recordEvent(tx, { organizationId, assignmentId: assignment.id, actorId: actorUserId, action: "settings_updated" });
    if (assignment.attemptScoring !== input.attemptScoring && assignment.includeInGradebook) {
      await syncGradebookForAssignment(tx, organizationId, actorUserId, updated.id);
    }
    return updated;
  });
}

export async function deleteSchoolAssignmentDraft(organizationId: string, actorUserId: string, assignmentId: string) {
  await assertAvailable(organizationId);
  const assignment = await loadStaffAssignment(organizationId, actorUserId, assignmentId);
  if (assignment.status !== "DRAFT" || assignment.currentVersionId) throw new SchoolStateError("Only a draft that has never been published can be deleted.", "assignment-published");
  await db.$transaction(async (tx) => {
    await tx.schoolAssignment.delete({ where: { id: assignment.id } });
    await logAuditEvent({ organizationId, userId: actorUserId, module: "school", action: "school.assignment.draft_deleted", entityName: "SchoolAssignment", entityId: assignment.id, metadata: { title: assignment.title } }, tx);
  });
}

// ---------------------------------------------------------------------------
// Teacher: questions (working copy)

export interface QuestionInput {
  type: SchoolAssignmentQuestionType;
  prompt: string;
  points: string;
  options: QuestionOption[];
  correctOptionIds: string[];
  numericAnswer: string | null;
  numericTolerance: string | null;
  markingGuide: string | null;
}

function normalizeQuestionInput(input: QuestionInput): QuestionInput {
  const options = input.type === "SINGLE_CHOICE" || input.type === "MULTI_SELECT" ? input.options.map((option) => ({ id: option.id, label: option.label.trim() })) : [];
  const correctOptionIds = input.type === "SHORT_TEXT" || input.type === "ESSAY" || input.type === "NUMERIC" ? [] : [...new Set(input.correctOptionIds)];
  return {
    ...input,
    prompt: input.prompt.trim(),
    options,
    correctOptionIds,
    numericAnswer: input.type === "NUMERIC" ? input.numericAnswer?.trim() || null : null,
    numericTolerance: input.type === "NUMERIC" ? input.numericTolerance?.trim() || "0" : null,
    markingGuide: input.markingGuide?.trim() || null,
  };
}

async function assertQuestionsEditable(organizationId: string, actorUserId: string, assignmentId: string) {
  const assignment = await loadStaffAssignment(organizationId, actorUserId, assignmentId);
  if (assignment.status === "CLOSED" || assignment.status === "GRADED") throw new SchoolStateError("Reopen the assignment before changing its questions.", "assignment-locked");
  return assignment;
}

export async function addSchoolAssignmentQuestion(organizationId: string, actorUserId: string, assignmentId: string, raw: QuestionInput) {
  await assertAvailable(organizationId);
  const assignment = await assertQuestionsEditable(organizationId, actorUserId, assignmentId);
  const input = normalizeQuestionInput(raw);
  wrapDefinitionError(() => validateQuestionDefinition(input));
  const last = await db.schoolAssignmentQuestion.findFirst({ where: { organizationId, assignmentId: assignment.id }, orderBy: { position: "desc" } });
  return db.schoolAssignmentQuestion.create({
    data: {
      organizationId,
      assignmentId: assignment.id,
      position: (last?.position ?? 0) + 1,
      type: input.type,
      prompt: input.prompt,
      points: new Prisma.Decimal(input.points),
      options: input.options.length > 0 ? (input.options as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
      correctOptionIds: input.correctOptionIds,
      numericAnswer: input.numericAnswer ? new Prisma.Decimal(input.numericAnswer) : null,
      numericTolerance: input.numericTolerance ? new Prisma.Decimal(input.numericTolerance) : null,
      markingGuide: input.markingGuide,
    },
  });
}

export async function updateSchoolAssignmentQuestion(organizationId: string, actorUserId: string, questionId: string, raw: QuestionInput) {
  await assertAvailable(organizationId);
  const question = await db.schoolAssignmentQuestion.findFirst({ where: { id: questionId, organizationId } });
  if (!question) throw new SchoolNotFoundError("Question not found.");
  await assertQuestionsEditable(organizationId, actorUserId, question.assignmentId);
  const input = normalizeQuestionInput(raw);
  wrapDefinitionError(() => validateQuestionDefinition(input));
  return db.schoolAssignmentQuestion.update({
    where: { id: question.id },
    data: {
      type: input.type,
      prompt: input.prompt,
      points: new Prisma.Decimal(input.points),
      options: input.options.length > 0 ? (input.options as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
      correctOptionIds: input.correctOptionIds,
      numericAnswer: input.numericAnswer ? new Prisma.Decimal(input.numericAnswer) : null,
      numericTolerance: input.numericTolerance ? new Prisma.Decimal(input.numericTolerance) : null,
      markingGuide: input.markingGuide,
    },
  });
}

export async function deleteSchoolAssignmentQuestion(organizationId: string, actorUserId: string, questionId: string) {
  await assertAvailable(organizationId);
  const question = await db.schoolAssignmentQuestion.findFirst({ where: { id: questionId, organizationId } });
  if (!question) throw new SchoolNotFoundError("Question not found.");
  await assertQuestionsEditable(organizationId, actorUserId, question.assignmentId);
  await db.schoolAssignmentQuestion.delete({ where: { id: question.id } });
}

export async function moveSchoolAssignmentQuestion(organizationId: string, actorUserId: string, questionId: string, direction: "up" | "down") {
  await assertAvailable(organizationId);
  const question = await db.schoolAssignmentQuestion.findFirst({ where: { id: questionId, organizationId } });
  if (!question) throw new SchoolNotFoundError("Question not found.");
  await assertQuestionsEditable(organizationId, actorUserId, question.assignmentId);
  const neighbour = await db.schoolAssignmentQuestion.findFirst({
    where: { organizationId, assignmentId: question.assignmentId, position: direction === "up" ? { lt: question.position } : { gt: question.position } },
    orderBy: { position: direction === "up" ? "desc" : "asc" },
  });
  if (!neighbour) return;
  await db.$transaction([
    db.schoolAssignmentQuestion.update({ where: { id: question.id }, data: { position: neighbour.position } }),
    db.schoolAssignmentQuestion.update({ where: { id: neighbour.id }, data: { position: question.position } }),
  ]);
}

async function workingCopy(organizationId: string, assignmentId: string, tx: Tx | typeof db = db) {
  const rows = await tx.schoolAssignmentQuestion.findMany({ where: { organizationId, assignmentId }, orderBy: [{ position: "asc" }, { createdAt: "asc" }] });
  return rows.map((row, index) => ({ ...questionRowToVersionQuestion(row), position: index + 1 }));
}

export async function hasUnpublishedChanges(organizationId: string, assignmentId: string): Promise<boolean> {
  const assignment = await db.schoolAssignment.findFirst({ where: { id: assignmentId, organizationId }, include: { currentVersion: true } });
  if (!assignment) return false;
  const questions = await workingCopy(organizationId, assignmentId);
  if (!assignment.currentVersion) return questions.length > 0;
  return !sameQuestionSnapshot(questions, readVersionQuestions(assignment.currentVersion.questions));
}

/**
 * Publishes the working copy as a new immutable version. Existing
 * submissions keep the version they were answered on, so editing a live
 * assignment never changes past questions, answers, or scores; only new
 * attempts use the new version.
 */
export async function publishSchoolAssignment(organizationId: string, actorUserId: string, assignmentId: string) {
  await assertAvailable(organizationId);
  const assignment = await loadStaffAssignment(organizationId, actorUserId, assignmentId);
  if (assignment.status !== "DRAFT" && assignment.status !== "PUBLISHED") throw new SchoolStateError("Reopen the assignment before publishing changes.", "assignment-locked");
  if (assignment.dueAt.getTime() <= assignment.availableFrom.getTime()) throw new SchoolStateError("The due date must be after the date the assignment opens.", "invalid-dates");
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`school-assignment-publish:${assignment.id}`}))`;
    const questions = await workingCopy(organizationId, assignment.id, tx);
    if (questions.length === 0) throw new SchoolStateError("Add at least one question before publishing.", "no-questions");
    wrapDefinitionError(() => questions.forEach((question) => validateQuestionDefinition(question)));
    const current = assignment.currentVersionId ? await tx.schoolAssignmentVersion.findUnique({ where: { id: assignment.currentVersionId } }) : null;
    if (current && sameQuestionSnapshot(readVersionQuestions(current.questions), questions) && assignment.status === "PUBLISHED") {
      throw new SchoolStateError("There are no question changes to publish.", "no-changes");
    }
    const latest = await tx.schoolAssignmentVersion.findFirst({ where: { assignmentId: assignment.id }, orderBy: { version: "desc" } });
    const version = await tx.schoolAssignmentVersion.create({
      data: {
        organizationId,
        assignmentId: assignment.id,
        version: (latest?.version ?? 0) + 1,
        questions: questions as unknown as Prisma.InputJsonValue,
        maxScore: new Prisma.Decimal(computeMaxScore(questions)),
        publishedById: actorUserId,
      },
    });
    const updated = await tx.schoolAssignment.update({
      where: { id: assignment.id },
      data: { status: "PUBLISHED", currentVersionId: version.id, publishedAt: assignment.publishedAt ?? new Date() },
    });
    await recordEvent(tx, { organizationId, assignmentId: assignment.id, actorId: actorUserId, action: "published", previousValue: latest ? `Version ${latest.version}` : null, newValue: `Version ${version.version}` });
    return { assignment: updated, version };
  });
}

export async function closeSchoolAssignment(organizationId: string, actorUserId: string, assignmentId: string) {
  await assertAvailable(organizationId);
  const assignment = await loadStaffAssignment(organizationId, actorUserId, assignmentId);
  if (assignment.status !== "PUBLISHED") throw new SchoolStateError("Only a published assignment can be closed.", "assignment-not-published");
  return db.$transaction(async (tx) => {
    const updated = await tx.schoolAssignment.update({ where: { id: assignment.id }, data: { status: "CLOSED", closedAt: new Date() } });
    await recordEvent(tx, { organizationId, assignmentId: assignment.id, actorId: actorUserId, action: "closed", previousValue: "PUBLISHED", newValue: "CLOSED" });
    return updated;
  });
}

export async function reopenSchoolAssignment(organizationId: string, actorUserId: string, assignmentId: string) {
  await assertAvailable(organizationId);
  const assignment = await loadStaffAssignment(organizationId, actorUserId, assignmentId);
  if (assignment.status !== "CLOSED" && assignment.status !== "GRADED") throw new SchoolStateError("Only a closed or graded assignment can be reopened.", "assignment-not-closed");
  return db.$transaction(async (tx) => {
    const updated = await tx.schoolAssignment.update({ where: { id: assignment.id }, data: { status: "PUBLISHED", closedAt: null, gradedAt: null } });
    await recordEvent(tx, { organizationId, assignmentId: assignment.id, actorId: actorUserId, action: "reopened", previousValue: assignment.status, newValue: "PUBLISHED" });
    return updated;
  });
}

/** Marks a closed assignment as graded, which also releases results set to "when the teacher releases them". */
export async function markSchoolAssignmentGraded(organizationId: string, actorUserId: string, assignmentId: string) {
  await assertAvailable(organizationId);
  const assignment = await loadStaffAssignment(organizationId, actorUserId, assignmentId);
  if (assignment.status !== "CLOSED") throw new SchoolStateError("Close the assignment before marking it graded.", "assignment-not-closed");
  const pending = await db.schoolAssignmentSubmission.count({ where: { organizationId, assignmentId: assignment.id, gradingStatus: "PENDING_REVIEW" } });
  if (pending > 0) throw new SchoolStateError(`${pending} submission${pending === 1 ? " still needs" : "s still need"} marking.`, "pending-review");
  return db.$transaction(async (tx) => {
    const updated = await tx.schoolAssignment.update({ where: { id: assignment.id }, data: { status: "GRADED", gradedAt: new Date() } });
    await recordEvent(tx, { organizationId, assignmentId: assignment.id, actorId: actorUserId, action: "graded", previousValue: "CLOSED", newValue: "GRADED" });
    return updated;
  });
}

// ---------------------------------------------------------------------------
// Gradebook inclusion

function attemptSummaries(rows: { id: string; attemptNumber: number; gradingStatus: AttemptSummary["gradingStatus"]; score: Prisma.Decimal | null; maxScore: Prisma.Decimal }[]): AttemptSummary[] {
  return rows.map((row) => ({ id: row.id, attemptNumber: row.attemptNumber, gradingStatus: row.gradingStatus, score: row.score ? row.score.toFixed(2) : null, maxScore: row.maxScore.toFixed(2) }));
}

/**
 * Writes (or removes) the linked exam result for every student who has
 * submitted, from that student's counting attempt. Only touches the linked
 * exam, and only while that exam still accepts results. Returns whether the
 * exam was writable so callers can tell the teacher when it was not.
 */
async function syncGradebookForAssignment(tx: Tx, organizationId: string, actorUserId: string | null, assignmentId: string, studentIds?: string[]): Promise<{ written: boolean }> {
  const assignment = await tx.schoolAssignment.findFirst({
    where: { id: assignmentId, organizationId },
    include: { gradebookExam: true, class: { include: { campus: { include: { settings: true } } } } },
  });
  if (!assignment || !assignment.includeInGradebook || !assignment.gradebookExam) return { written: false };
  const exam = assignment.gradebookExam;
  if (!(EDITABLE_EXAM_STATUSES as readonly string[]).includes(exam.status)) return { written: false };

  const submissions = await tx.schoolAssignmentSubmission.findMany({
    where: { organizationId, assignmentId, ...(studentIds ? { studentId: { in: studentIds } } : {}) },
    select: { id: true, studentId: true, attemptNumber: true, gradingStatus: true, score: true, maxScore: true },
  });
  const byStudent = new Map<string, typeof submissions>();
  for (const submission of submissions) byStudent.set(submission.studentId, [...(byStudent.get(submission.studentId) ?? []), submission]);

  const existing = await tx.schoolExamResult.findMany({ where: { organizationId, examId: exam.id, ...(studentIds ? { studentId: { in: studentIds } } : {}) } });
  const existingByStudent = new Map(existing.map((result) => [result.studentId, result]));
  const gradingScale = assignment.class.campus.settings?.gradingScale;
  const affected = new Set([...byStudent.keys(), ...existingByStudent.keys()]);

  for (const studentId of affected) {
    const mark = resolveCountingAttempt(attemptSummaries(byStudent.get(studentId) ?? []), assignment.attemptScoring);
    const current = existingByStudent.get(studentId);
    if (mark.state !== "final") {
      if (current) {
        await tx.schoolExamResult.delete({ where: { id: current.id } });
        await recordEvent(tx, { organizationId, assignmentId, actorId: actorUserId, action: "gradebook_removed", previousValue: `${current.marks.toFixed(2)} / ${exam.totalMarks.toFixed(2)}`, newValue: mark.state === "pending" ? "Pending review" : null, note: `Student ${studentId}` });
      }
      continue;
    }
    const marks = new Prisma.Decimal(scaleToExamMarks(mark.score, mark.maxScore, exam.totalMarks.toFixed(2)));
    if (current && current.marks.equals(marks)) continue;
    const percent = marks.div(exam.totalMarks).times(100).toNumber();
    const band = resolveGradeFromScale(gradingScale, percent);
    await tx.schoolExamResult.upsert({
      where: { examId_studentId: { examId: exam.id, studentId } },
      update: { marks, grade: band?.grade ?? null, remark: band?.remark ?? null },
      create: { organizationId, examId: exam.id, studentId, classId: assignment.classId, subjectId: assignment.subjectId, marks, grade: band?.grade ?? null, remark: band?.remark ?? null },
    });
    await recordEvent(tx, { organizationId, assignmentId, submissionId: mark.attempt.id, actorId: actorUserId, action: "gradebook_recorded", previousValue: current ? `${current.marks.toFixed(2)} / ${exam.totalMarks.toFixed(2)}` : null, newValue: `${marks.toFixed(2)} / ${exam.totalMarks.toFixed(2)}` });
  }
  return { written: true };
}

/** Existing exams this assignment could feed: same year, term, and subject, still accepting results, with no results yet, and not linked elsewhere. */
export async function listGradebookExamCandidates(organizationId: string, assignmentId: string) {
  const assignment = await db.schoolAssignment.findFirst({ where: { id: assignmentId, organizationId } });
  if (!assignment) return [];
  const exams = await db.schoolExam.findMany({
    where: {
      organizationId,
      academicYearId: assignment.academicYearId,
      termId: assignment.termId,
      subjectId: assignment.subjectId,
      status: { in: [...EDITABLE_EXAM_STATUSES] },
      OR: [{ assignment: null }, { assignment: { id: assignment.id } }],
    },
    include: { _count: { select: { results: true } } },
    orderBy: { name: "asc" },
  });
  return exams.filter((exam) => exam._count.results === 0 || assignment.gradebookExamId === exam.id);
}

/** Weight share of an exam among every exam in the same term and subject, for the teacher's explanation. */
export async function describeGradebookWeight(organizationId: string, examId: string) {
  const exam = await db.schoolExam.findFirst({ where: { id: examId, organizationId } });
  if (!exam) return null;
  const siblings = await db.schoolExam.findMany({ where: { organizationId, termId: exam.termId, subjectId: exam.subjectId }, select: { id: true, name: true, weight: true, status: true } });
  const totalWeight = siblings.reduce((sum, sibling) => sum.plus(sibling.weight), new Prisma.Decimal(0));
  return {
    exam,
    siblings,
    sharePercent: totalWeight.gt(0) ? exam.weight.div(totalWeight).times(100).toDecimalPlaces(1).toNumber() : null,
  };
}

/**
 * Turns the cumulative-record opt-in on (linking one existing, unpublished
 * exam) or off (removing every result the assignment wrote). Off is refused
 * once the linked exam is published, because that would silently change a
 * record families can already see. Every change is written to the
 * assignment history and the audit log with the teacher's note.
 */
export async function setSchoolAssignmentGradebookInclusion(organizationId: string, actorUserId: string, assignmentId: string, input: { include: boolean; examId?: string | null; note?: string | null }) {
  await assertAvailable(organizationId);
  const assignment = await loadStaffAssignment(organizationId, actorUserId, assignmentId);
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`school-assignment-gradebook:${assignment.id}`}))`;
    const fresh = await tx.schoolAssignment.findFirst({ where: { id: assignment.id, organizationId }, include: { gradebookExam: true } });
    if (!fresh) throw new SchoolNotFoundError("Assignment not found.");

    if (input.include) {
      if (!input.examId) throw new SchoolStateError("Choose the exam this assignment should count towards.", "exam-required");
      if (fresh.includeInGradebook && fresh.gradebookExamId === input.examId) return fresh;
      if (fresh.includeInGradebook) throw new SchoolStateError("Remove the current cumulative-record link before choosing a different exam.", "assignment-included");
      const exam = await tx.schoolExam.findFirst({ where: { id: input.examId, organizationId }, include: { assignment: true, _count: { select: { results: true } } } });
      if (!exam) throw new SchoolNotFoundError("Exam not found.");
      if (exam.academicYearId !== fresh.academicYearId || exam.termId !== fresh.termId || exam.subjectId !== fresh.subjectId) throw new SchoolStateError("The exam must be in the same academic year, term, and subject as the assignment.", "exam-mismatch");
      if (!(EDITABLE_EXAM_STATUSES as readonly string[]).includes(exam.status)) throw new SchoolStateError("That exam is already published or closed. Choose an exam that still accepts results.", "exam-locked");
      if (exam.assignment && exam.assignment.id !== fresh.id) throw new SchoolStateError("That exam already takes its results from another assignment.", "exam-linked");
      if (exam._count.results > 0) throw new SchoolStateError("That exam already has results entered by hand. Choose an exam with no results so nothing is overwritten.", "exam-has-results");
      const updated = await tx.schoolAssignment.update({ where: { id: fresh.id }, data: { includeInGradebook: true, gradebookExamId: exam.id } });
      await recordEvent(tx, { organizationId, assignmentId: fresh.id, actorId: actorUserId, action: "inclusion_changed", previousValue: "Excluded", newValue: `Included in ${exam.name}`, note: input.note ?? null });
      await syncGradebookForAssignment(tx, organizationId, actorUserId, fresh.id);
      return updated;
    }

    if (!fresh.includeInGradebook) return fresh;
    if (fresh.gradebookExam && !(EDITABLE_EXAM_STATUSES as readonly string[]).includes(fresh.gradebookExam.status)) {
      throw new SchoolStateError("The linked exam is already published, so these marks are part of the released record and cannot be removed here.", "exam-locked");
    }
    const removed = fresh.gradebookExamId ? await tx.schoolExamResult.deleteMany({ where: { organizationId, examId: fresh.gradebookExamId } }) : { count: 0 };
    const updated = await tx.schoolAssignment.update({ where: { id: fresh.id }, data: { includeInGradebook: false, gradebookExamId: null } });
    await recordEvent(tx, { organizationId, assignmentId: fresh.id, actorId: actorUserId, action: "inclusion_changed", previousValue: `Included in ${fresh.gradebookExam?.name ?? "exam"}`, newValue: `Excluded (${removed.count} result${removed.count === 1 ? "" : "s"} removed)`, note: input.note ?? null });
    return updated;
  });
}

// ---------------------------------------------------------------------------
// Teacher: review

export async function reviewSchoolAssignmentSubmission(
  organizationId: string,
  actorUserId: string,
  submissionId: string,
  input: { marks: Record<string, { awarded?: string | null; feedback?: string | null }>; feedback: string | null; note?: string | null },
) {
  await assertAvailable(organizationId);
  const submission = await db.schoolAssignmentSubmission.findFirst({ where: { id: submissionId, organizationId }, include: { version: true } });
  if (!submission) throw new SchoolNotFoundError("Submission not found.");
  const assignment = await loadStaffAssignment(organizationId, actorUserId, submission.assignmentId);
  if (assignment.status === "GRADED") throw new SchoolStateError("Reopen the assignment before changing a mark.", "assignment-locked");
  const questions = readVersionQuestions(submission.version.questions);
  const result = wrapDefinitionError(() => applyTeacherMarks(questions, submission.questionResults as unknown as QuestionResultMap, input.marks));

  return db.$transaction(async (tx) => {
    const previousScore = submission.score ? submission.score.toFixed(2) : null;
    const updated = await tx.schoolAssignmentSubmission.update({
      where: { id: submission.id },
      data: {
        questionResults: result.questionResults as unknown as Prisma.InputJsonValue,
        score: result.score ? new Prisma.Decimal(result.score) : null,
        gradingStatus: result.complete ? "REVIEWED" : "PENDING_REVIEW",
        feedback: input.feedback?.trim() || null,
        reviewedById: actorUserId,
        reviewedAt: new Date(),
      },
    });
    if (previousScore !== result.score || submission.gradingStatus !== updated.gradingStatus) {
      await recordEvent(tx, { organizationId, assignmentId: assignment.id, submissionId: submission.id, actorId: actorUserId, action: "grade_changed", previousValue: previousScore ? `${previousScore} / ${submission.maxScore.toFixed(2)}` : "Pending review", newValue: result.score ? `${result.score} / ${submission.maxScore.toFixed(2)}` : "Pending review", note: input.note ?? null });
    } else {
      await recordEvent(tx, { organizationId, assignmentId: assignment.id, submissionId: submission.id, actorId: actorUserId, action: "feedback_updated", note: input.note ?? null });
    }
    await syncGradebookForAssignment(tx, organizationId, actorUserId, assignment.id, [submission.studentId]);
    return updated;
  });
}

// ---------------------------------------------------------------------------
// Teacher: reads

export async function listSchoolAssignmentsForStaff(organizationId: string, actorUserId: string, filters: { classId?: string; status?: string } = {}) {
  await assertAvailable(organizationId);
  const scope = await resolveTeacherClassScope(organizationId, actorUserId);
  const classFilter = scope ? { classId: { in: [...scope].filter((id) => !filters.classId || id === filters.classId) } } : filters.classId ? { classId: filters.classId } : {};
  return db.schoolAssignment.findMany({
    where: { organizationId, ...classFilter, ...(filters.status ? { status: filters.status as never } : {}) },
    include: {
      class: { select: { id: true, name: true } },
      subject: { select: { id: true, name: true } },
      term: { select: { id: true, name: true } },
      currentVersion: { select: { version: true, maxScore: true } },
      gradebookExam: { select: { id: true, name: true, status: true } },
      _count: { select: { questions: true, submissions: true } },
      submissions: { where: { gradingStatus: "PENDING_REVIEW" }, select: { id: true } },
    },
    orderBy: [{ dueAt: "desc" }, { createdAt: "desc" }],
    take: 200,
  });
}

export type StudentMarkRow = {
  studentId: string;
  admissionNumber: string;
  firstName: string;
  lastName: string;
  attempts: number;
  mark: MarkState;
  /** What the cumulative record currently shows for this student. */
  gradebook: "excluded" | "included" | "pending" | "not-recorded" | "exam-locked" | "none";
  gradebookMarks: string | null;
};

export async function getSchoolAssignmentForStaff(organizationId: string, actorUserId: string, assignmentId: string) {
  await assertAvailable(organizationId);
  await loadStaffAssignment(organizationId, actorUserId, assignmentId);
  const assignment = await db.schoolAssignment.findFirst({
    where: { id: assignmentId, organizationId },
    include: {
      class: true,
      subject: true,
      term: { include: { academicYear: true } },
      currentVersion: true,
      gradebookExam: true,
      questions: { orderBy: [{ position: "asc" }, { createdAt: "asc" }] },
      versions: { select: { id: true, version: true, publishedAt: true, maxScore: true }, orderBy: { version: "desc" } },
      events: { orderBy: { createdAt: "desc" }, take: 60 },
    },
  });
  if (!assignment) throw new SchoolNotFoundError("Assignment not found.");

  const [enrollments, submissions, examResults] = await Promise.all([
    db.schoolEnrollment.findMany({ where: { organizationId, classId: assignment.classId, academicYearId: assignment.academicYearId, status: "ACTIVE" }, include: { student: true } }),
    db.schoolAssignmentSubmission.findMany({
      where: { organizationId, assignmentId },
      include: { student: { select: { id: true, firstName: true, lastName: true, admissionNumber: true } }, version: { select: { version: true } } },
      orderBy: [{ submittedAt: "desc" }],
    }),
    assignment.gradebookExamId ? db.schoolExamResult.findMany({ where: { organizationId, examId: assignment.gradebookExamId } }) : Promise.resolve([]),
  ]);

  const examEditable = assignment.gradebookExam ? (EDITABLE_EXAM_STATUSES as readonly string[]).includes(assignment.gradebookExam.status) : false;
  const resultByStudent = new Map(examResults.map((result) => [result.studentId, result]));
  const submissionsByStudent = new Map<string, typeof submissions>();
  for (const submission of submissions) submissionsByStudent.set(submission.studentId, [...(submissionsByStudent.get(submission.studentId) ?? []), submission]);

  const students = new Map(enrollments.map((enrollment) => [enrollment.studentId, enrollment.student]));
  // Students who submitted and later moved class still appear, so their work is never hidden from the teacher.
  for (const submission of submissions) if (!students.has(submission.studentId)) students.set(submission.studentId, submission.student as never);

  const roster: StudentMarkRow[] = [...students.values()]
    .map((student) => {
      const own = submissionsByStudent.get(student.id) ?? [];
      const mark = resolveCountingAttempt(attemptSummaries(own), assignment.attemptScoring);
      const recorded = resultByStudent.get(student.id);
      let gradebook: StudentMarkRow["gradebook"] = "excluded";
      if (assignment.includeInGradebook) {
        if (mark.state === "none") gradebook = "none";
        else if (mark.state === "pending") gradebook = "pending";
        else {
          const expected = assignment.gradebookExam ? scaleToExamMarks(mark.score, mark.maxScore, assignment.gradebookExam.totalMarks.toFixed(2)) : null;
          if (recorded && expected && recorded.marks.toFixed(2) === expected) gradebook = "included";
          else gradebook = examEditable ? "not-recorded" : "exam-locked";
        }
      }
      return {
        studentId: student.id,
        admissionNumber: student.admissionNumber,
        firstName: student.firstName,
        lastName: student.lastName,
        attempts: own.length,
        mark,
        gradebook,
        gradebookMarks: recorded ? recorded.marks.toFixed(2) : null,
      };
    })
    .sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName));

  return { assignment, submissions, roster, examEditable };
}

export async function getSchoolAssignmentSubmissionForStaff(organizationId: string, actorUserId: string, submissionId: string) {
  await assertAvailable(organizationId);
  const submission = await db.schoolAssignmentSubmission.findFirst({
    where: { id: submissionId, organizationId },
    include: {
      version: true,
      student: { select: { id: true, firstName: true, lastName: true, admissionNumber: true } },
      assignment: { include: { class: true, subject: true, term: true, gradebookExam: true } },
      events: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!submission) throw new SchoolNotFoundError("Submission not found.");
  await assertClassInScope(organizationId, actorUserId, submission.assignment.classId);
  return { submission, questions: readVersionQuestions(submission.version.questions).sort((a, b) => a.position - b.position) };
}

/** Teacher preview: the current working copy rendered exactly as students will see it, without answer keys. */
export async function getSchoolAssignmentPreview(organizationId: string, actorUserId: string, assignmentId: string) {
  await assertAvailable(organizationId);
  const assignment = await loadStaffAssignment(organizationId, actorUserId, assignmentId);
  const questions = await workingCopy(organizationId, assignment.id);
  const full = await db.schoolAssignment.findFirst({ where: { id: assignment.id, organizationId }, include: { class: true, subject: true, term: true } });
  return { assignment: full!, questions: toStudentQuestions(questions), maxScore: computeMaxScore(questions) };
}

// ---------------------------------------------------------------------------
// Student

async function resolveStudent(organizationId: string, userId: string) {
  const scope = await resolveSchoolPortalScope(organizationId, userId);
  if (!scope || scope.type !== "student") throw new SchoolStateError("Assignments are available to student portal accounts.", "not-a-student");
  const student = await db.schoolStudent.findFirst({ where: { id: scope.studentId, organizationId, status: "ACTIVE" } });
  if (!student) throw new SchoolStateError("Your student record is not active.", "student-inactive");
  return student;
}

async function studentEnrollments(organizationId: string, studentId: string) {
  return db.schoolEnrollment.findMany({ where: { organizationId, studentId, status: "ACTIVE" }, select: { classId: true, academicYearId: true } });
}

async function loadStudentAssignment(organizationId: string, studentId: string, assignmentId: string, tx: Tx | typeof db = db) {
  const enrollments = await tx.schoolEnrollment.findMany({ where: { organizationId, studentId, status: "ACTIVE" }, select: { classId: true, academicYearId: true } });
  const assignment = await tx.schoolAssignment.findFirst({
    where: {
      id: assignmentId,
      organizationId,
      status: { in: ["PUBLISHED", "CLOSED", "GRADED"] },
      OR: enrollments.length > 0 ? enrollments.map((enrollment) => ({ classId: enrollment.classId, academicYearId: enrollment.academicYearId })) : [{ id: "__none__" }],
    },
    include: { currentVersion: true, subject: true, class: true, term: true },
  });
  // A student who already submitted keeps read access to their own work after a class change.
  if (!assignment) {
    const own = await tx.schoolAssignmentSubmission.findFirst({ where: { organizationId, assignmentId, studentId }, select: { id: true } });
    if (!own) throw new SchoolNotFoundError("Assignment not found.");
    const fallback = await tx.schoolAssignment.findFirst({ where: { id: assignmentId, organizationId, status: { in: ["PUBLISHED", "CLOSED", "GRADED"] } }, include: { currentVersion: true, subject: true, class: true, term: true } });
    if (!fallback) throw new SchoolNotFoundError("Assignment not found.");
    return { assignment: fallback, enrolled: false };
  }
  return { assignment, enrolled: true };
}

export async function listSchoolAssignmentsForStudent(organizationId: string, userId: string, now = new Date()) {
  await assertAvailable(organizationId);
  const student = await resolveStudent(organizationId, userId);
  const enrollments = await studentEnrollments(organizationId, student.id);
  if (enrollments.length === 0) return { student, assignments: [] };
  const assignments = await db.schoolAssignment.findMany({
    where: { organizationId, status: { in: ["PUBLISHED", "CLOSED", "GRADED"] }, OR: enrollments.map((enrollment) => ({ classId: enrollment.classId, academicYearId: enrollment.academicYearId })) },
    include: {
      subject: { select: { name: true } },
      currentVersion: { select: { maxScore: true } },
      submissions: { where: { studentId: student.id }, select: { id: true, attemptNumber: true, gradingStatus: true, score: true, maxScore: true, submittedAt: true } },
    },
    orderBy: { dueAt: "asc" },
    take: 200,
  });
  return {
    student,
    assignments: assignments.map((assignment) => {
      const { submissions, ...rest } = assignment;
      const released = isResultReleased({ feedbackRelease: assignment.feedbackRelease, status: assignment.status, dueAt: assignment.dueAt, now });
      const mark = resolveCountingAttempt(attemptSummaries(submissions), assignment.attemptScoring);
      return {
        ...rest,
        availability: studentAvailability({ status: assignment.status, availableFrom: assignment.availableFrom, dueAt: assignment.dueAt, allowLateSubmissions: assignment.allowLateSubmissions, now }),
        attemptsUsed: submissions.length,
        attemptsRemaining: Math.max(0, assignment.maxAttempts - submissions.length),
        released,
        // Never hand a score to the page before it is released.
        mark: released ? mark : mark.state === "none" ? mark : ({ state: "submitted" } as const),
      };
    }),
  };
}

export async function getSchoolAssignmentForStudent(organizationId: string, userId: string, assignmentId: string, now = new Date()) {
  await assertAvailable(organizationId);
  const student = await resolveStudent(organizationId, userId);
  const { assignment, enrolled } = await loadStudentAssignment(organizationId, student.id, assignmentId);
  const submissions = await db.schoolAssignmentSubmission.findMany({ where: { organizationId, assignmentId: assignment.id, studentId: student.id }, include: { version: true }, orderBy: { attemptNumber: "asc" } });
  const availability = enrolled
    ? studentAvailability({ status: assignment.status, availableFrom: assignment.availableFrom, dueAt: assignment.dueAt, allowLateSubmissions: assignment.allowLateSubmissions, now })
    : "closed";
  const released = isResultReleased({ feedbackRelease: assignment.feedbackRelease, status: assignment.status, dueAt: assignment.dueAt, now });
  const showAnswers = released && assignment.showCorrectAnswers;
  const canStart = availability !== "scheduled" && availability !== "closed" && submissions.length < assignment.maxAttempts && Boolean(assignment.currentVersion);
  const versionQuestions = assignment.currentVersion ? readVersionQuestions(assignment.currentVersion.questions) : [];

  return {
    student: { id: student.id, firstName: student.firstName, lastName: student.lastName },
    assignment: {
      id: assignment.id,
      title: assignment.title,
      instructions: assignment.instructions,
      subjectName: assignment.subject.name,
      className: assignment.class.name,
      termName: assignment.term.name,
      availableFrom: assignment.availableFrom,
      dueAt: assignment.dueAt,
      allowLateSubmissions: assignment.allowLateSubmissions,
      maxAttempts: assignment.maxAttempts,
      attemptScoring: assignment.attemptScoring,
      feedbackRelease: assignment.feedbackRelease,
      status: assignment.status,
      versionId: assignment.currentVersion?.id ?? null,
      maxScore: assignment.currentVersion?.maxScore.toFixed(2) ?? null,
    },
    availability,
    canStart,
    attemptsRemaining: Math.max(0, assignment.maxAttempts - submissions.length),
    // Only rendered while the student can answer; never includes answer keys.
    questions: canStart ? toStudentQuestions(versionQuestions) : [],
    released,
    mark: released ? resolveCountingAttempt(attemptSummaries(submissions), assignment.attemptScoring) : null,
    attempts: submissions.map((submission) => {
      const questions = readVersionQuestions(submission.version.questions).sort((a, b) => a.position - b.position);
      const results = submission.questionResults as unknown as QuestionResultMap;
      const answers = submission.answers as unknown as AnswerMap;
      return {
        id: submission.id,
        attemptNumber: submission.attemptNumber,
        submittedAt: submission.submittedAt,
        late: submission.late,
        gradingStatus: submission.gradingStatus,
        score: released && submission.score ? submission.score.toFixed(2) : null,
        maxScore: submission.maxScore.toFixed(2),
        feedback: released ? submission.feedback : null,
        questions: toStudentQuestions(questions).map((question) => {
          const source = questions.find((candidate) => candidate.id === question.id)!;
          return {
            ...question,
            answer: answers[question.id] ?? null,
            awarded: released ? results[question.id]?.awarded ?? null : null,
            correct: released ? results[question.id]?.correct ?? null : null,
            feedback: released ? results[question.id]?.feedback ?? null : null,
            correctOptionIds: showAnswers && (source.type === "SINGLE_CHOICE" || source.type === "MULTI_SELECT" || source.type === "TRUE_FALSE") ? source.correctOptionIds : null,
            numericAnswer: showAnswers && source.type === "NUMERIC" ? source.numericAnswer : null,
          };
        }),
      };
    }),
  };
}

export interface SubmitAttemptInput {
  versionId: string;
  idempotencyKey: string;
  answers: AnswerMap;
}

/**
 * Records one attempt. Safe to retry: the same idempotency key always
 * resolves to the same submission. Two different concurrent submits for the
 * same student are serialized by an advisory lock and the
 * (assignment, student, attemptNumber) unique constraint, so attempts can
 * never exceed the limit or be duplicated. Marking happens here, on the
 * server, against the version the student was shown.
 */
export async function submitSchoolAssignmentAttempt(organizationId: string, userId: string, assignmentId: string, input: SubmitAttemptInput, now = new Date()) {
  await assertAvailable(organizationId);
  if (!/^[A-Za-z0-9_-]{16,80}$/.test(input.idempotencyKey)) throw new SchoolStateError("This form has expired. Reload the page and try again.", "invalid-key");
  const student = await resolveStudent(organizationId, userId);

  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`school-assignment-submit:${assignmentId}:${student.id}`}))`;
    const duplicate = await tx.schoolAssignmentSubmission.findUnique({ where: { assignmentId_studentId_idempotencyKey: { assignmentId, studentId: student.id, idempotencyKey: input.idempotencyKey } } });
    if (duplicate) {
      if (duplicate.organizationId !== organizationId) throw new SchoolNotFoundError("Assignment not found.");
      return { submission: duplicate, duplicate: true };
    }

    const { assignment, enrolled } = await loadStudentAssignment(organizationId, student.id, assignmentId, tx);
    if (!enrolled) throw new SchoolStateError("This assignment is not set for your class.", "not-enrolled");
    const availability = studentAvailability({ status: assignment.status, availableFrom: assignment.availableFrom, dueAt: assignment.dueAt, allowLateSubmissions: assignment.allowLateSubmissions, now });
    if (availability === "scheduled") throw new SchoolStateError("This assignment is not open yet.", "not-open");
    if (availability === "closed") throw new SchoolStateError("This assignment is closed for submissions.", "closed");
    if (!assignment.currentVersion || assignment.currentVersion.id !== input.versionId) {
      throw new SchoolStateError("Your teacher updated this assignment while you were working. Reload it to see the latest questions. Your answers were not submitted.", "version-changed");
    }
    const used = await tx.schoolAssignmentSubmission.count({ where: { organizationId, assignmentId, studentId: student.id } });
    if (used >= assignment.maxAttempts) throw new SchoolStateError("You have used every attempt for this assignment.", "no-attempts");

    const questions = readVersionQuestions(assignment.currentVersion.questions);
    const answers = normalizeAnswers(questions, input.answers);
    const grade = gradeSubmission(questions, answers);
    const submission = await tx.schoolAssignmentSubmission.create({
      data: {
        organizationId,
        assignmentId,
        versionId: assignment.currentVersion.id,
        studentId: student.id,
        attemptNumber: used + 1,
        idempotencyKey: input.idempotencyKey,
        answers: answers as unknown as Prisma.InputJsonValue,
        submittedAt: now,
        late: availability === "late",
        gradingStatus: grade.requiresReview ? "PENDING_REVIEW" : "AUTO_GRADED",
        autoScore: new Prisma.Decimal(grade.autoScore),
        score: grade.score ? new Prisma.Decimal(grade.score) : null,
        maxScore: new Prisma.Decimal(grade.maxScore),
        questionResults: grade.questionResults as unknown as Prisma.InputJsonValue,
      },
    });
    await recordEvent(tx, {
      organizationId,
      assignmentId,
      submissionId: submission.id,
      actorId: userId,
      action: grade.requiresReview ? "submitted" : "auto_graded",
      newValue: grade.requiresReview ? `Auto-marked ${grade.autoScore}, rest pending review` : `${grade.score} / ${grade.maxScore}`,
    });
    if (assignment.includeInGradebook) await syncGradebookForAssignment(tx, organizationId, null, assignmentId, [student.id]);
    return { submission, duplicate: false };
  });
}
