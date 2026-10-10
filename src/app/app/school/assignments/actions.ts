"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { SchoolAssignmentQuestionType } from "@prisma/client";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { isSchoolPortalGranted } from "@/lib/platform-communications";
import { zonedDateTime } from "@/lib/timezone";
import { cuid, longText, parseWithSchema, shortText } from "@/lib/validation";
import { SchoolNotFoundError, SchoolStateError } from "@/modules/school/service";
import {
  addSchoolAssignmentQuestion,
  closeSchoolAssignment,
  createSchoolAssignment,
  deleteSchoolAssignmentDraft,
  deleteSchoolAssignmentQuestion,
  markSchoolAssignmentGraded,
  moveSchoolAssignmentQuestion,
  publishSchoolAssignment,
  reopenSchoolAssignment,
  reviewSchoolAssignmentSubmission,
  setSchoolAssignmentGradebookInclusion,
  submitSchoolAssignmentAttempt,
  updateSchoolAssignmentQuestion,
  updateSchoolAssignmentSettings,
  type QuestionInput,
} from "@/modules/school/assignments-service";
import { MAX_OPTIONS, type AnswerMap } from "@/modules/school/assignment-grading";

/**
 * Server Actions for School Assignments & Assessments. Every action
 * re-validates the session, School module access, and the relevant School
 * permission here; the service layer then re-checks the paid add-on grant,
 * the teacher's class scope, or the student's own portal link. Reaching an
 * action by direct POST never skips any of those checks.
 */

const LIST_PATH = "/app/school/assignments";
const OPTION_IDS = "abcdefgh".split("").slice(0, MAX_OPTIONS);
const clean = (value: FormDataEntryValue | null) => {
  const text = String(value ?? "").trim();
  return text || null;
};

async function staff(path: string) {
  const tenant = await requireModuleAccess("school");
  if (!hasPermission(tenant, PERMISSIONS.SCHOOL_EXAMS_MANAGE)) redirect(`${path}?error=forbidden`);
  return tenant;
}

async function student(path: string) {
  const tenant = await requireModuleAccess("school");
  if (!hasPermission(tenant, PERMISSIONS.SCHOOL_PORTAL_VIEW) || !(await isSchoolPortalGranted(tenant.organizationId))) redirect(`${path}?error=forbidden`);
  return tenant;
}

const fail = (path: string, error: unknown): never => {
  if (error instanceof SchoolStateError) redirect(`${path}?error=state-${error.code}`);
  if (error instanceof SchoolNotFoundError) redirect(`${path}?error=not-found`);
  throw error;
};

const detailPath = (assignmentId: string) => `${LIST_PATH}/${encodeURIComponent(assignmentId)}`;

const settingsSchema = z.object({
  classId: cuid,
  subjectId: cuid,
  termId: cuid,
  title: shortText,
  instructions: longText.nullable(),
  availableFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
  dueAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
  allowLateSubmissions: z.boolean(),
  maxAttempts: z.coerce.number().int().min(1).max(10),
  attemptScoring: z.enum(["HIGHEST", "LATEST"]),
  feedbackRelease: z.enum(["IMMEDIATE", "AFTER_DUE", "ON_RELEASE"]),
  showCorrectAnswers: z.boolean(),
});

function readSettings(formData: FormData, timeZone: string) {
  const parsed = parseWithSchema(settingsSchema, {
    classId: clean(formData.get("classId")) ?? "",
    subjectId: clean(formData.get("subjectId")) ?? "",
    termId: clean(formData.get("termId")) ?? "",
    title: clean(formData.get("title")) ?? "",
    instructions: clean(formData.get("instructions")),
    availableFrom: clean(formData.get("availableFrom")) ?? "",
    dueAt: clean(formData.get("dueAt")) ?? "",
    allowLateSubmissions: formData.get("allowLateSubmissions") === "on",
    maxAttempts: clean(formData.get("maxAttempts")) ?? "1",
    attemptScoring: clean(formData.get("attemptScoring")) ?? "HIGHEST",
    feedbackRelease: clean(formData.get("feedbackRelease")) ?? "ON_RELEASE",
    showCorrectAnswers: formData.get("showCorrectAnswers") === "on",
  });
  if (!parsed.success) return null;
  try {
    return { ...parsed.data, availableFrom: zonedDateTime(parsed.data.availableFrom, timeZone), dueAt: zonedDateTime(parsed.data.dueAt, timeZone) };
  } catch {
    return null;
  }
}

export async function createAssignmentAction(formData: FormData) {
  const tenant = await staff(LIST_PATH);
  const input = readSettings(formData, tenant.organization.timezone ?? "UTC");
  if (!input) redirect(`${LIST_PATH}?error=invalid`);
  let assignmentId = "";
  try {
    assignmentId = (await createSchoolAssignment(tenant.organizationId, tenant.userId, input)).id;
  } catch (error) {
    fail(LIST_PATH, error);
  }
  revalidatePath(LIST_PATH);
  redirect(`${detailPath(assignmentId)}?saved=created`);
}

export async function updateAssignmentSettingsAction(formData: FormData) {
  const assignmentId = clean(formData.get("assignmentId")) ?? "";
  const path = detailPath(assignmentId);
  const tenant = await staff(path);
  const input = readSettings(formData, tenant.organization.timezone ?? "UTC");
  if (!assignmentId || !input) redirect(`${path}?error=invalid`);
  try {
    await updateSchoolAssignmentSettings(tenant.organizationId, tenant.userId, assignmentId, input);
  } catch (error) {
    fail(path, error);
  }
  revalidatePath(path);
  redirect(`${path}?saved=settings`);
}

export async function deleteAssignmentDraftAction(formData: FormData) {
  const assignmentId = clean(formData.get("assignmentId")) ?? "";
  const path = detailPath(assignmentId);
  const tenant = await staff(path);
  try {
    await deleteSchoolAssignmentDraft(tenant.organizationId, tenant.userId, assignmentId);
  } catch (error) {
    fail(path, error);
  }
  revalidatePath(LIST_PATH);
  redirect(`${LIST_PATH}?saved=deleted`);
}

const questionTypes = ["SINGLE_CHOICE", "MULTI_SELECT", "TRUE_FALSE", "NUMERIC", "SHORT_TEXT", "ESSAY"] as const;

function readQuestion(formData: FormData): QuestionInput | null {
  const type = clean(formData.get("type"));
  if (!type || !(questionTypes as readonly string[]).includes(type)) return null;
  const prompt = clean(formData.get("prompt"));
  const points = clean(formData.get("points"));
  if (!prompt || prompt.length > 5000 || !points || points.length > 12) return null;
  const options = OPTION_IDS.flatMap((id) => {
    const label = clean(formData.get(`option_${id}`));
    return label ? [{ id, label: label.slice(0, 500) }] : [];
  });
  const presentIds = new Set(options.map((option) => option.id));
  const correctOptionIds = type === "TRUE_FALSE"
    ? [clean(formData.get("trueFalse")) ?? ""].filter(Boolean)
    : formData.getAll("correct").map((value) => String(value)).filter((id) => presentIds.has(id));
  return {
    type: type as SchoolAssignmentQuestionType,
    prompt,
    points,
    options,
    correctOptionIds,
    numericAnswer: clean(formData.get("numericAnswer")),
    numericTolerance: clean(formData.get("numericTolerance")),
    markingGuide: clean(formData.get("markingGuide"))?.slice(0, 5000) ?? null,
  };
}

export async function saveQuestionAction(formData: FormData) {
  const assignmentId = clean(formData.get("assignmentId")) ?? "";
  const questionId = clean(formData.get("questionId"));
  const path = detailPath(assignmentId);
  const tenant = await staff(path);
  const input = readQuestion(formData);
  if (!assignmentId || !input) redirect(`${path}?error=invalid#questions`);
  try {
    if (questionId) await updateSchoolAssignmentQuestion(tenant.organizationId, tenant.userId, questionId, input);
    else await addSchoolAssignmentQuestion(tenant.organizationId, tenant.userId, assignmentId, input);
  } catch (error) {
    fail(path, error);
  }
  revalidatePath(path);
  redirect(`${path}?saved=question#questions`);
}

export async function deleteQuestionAction(formData: FormData) {
  const assignmentId = clean(formData.get("assignmentId")) ?? "";
  const questionId = clean(formData.get("questionId")) ?? "";
  const path = detailPath(assignmentId);
  const tenant = await staff(path);
  try {
    await deleteSchoolAssignmentQuestion(tenant.organizationId, tenant.userId, questionId);
  } catch (error) {
    fail(path, error);
  }
  revalidatePath(path);
  redirect(`${path}?saved=question#questions`);
}

export async function moveQuestionAction(formData: FormData) {
  const assignmentId = clean(formData.get("assignmentId")) ?? "";
  const questionId = clean(formData.get("questionId")) ?? "";
  const direction = clean(formData.get("direction")) === "up" ? "up" : "down";
  const path = detailPath(assignmentId);
  const tenant = await staff(path);
  try {
    await moveSchoolAssignmentQuestion(tenant.organizationId, tenant.userId, questionId, direction);
  } catch (error) {
    fail(path, error);
  }
  revalidatePath(path);
  redirect(`${path}#questions`);
}

async function lifecycle(formData: FormData, run: (organizationId: string, userId: string, assignmentId: string) => Promise<unknown>, saved: string) {
  const assignmentId = clean(formData.get("assignmentId")) ?? "";
  const path = detailPath(assignmentId);
  const tenant = await staff(path);
  if (!assignmentId) redirect(`${path}?error=invalid`);
  try {
    await run(tenant.organizationId, tenant.userId, assignmentId);
  } catch (error) {
    fail(path, error);
  }
  revalidatePath(path);
  revalidatePath(LIST_PATH);
  redirect(`${path}?saved=${saved}`);
}

export async function publishAssignmentAction(formData: FormData) {
  await lifecycle(formData, publishSchoolAssignment, "published");
}
export async function closeAssignmentAction(formData: FormData) {
  await lifecycle(formData, closeSchoolAssignment, "closed");
}
export async function reopenAssignmentAction(formData: FormData) {
  await lifecycle(formData, reopenSchoolAssignment, "reopened");
}
export async function markAssignmentGradedAction(formData: FormData) {
  await lifecycle(formData, markSchoolAssignmentGraded, "graded");
}

export async function setGradebookInclusionAction(formData: FormData) {
  const assignmentId = clean(formData.get("assignmentId")) ?? "";
  const path = detailPath(assignmentId);
  const tenant = await staff(path);
  const include = clean(formData.get("include")) === "true";
  const examId = clean(formData.get("examId"));
  const note = clean(formData.get("note"))?.slice(0, 1000) ?? null;
  if (!assignmentId || (include && !examId)) redirect(`${path}?error=state-exam-required#gradebook`);
  try {
    await setSchoolAssignmentGradebookInclusion(tenant.organizationId, tenant.userId, assignmentId, { include, examId, note });
  } catch (error) {
    fail(path, error);
  }
  revalidatePath(path);
  revalidatePath("/app/school/exams");
  revalidatePath("/app/school/exams/broadsheet");
  redirect(`${path}?saved=${include ? "included" : "excluded"}#gradebook`);
}

export async function reviewSubmissionAction(formData: FormData) {
  const assignmentId = clean(formData.get("assignmentId")) ?? "";
  const submissionId = clean(formData.get("submissionId")) ?? "";
  const path = `${detailPath(assignmentId)}/submissions/${encodeURIComponent(submissionId)}`;
  const tenant = await staff(path);
  if (!assignmentId || !submissionId) redirect(`${path}?error=invalid`);
  const marks: Record<string, { awarded?: string | null; feedback?: string | null }> = {};
  for (const [key, value] of formData.entries()) {
    const award = /^award_(.+)$/.exec(key);
    if (award) marks[award[1]] = { ...marks[award[1]], awarded: clean(value) };
    const feedback = /^feedback_(.+)$/.exec(key);
    if (feedback) marks[feedback[1]] = { ...marks[feedback[1]], feedback: clean(value)?.slice(0, 2000) ?? null };
  }
  try {
    await reviewSchoolAssignmentSubmission(tenant.organizationId, tenant.userId, submissionId, {
      marks,
      feedback: clean(formData.get("feedback"))?.slice(0, 5000) ?? null,
      note: clean(formData.get("note"))?.slice(0, 1000) ?? null,
    });
  } catch (error) {
    fail(path, error);
  }
  revalidatePath(path);
  revalidatePath(detailPath(assignmentId));
  redirect(`${path}?saved=1`);
}

// --- Student ---------------------------------------------------------------

export async function submitAssignmentAttemptAction(formData: FormData) {
  const assignmentId = clean(formData.get("assignmentId")) ?? "";
  const path = `/app/school/portal/assignments/${encodeURIComponent(assignmentId)}`;
  const tenant = await student(path);
  const versionId = clean(formData.get("versionId")) ?? "";
  const idempotencyKey = clean(formData.get("idempotencyKey")) ?? "";
  if (!assignmentId || !versionId || !idempotencyKey) redirect(`${path}?error=invalid`);
  const answers: AnswerMap = {};
  for (const [key, value] of formData.entries()) {
    const choice = /^q_(.+)_choice$/.exec(key);
    if (choice) {
      answers[choice[1]] = { ...answers[choice[1]], optionIds: [...(answers[choice[1]]?.optionIds ?? []), String(value)] };
      continue;
    }
    const text = /^q_(.+)_value$/.exec(key);
    if (text) answers[text[1]] = { ...answers[text[1]], value: String(value) };
  }
  let duplicate = false;
  try {
    duplicate = (await submitSchoolAssignmentAttempt(tenant.organizationId, tenant.userId, assignmentId, { versionId, idempotencyKey, answers })).duplicate;
  } catch (error) {
    fail(path, error);
  }
  revalidatePath(path);
  revalidatePath("/app/school/portal/assignments");
  redirect(`${path}?saved=${duplicate ? "already" : "submitted"}`);
}
