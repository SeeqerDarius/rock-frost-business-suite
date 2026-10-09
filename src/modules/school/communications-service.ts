import "server-only";

import { Prisma, type SchoolAnnouncementAudience } from "@prisma/client";
import { db } from "@/lib/db";
import { logAuditEvent } from "@/lib/audit";
import { isSchoolGuardianMessagingGranted, isSchoolPortalGranted } from "@/lib/platform-communications";
import { resolveTeacherClassScope } from "./service";
import { resolveSchoolPortalScope } from "./portal-service";

/**
 * School announcements plus the shared scope and entitlement helpers used by
 * School chat (chat-service.ts). Every read and write is authorized here on
 * the server from the signed-in user's own records, never from client input:
 *
 * - A staff member assigned to classes (SchoolClassTeacher) reaches only
 *   students actively enrolled in those classes; staff with no assignments
 *   are unrestricted, matching resolveTeacherClassScope().
 * - A guardian is resolved from their own portal login
 *   (resolveSchoolPortalScope).
 * - Chats with guardians need both paid add-ons: the Parent and Student
 *   portal and Guardian messaging. Announcements need only School, with
 *   guardians reading them in the portal.
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

const BODY_MAX = 4000;
const LIST_LIMIT = 100;

function cleanText(value: string, label: string, min: number, max: number) {
  const text = value.replace(/\r\n/g, "\n").trim();
  if (text.length < min) throw new SchoolCommunicationError(min > 1 ? `${label} must be at least ${min} characters.` : `${label} cannot be empty.`, "invalid");
  if (text.length > max) throw new SchoolCommunicationError(`${label} must be ${max} characters or fewer.`, "invalid");
  return text;
}
function cleanRequestId(value: string) {
  if (!/^[A-Za-z0-9-]{8,64}$/.test(value)) throw new SchoolCommunicationError("The form expired. Reload the page and try again.", "invalid");
  return value;
}
const isUniqueViolation = (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

export async function isGuardianMessagingAvailable(organizationId: string) {
  const [portal, messaging] = await Promise.all([isSchoolPortalGranted(organizationId), isSchoolGuardianMessagingGranted(organizationId)]);
  return portal && messaging;
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

// --- Announcements --------------------------------------------------------------

export const AUDIENCE_LABEL: Record<SchoolAnnouncementAudience, string> = {
  STAFF: "Staff",
  ALL_GUARDIANS: "All guardians",
  CLASS_GUARDIANS: "Guardians of one class",
  EVERYONE: "Staff and all guardians",
};

export async function publishAnnouncement(actor: StaffActor, input: { title: string; body: string; audience: SchoolAnnouncementAudience; classId?: string | null; clientRequestId: string }) {
  if (!actor.canPublishAnnouncements) throw new SchoolCommunicationError("Your role cannot publish School announcements.", "forbidden");
  const title = cleanText(input.title, "Title", 2, 120).replace(/\s+/g, " ");
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

export async function getStaffUnreadSummary(actor: StaffActor) {
  const announcements = actor.canViewSchool ? await db.schoolAnnouncement.count({ where: { organizationId: actor.organizationId, withdrawnAt: null, audience: { in: STAFF_AUDIENCES }, reads: { none: { userId: actor.userId } } } }) : 0;
  return { announcements };
}

/** Unread announcements for a guardian, and whether chat with the school is available to them. Chat unread counts come from chat-service. */
export async function getGuardianUnreadSummary(organizationId: string, userId: string) {
  const guardian = await resolveGuardianActor(organizationId, userId);
  if (!guardian || !(await isSchoolPortalGranted(organizationId))) return { announcements: 0, messagingAvailable: false };
  const messagingAvailable = await isSchoolGuardianMessagingGranted(organizationId);
  const announcements = await db.schoolAnnouncement.count({ where: { ...(await guardianAnnouncementWhere(guardian)), reads: { none: { userId } } } });
  return { announcements, messagingAvailable };
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
