import "server-only";

import { Prisma, type SchoolAnnouncementAudience, type SchoolConversationStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { logAuditEvent } from "@/lib/audit";
import { isSchoolGuardianMessagingGranted, isSchoolPortalGranted } from "@/lib/platform-communications";
import { resolveTeacherClassScope } from "./service";
import { resolveSchoolPortalScope } from "./portal-service";

/**
 * School in-app communications: direct conversations between authorized
 * staff and one guardian about one student, and school announcements. No
 * SMS, email, WhatsApp, or push channel is involved.
 *
 * Every read and write is authorized here on the server from the signed-in
 * user's own records, never from client-supplied scope:
 *
 * - Staff need the School messaging permission (decided by the caller from
 *   the tenant's permissions and passed in as `StaffActor`). A staff member
 *   assigned to classes (SchoolClassTeacher) only reaches students actively
 *   enrolled in those classes; staff with no assignments are unrestricted,
 *   matching resolveTeacherClassScope() for attendance and results.
 * - A guardian is resolved from their own portal login
 *   (resolveSchoolPortalScope) and reaches a conversation only while it is
 *   theirs and the student is still linked to them.
 * - Direct conversations need both paid add-ons: the Parent and Student
 *   portal (so guardians can sign in) and Guardian messaging.
 *   Announcements need only School, with guardians reading them in the
 *   portal.
 */

export class SchoolCommunicationError extends Error {
  constructor(message: string, readonly code: "forbidden" | "not-found" | "invalid" | "unavailable" | "closed") {
    super(message);
  }
}

export type StaffActor = {
  organizationId: string;
  userId: string;
  canViewSchool: boolean;
  canManageMessages: boolean;
  canPublishAnnouncements: boolean;
};

const SUBJECT_MIN = 2;
const SUBJECT_MAX = 120;
const BODY_MAX = 4000;
const REQUEST_ID = /^[A-Za-z0-9-]{8,64}$/;
const HISTORY_LIMIT = 200;
const LIST_LIMIT = 100;

function cleanText(value: string, label: string, min: number, max: number) {
  const text = value.replace(/\r\n/g, "\n").trim();
  if (text.length < min) throw new SchoolCommunicationError(min > 1 ? `${label} must be at least ${min} characters.` : `${label} cannot be empty.`, "invalid");
  if (text.length > max) throw new SchoolCommunicationError(`${label} must be ${max} characters or fewer.`, "invalid");
  return text;
}
const cleanSubject = (value: string) => cleanText(value, "Subject", SUBJECT_MIN, SUBJECT_MAX).replace(/\s+/g, " ");
const cleanBody = (value: string) => cleanText(value, "Message", 1, BODY_MAX);
function cleanRequestId(value: string) {
  if (!REQUEST_ID.test(value)) throw new SchoolCommunicationError("The form expired. Reload the page and try again.", "invalid");
  return value;
}
const isUniqueViolation = (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

/** Both paid add-ons that direct guardian conversations depend on. */
export async function isGuardianMessagingAvailable(organizationId: string) {
  const [portal, messaging] = await Promise.all([isSchoolPortalGranted(organizationId), isSchoolGuardianMessagingGranted(organizationId)]);
  return portal && messaging;
}

async function requireMessagingAvailable(organizationId: string) {
  if (!(await isGuardianMessagingAvailable(organizationId))) throw new SchoolCommunicationError("Guardian messaging is not enabled for this school.", "unavailable");
}

async function displayName(userId: string) {
  const user = await db.user.findUnique({ where: { id: userId }, select: { name: true, email: true } });
  return (user?.name?.trim() || user?.email || "School staff").slice(0, 120);
}

// --- Staff scope --------------------------------------------------------------

/** Students a staff member may message about: null means every student in the organization. */
export async function staffStudentScope(organizationId: string, userId: string): Promise<Set<string> | null> {
  const classScope = await resolveTeacherClassScope(organizationId, userId);
  if (!classScope) return null;
  const enrollments = await db.schoolEnrollment.findMany({ where: { organizationId, classId: { in: [...classScope] }, status: "ACTIVE" }, select: { studentId: true } });
  return new Set(enrollments.map((enrollment) => enrollment.studentId));
}

function requireStaffMessaging(actor: StaffActor) {
  if (!actor.canManageMessages) throw new SchoolCommunicationError("Your role cannot send School messages.", "forbidden");
}

async function staffConversationOrThrow(actor: StaffActor, conversationId: string) {
  requireStaffMessaging(actor);
  await requireMessagingAvailable(actor.organizationId);
  const conversation = await db.schoolConversation.findFirst({ where: { id: conversationId, organizationId: actor.organizationId } });
  const scope = await staffStudentScope(actor.organizationId, actor.userId);
  // Out-of-scope and missing conversations look the same, so ids cannot be probed.
  if (!conversation || (scope && !scope.has(conversation.studentId))) throw new SchoolCommunicationError("Conversation not found.", "not-found");
  return conversation;
}

/** Students the staff member can start a conversation about, with guardians who have a portal account. */
export async function listMessageableStudents(actor: StaffActor) {
  requireStaffMessaging(actor);
  const scope = await staffStudentScope(actor.organizationId, actor.userId);
  const students = await db.schoolStudent.findMany({
    where: { organizationId: actor.organizationId, status: { in: ["ACTIVE", "SUSPENDED"] }, ...(scope ? { id: { in: [...scope] } } : {}), guardians: { some: { guardian: { userId: { not: null } } } } },
    select: {
      id: true, firstName: true, lastName: true, admissionNumber: true,
      guardians: { where: { guardian: { userId: { not: null } } }, select: { relationship: true, guardian: { select: { id: true, firstName: true, lastName: true } } } },
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    take: 500,
  });
  return students.map((student) => ({
    id: student.id,
    label: `${student.firstName} ${student.lastName} (${student.admissionNumber})`,
    guardians: student.guardians.map((link) => ({ id: link.guardian.id, label: `${link.guardian.firstName} ${link.guardian.lastName} (${link.relationship})` })),
  }));
}

async function unreadCounts(conversationIds: string[], userId: string) {
  if (!conversationIds.length) return new Map<string, number>();
  const states = await db.schoolConversationReadState.findMany({ where: { conversationId: { in: conversationIds }, userId }, select: { conversationId: true, lastReadAt: true } });
  const lastRead = new Map(states.map((state) => [state.conversationId, state.lastReadAt]));
  const counts = await Promise.all(conversationIds.map((conversationId) => db.schoolMessage.count({
    where: { conversationId, senderUserId: { not: userId }, ...(lastRead.has(conversationId) ? { createdAt: { gt: lastRead.get(conversationId)! } } : {}) },
  })));
  return new Map(conversationIds.map((id, index) => [id, counts[index]]));
}

const conversationListSelect = {
  id: true, subject: true, status: true, lastMessageAt: true,
  student: { select: { id: true, firstName: true, lastName: true, admissionNumber: true } },
  guardian: { select: { id: true, firstName: true, lastName: true } },
  messages: { orderBy: { createdAt: "desc" as const }, take: 1, select: { body: true, senderSide: true, senderName: true, createdAt: true } },
} satisfies Prisma.SchoolConversationSelect;

function preview(text: string | undefined) {
  if (!text) return "";
  const single = text.replace(/\s+/g, " ").trim();
  return single.length > 120 ? `${single.slice(0, 117)}...` : single;
}

export async function listStaffConversations(actor: StaffActor, filter: { status?: SchoolConversationStatus } = {}) {
  requireStaffMessaging(actor);
  await requireMessagingAvailable(actor.organizationId);
  const scope = await staffStudentScope(actor.organizationId, actor.userId);
  const conversations = await db.schoolConversation.findMany({
    where: { organizationId: actor.organizationId, ...(scope ? { studentId: { in: [...scope] } } : {}), ...(filter.status ? { status: filter.status } : {}) },
    select: conversationListSelect,
    orderBy: { lastMessageAt: "desc" },
    take: LIST_LIMIT,
  });
  const unread = await unreadCounts(conversations.map((conversation) => conversation.id), actor.userId);
  return conversations.map((conversation) => ({ ...conversation, preview: preview(conversation.messages[0]?.body), lastSender: conversation.messages[0]?.senderName ?? null, unread: unread.get(conversation.id) ?? 0 }));
}

async function markConversationRead(organizationId: string, conversationId: string, userId: string) {
  const now = new Date();
  await db.schoolConversationReadState.upsert({ where: { conversationId_userId: { conversationId, userId } }, update: { lastReadAt: now }, create: { organizationId, conversationId, userId, lastReadAt: now } });
}

async function conversationDetail(organizationId: string, conversationId: string) {
  const conversation = await db.schoolConversation.findFirstOrThrow({
    where: { id: conversationId, organizationId },
    select: {
      id: true, subject: true, status: true, createdAt: true, lastMessageAt: true, startedBySide: true,
      student: { select: { id: true, firstName: true, lastName: true, admissionNumber: true, enrollments: { where: { status: "ACTIVE" }, take: 1, select: { class: { select: { name: true } } } } } },
      guardian: { select: { id: true, firstName: true, lastName: true } },
    },
  });
  const messages = await db.schoolMessage.findMany({ where: { organizationId, conversationId }, orderBy: { createdAt: "desc" }, take: HISTORY_LIMIT, select: { id: true, body: true, senderSide: true, senderName: true, senderUserId: true, createdAt: true } });
  const total = await db.schoolMessage.count({ where: { organizationId, conversationId } });
  const { student, ...rest } = conversation;
  return { ...rest, student: { id: student.id, firstName: student.firstName, lastName: student.lastName, admissionNumber: student.admissionNumber, className: student.enrollments[0]?.class.name ?? null }, messages: messages.reverse(), olderMessageCount: Math.max(0, total - messages.length) };
}

/** Opens a conversation for staff and marks it read. */
export async function getStaffConversation(actor: StaffActor, conversationId: string) {
  await staffConversationOrThrow(actor, conversationId);
  const detail = await conversationDetail(actor.organizationId, conversationId);
  await markConversationRead(actor.organizationId, conversationId, actor.userId);
  return detail;
}

async function findPriorSend(organizationId: string, senderUserId: string, clientRequestId: string) {
  return db.schoolMessage.findFirst({ where: { organizationId, senderUserId, clientRequestId }, select: { conversationId: true } });
}

export async function startStaffConversation(actor: StaffActor, input: { studentId: string; guardianId: string; subject: string; body: string; clientRequestId: string }) {
  requireStaffMessaging(actor);
  await requireMessagingAvailable(actor.organizationId);
  const subject = cleanSubject(input.subject);
  const body = cleanBody(input.body);
  const clientRequestId = cleanRequestId(input.clientRequestId);
  const prior = await findPriorSend(actor.organizationId, actor.userId, clientRequestId);
  if (prior) return { conversationId: prior.conversationId, duplicate: true };

  const scope = await staffStudentScope(actor.organizationId, actor.userId);
  if (scope && !scope.has(input.studentId)) throw new SchoolCommunicationError("Student not found.", "not-found");
  const link = await db.schoolStudentGuardian.findFirst({
    where: { organizationId: actor.organizationId, studentId: input.studentId, guardianId: input.guardianId },
    select: { guardian: { select: { userId: true } }, student: { select: { status: true } } },
  });
  if (!link) throw new SchoolCommunicationError("That guardian is not linked to the student.", "not-found");
  if (!link.guardian.userId) throw new SchoolCommunicationError("That guardian has no portal account yet. Invite them from Portal Access first.", "invalid");

  const senderName = await displayName(actor.userId);
  const conversation = await db.$transaction(async (tx) => {
    const created = await tx.schoolConversation.create({ data: { organizationId: actor.organizationId, studentId: input.studentId, guardianId: input.guardianId, subject, startedBySide: "STAFF", createdById: actor.userId } });
    await tx.schoolMessage.create({ data: { organizationId: actor.organizationId, conversationId: created.id, senderUserId: actor.userId, senderSide: "STAFF", senderName, body, clientRequestId } });
    await tx.schoolConversationReadState.create({ data: { organizationId: actor.organizationId, conversationId: created.id, userId: actor.userId } });
    return created;
  });
  await logAuditEvent({ organizationId: actor.organizationId, userId: actor.userId, module: "school", action: "school.conversation.started", entityName: "SchoolConversation", entityId: conversation.id, metadata: { studentId: input.studentId, guardianId: input.guardianId, side: "STAFF" } });
  return { conversationId: conversation.id, duplicate: false };
}

async function appendMessage(organizationId: string, conversationId: string, sender: { userId: string; side: "STAFF" | "GUARDIAN"; name: string }, body: string, clientRequestId: string) {
  try {
    return await db.$transaction(async (tx) => {
      const message = await tx.schoolMessage.create({ data: { organizationId, conversationId, senderUserId: sender.userId, senderSide: sender.side, senderName: sender.name, body, clientRequestId } });
      await tx.schoolConversation.update({ where: { id: conversationId }, data: { lastMessageAt: message.createdAt } });
      await tx.schoolConversationReadState.upsert({ where: { conversationId_userId: { conversationId, userId: sender.userId } }, update: { lastReadAt: message.createdAt }, create: { organizationId, conversationId, userId: sender.userId, lastReadAt: message.createdAt } });
      return { messageId: message.id, duplicate: false };
    });
  } catch (error) {
    // The same form submitted twice: the first send already succeeded.
    if (isUniqueViolation(error)) return { messageId: null, duplicate: true };
    throw error;
  }
}

export async function sendStaffMessage(actor: StaffActor, input: { conversationId: string; body: string; clientRequestId: string }) {
  const body = cleanBody(input.body);
  const clientRequestId = cleanRequestId(input.clientRequestId);
  const conversation = await staffConversationOrThrow(actor, input.conversationId);
  if (conversation.status === "CLOSED") throw new SchoolCommunicationError("This conversation is closed. Reopen it to reply.", "closed");
  return appendMessage(actor.organizationId, conversation.id, { userId: actor.userId, side: "STAFF", name: await displayName(actor.userId) }, body, clientRequestId);
}

export async function setConversationStatus(actor: StaffActor, conversationId: string, status: SchoolConversationStatus) {
  const conversation = await staffConversationOrThrow(actor, conversationId);
  if (conversation.status === status) return conversation;
  const updated = await db.schoolConversation.update({ where: { id: conversation.id }, data: { status } });
  await logAuditEvent({ organizationId: actor.organizationId, userId: actor.userId, module: "school", action: status === "CLOSED" ? "school.conversation.closed" : "school.conversation.reopened", entityName: "SchoolConversation", entityId: conversation.id });
  return updated;
}

// --- Guardian side --------------------------------------------------------------

/** The signed-in user's own guardian record and linked students, or null when they are not a guardian. */
export async function resolveGuardianActor(organizationId: string, userId: string) {
  const scope = await resolveSchoolPortalScope(organizationId, userId);
  if (!scope || scope.type !== "guardian") return null;
  const guardian = await db.schoolGuardian.findFirst({ where: { id: scope.guardianId, organizationId }, select: { id: true, firstName: true, lastName: true } });
  if (!guardian) return null;
  return { organizationId, userId, guardianId: guardian.id, name: `${guardian.firstName} ${guardian.lastName}`.slice(0, 120), studentIds: scope.studentIds };
}
type GuardianActor = NonNullable<Awaited<ReturnType<typeof resolveGuardianActor>>>;

async function requireGuardian(organizationId: string, userId: string) {
  const guardian = await resolveGuardianActor(organizationId, userId);
  if (!guardian) throw new SchoolCommunicationError("Only a guardian portal account can use guardian messaging.", "forbidden");
  return guardian;
}

async function guardianConversationOrThrow(guardian: GuardianActor, conversationId: string) {
  const conversation = await db.schoolConversation.findFirst({ where: { id: conversationId, organizationId: guardian.organizationId, guardianId: guardian.guardianId } });
  if (!conversation || !guardian.studentIds.includes(conversation.studentId)) throw new SchoolCommunicationError("Conversation not found.", "not-found");
  return conversation;
}

export async function listGuardianStudents(organizationId: string, userId: string) {
  const guardian = await requireGuardian(organizationId, userId);
  const students = await db.schoolStudent.findMany({ where: { organizationId, id: { in: guardian.studentIds } }, select: { id: true, firstName: true, lastName: true }, orderBy: { firstName: "asc" } });
  return students.map((student) => ({ id: student.id, label: `${student.firstName} ${student.lastName}` }));
}

export async function listGuardianConversations(organizationId: string, userId: string) {
  await requireMessagingAvailable(organizationId);
  const guardian = await requireGuardian(organizationId, userId);
  const conversations = await db.schoolConversation.findMany({
    where: { organizationId, guardianId: guardian.guardianId, studentId: { in: guardian.studentIds } },
    select: conversationListSelect,
    orderBy: { lastMessageAt: "desc" },
    take: LIST_LIMIT,
  });
  const unread = await unreadCounts(conversations.map((conversation) => conversation.id), userId);
  return conversations.map((conversation) => ({ ...conversation, preview: preview(conversation.messages[0]?.body), lastSender: conversation.messages[0]?.senderName ?? null, unread: unread.get(conversation.id) ?? 0 }));
}

export async function getGuardianConversation(organizationId: string, userId: string, conversationId: string) {
  await requireMessagingAvailable(organizationId);
  const guardian = await requireGuardian(organizationId, userId);
  await guardianConversationOrThrow(guardian, conversationId);
  const detail = await conversationDetail(organizationId, conversationId);
  await markConversationRead(organizationId, conversationId, userId);
  return detail;
}

export async function startGuardianConversation(organizationId: string, userId: string, input: { studentId: string; subject: string; body: string; clientRequestId: string }) {
  await requireMessagingAvailable(organizationId);
  const guardian = await requireGuardian(organizationId, userId);
  const subject = cleanSubject(input.subject);
  const body = cleanBody(input.body);
  const clientRequestId = cleanRequestId(input.clientRequestId);
  const prior = await findPriorSend(organizationId, userId, clientRequestId);
  if (prior) return { conversationId: prior.conversationId, duplicate: true };
  if (!guardian.studentIds.includes(input.studentId)) throw new SchoolCommunicationError("Student not found.", "not-found");
  const conversation = await db.$transaction(async (tx) => {
    const created = await tx.schoolConversation.create({ data: { organizationId, studentId: input.studentId, guardianId: guardian.guardianId, subject, startedBySide: "GUARDIAN", createdById: userId } });
    await tx.schoolMessage.create({ data: { organizationId, conversationId: created.id, senderUserId: userId, senderSide: "GUARDIAN", senderName: guardian.name, body, clientRequestId } });
    await tx.schoolConversationReadState.create({ data: { organizationId, conversationId: created.id, userId } });
    return created;
  });
  await logAuditEvent({ organizationId, userId, module: "school", action: "school.conversation.started", entityName: "SchoolConversation", entityId: conversation.id, metadata: { studentId: input.studentId, guardianId: guardian.guardianId, side: "GUARDIAN" } });
  return { conversationId: conversation.id, duplicate: false };
}

export async function sendGuardianMessage(organizationId: string, userId: string, input: { conversationId: string; body: string; clientRequestId: string }) {
  await requireMessagingAvailable(organizationId);
  const guardian = await requireGuardian(organizationId, userId);
  const body = cleanBody(input.body);
  const clientRequestId = cleanRequestId(input.clientRequestId);
  const conversation = await guardianConversationOrThrow(guardian, input.conversationId);
  if (conversation.status === "CLOSED") throw new SchoolCommunicationError("The school closed this conversation. Start a new one if you need to.", "closed");
  return appendMessage(organizationId, conversation.id, { userId, side: "GUARDIAN", name: guardian.name }, body, clientRequestId);
}

// --- Announcements --------------------------------------------------------------

export const AUDIENCE_LABEL: Record<SchoolAnnouncementAudience, string> = {
  STAFF: "Staff",
  ALL_GUARDIANS: "All guardians",
  CLASS_GUARDIANS: "Guardians of one class",
  EVERYONE: "Staff and all guardians",
};

export async function publishAnnouncement(actor: StaffActor, input: { title: string; body: string; audience: SchoolAnnouncementAudience; classId?: string | null; clientRequestId: string }) {
  if (!actor.canPublishAnnouncements) throw new SchoolCommunicationError("Your role cannot publish School announcements.", "forbidden");
  const title = cleanText(input.title, "Title", SUBJECT_MIN, SUBJECT_MAX).replace(/\s+/g, " ");
  const body = cleanText(input.body, "Announcement", 1, BODY_MAX);
  const clientRequestId = cleanRequestId(input.clientRequestId);
  if (!(input.audience in AUDIENCE_LABEL)) throw new SchoolCommunicationError("Choose who should see the announcement.", "invalid");
  let classId: string | null = null;
  if (input.audience === "CLASS_GUARDIANS") {
    const schoolClass = input.classId ? await db.schoolClass.findFirst({ where: { id: input.classId, organizationId: actor.organizationId, active: true }, select: { id: true } }) : null;
    if (!schoolClass) throw new SchoolCommunicationError("Choose an active class for a class announcement.", "invalid");
    classId = schoolClass.id;
  }
  try {
    const announcement = await db.schoolAnnouncement.create({ data: { organizationId: actor.organizationId, title, body, audience: input.audience, classId, publishedById: actor.userId, publishedByName: await displayName(actor.userId), clientRequestId } });
    await logAuditEvent({ organizationId: actor.organizationId, userId: actor.userId, module: "school", action: "school.announcement.published", entityName: "SchoolAnnouncement", entityId: announcement.id, metadata: { audience: input.audience, classId } });
    return { announcementId: announcement.id, duplicate: false };
  } catch (error) {
    if (isUniqueViolation(error)) return { announcementId: null, duplicate: true };
    throw error;
  }
}

export async function withdrawAnnouncement(actor: StaffActor, announcementId: string) {
  if (!actor.canPublishAnnouncements) throw new SchoolCommunicationError("Your role cannot withdraw School announcements.", "forbidden");
  const updated = await db.schoolAnnouncement.updateMany({ where: { id: announcementId, organizationId: actor.organizationId, withdrawnAt: null }, data: { withdrawnAt: new Date(), withdrawnById: actor.userId } });
  if (updated.count === 0) throw new SchoolCommunicationError("Announcement not found or already withdrawn.", "not-found");
  await logAuditEvent({ organizationId: actor.organizationId, userId: actor.userId, module: "school", action: "school.announcement.withdrawn", entityName: "SchoolAnnouncement", entityId: announcementId });
}

const STAFF_AUDIENCES: SchoolAnnouncementAudience[] = ["STAFF", "EVERYONE"];

async function guardianClassIds(organizationId: string, studentIds: string[]) {
  if (!studentIds.length) return [];
  const enrollments = await db.schoolEnrollment.findMany({ where: { organizationId, studentId: { in: studentIds }, status: "ACTIVE" }, select: { classId: true } });
  return [...new Set(enrollments.map((enrollment) => enrollment.classId))];
}

async function guardianAnnouncementWhere(guardian: GuardianActor): Promise<Prisma.SchoolAnnouncementWhereInput> {
  const classIds = await guardianClassIds(guardian.organizationId, guardian.studentIds);
  return { organizationId: guardian.organizationId, withdrawnAt: null, OR: [{ audience: { in: ["ALL_GUARDIANS", "EVERYONE"] } }, { audience: "CLASS_GUARDIANS", classId: { in: classIds } }] };
}

async function markAnnouncementsRead(organizationId: string, userId: string, announcementIds: string[]) {
  if (!announcementIds.length) return;
  await db.schoolAnnouncementRead.createMany({ data: announcementIds.map((announcementId) => ({ organizationId, announcementId, userId })), skipDuplicates: true });
}

/**
 * Staff view: every announcement for the organization (publishers also see
 * withdrawn ones and read counts). Staff-audience announcements shown here
 * are marked read for the viewer.
 */
export async function listStaffAnnouncements(actor: StaffActor) {
  if (!actor.canViewSchool) throw new SchoolCommunicationError("Your role cannot view School announcements.", "forbidden");
  const announcements = await db.schoolAnnouncement.findMany({
    where: { organizationId: actor.organizationId, ...(actor.canPublishAnnouncements ? {} : { withdrawnAt: null }) },
    include: { class: { select: { name: true } }, reads: { where: { userId: actor.userId }, select: { id: true } }, _count: { select: { reads: true } } },
    orderBy: { publishedAt: "desc" },
    take: LIST_LIMIT,
  });
  const result = announcements.map(({ reads, _count, ...announcement }) => ({ ...announcement, unread: STAFF_AUDIENCES.includes(announcement.audience) && !announcement.withdrawnAt && reads.length === 0, readCount: actor.canPublishAnnouncements ? _count.reads : null }));
  await markAnnouncementsRead(actor.organizationId, actor.userId, result.filter((announcement) => announcement.unread).map((announcement) => announcement.id));
  return result;
}

/** Guardian view: announcements for all guardians and for classes their linked students attend. Marks them read. */
export async function listGuardianAnnouncements(organizationId: string, userId: string) {
  if (!(await isSchoolPortalGranted(organizationId))) throw new SchoolCommunicationError("The portal is not enabled for this school.", "unavailable");
  const guardian = await requireGuardian(organizationId, userId);
  const announcements = await db.schoolAnnouncement.findMany({
    where: await guardianAnnouncementWhere(guardian),
    select: { id: true, title: true, body: true, audience: true, publishedAt: true, publishedByName: true, class: { select: { name: true } }, reads: { where: { userId }, select: { id: true } } },
    orderBy: { publishedAt: "desc" },
    take: LIST_LIMIT,
  });
  const result = announcements.map(({ reads, ...announcement }) => ({ ...announcement, unread: reads.length === 0 }));
  await markAnnouncementsRead(organizationId, userId, result.filter((announcement) => announcement.unread).map((announcement) => announcement.id));
  return result;
}

// --- Unread summaries -------------------------------------------------------------

async function unreadMessageTotal(organizationId: string, userId: string, conversationWhere: Prisma.SchoolConversationWhereInput) {
  const conversations = await db.schoolConversation.findMany({ where: { organizationId, ...conversationWhere }, select: { id: true }, orderBy: { lastMessageAt: "desc" }, take: LIST_LIMIT });
  const counts = await unreadCounts(conversations.map((conversation) => conversation.id), userId);
  return [...counts.values()].reduce((sum, count) => sum + count, 0);
}

export async function getStaffUnreadSummary(actor: StaffActor) {
  const [messages, announcements] = await Promise.all([
    actor.canManageMessages && (await isGuardianMessagingAvailable(actor.organizationId))
      ? staffStudentScope(actor.organizationId, actor.userId).then((scope) => unreadMessageTotal(actor.organizationId, actor.userId, scope ? { studentId: { in: [...scope] } } : {}))
      : Promise.resolve(0),
    actor.canViewSchool ? db.schoolAnnouncement.count({ where: { organizationId: actor.organizationId, withdrawnAt: null, audience: { in: STAFF_AUDIENCES }, reads: { none: { userId: actor.userId } } } }) : Promise.resolve(0),
  ]);
  return { messages, announcements };
}

export async function getGuardianUnreadSummary(organizationId: string, userId: string) {
  const guardian = await resolveGuardianActor(organizationId, userId);
  if (!guardian || !(await isSchoolPortalGranted(organizationId))) return { messages: 0, announcements: 0, messagingAvailable: false };
  const messagingAvailable = await isSchoolGuardianMessagingGranted(organizationId);
  const [messages, announcements] = await Promise.all([
    messagingAvailable ? unreadMessageTotal(organizationId, userId, { guardianId: guardian.guardianId, studentId: { in: guardian.studentIds } }) : Promise.resolve(0),
    db.schoolAnnouncement.count({ where: { ...(await guardianAnnouncementWhere(guardian)), reads: { none: { userId } } } }),
  ]);
  return { messages, announcements, messagingAvailable };
}

/** Builds the staff actor from the server-resolved tenant (never from client input). */
export function staffActorFor(tenant: { organizationId: string; userId: string }, can: (permission: string) => boolean): StaffActor {
  return {
    organizationId: tenant.organizationId,
    userId: tenant.userId,
    canViewSchool: can("school.view"),
    canManageMessages: can("school.messages.manage"),
    canPublishAnnouncements: can("school.announcements.publish"),
  };
}
