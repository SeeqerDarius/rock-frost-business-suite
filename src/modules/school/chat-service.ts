import "server-only";

import { after } from "next/server";
import { Prisma, type SchoolChatBroadcastAudience } from "@prisma/client";
import { db } from "@/lib/db";
import { logAuditEvent } from "@/lib/audit";
import { sendWebPushToUsers } from "@/lib/web-push";
import { isGuardianMessagingAvailable, resolveGuardianActor, staffStudentScope } from "./communications-service";

/**
 * School chat: WhatsApp-style direct chats, staff-created groups, and
 * broadcast lists, for staff and guardians, entirely in the app (plus opt-in
 * web push). See docs/SCHOOL_COMMUNICATIONS.md.
 *
 * Who can talk to whom (decided here, on the server, for every read and write):
 * - Staff (School messaging permission) can chat with any other messaging
 *   staff member, and with guardians whose children are in their scope (all
 *   guardians for staff without class assignments; otherwise guardians of
 *   students actively enrolled in their assigned classes).
 * - Guardians can chat with staff who can reach them under the same rule.
 *   They cannot start chats with other guardians or create groups; they see
 *   other guardians only as fellow members of groups staff created.
 * - Only staff create groups and broadcast lists; group admins (staff) manage
 *   members and settings.
 * - Any chat with a guardian in it needs both paid add-ons (Parent and Student
 *   portal, and Guardian messaging). Staff-only chats need only School.
 * Access is by active membership; a guardian member must still be a guardian
 * of the organization with at least one linked child.
 */

export class SchoolChatError extends Error {
  constructor(message: string, readonly code: "forbidden" | "not-found" | "invalid" | "unavailable") {
    super(message);
  }
}

export type ChatViewer =
  | { kind: "staff"; organizationId: string; userId: string; name: string; canBroadcast: boolean }
  | { kind: "guardian"; organizationId: string; userId: string; name: string; guardianId: string; studentIds: string[] };

const BODY_MAX = 4000;
const NAME_MIN = 2;
const NAME_MAX = 80;
const REQUEST_ID = /^[A-Za-z0-9-]{8,64}$/;
const EDIT_WINDOW_MS = 15 * 60 * 1000;
const HISTORY_LIMIT = 100;
const LIST_LIMIT = 200;
const BROADCAST_LIMIT = 1000;
const GROUP_MEMBER_LIMIT = 500;
export const CHAT_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"] as const;
export const SCHOOL_CHAT_NOTIFICATION_TYPE = "SCHOOL_CHAT_MESSAGE";

const fail = (message: string, code: SchoolChatError["code"]): never => { throw new SchoolChatError(message, code); };
const isUniqueViolation = (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

function cleanBody(value: string, required: boolean) {
  const text = value.replace(/\r\n/g, "\n").trim();
  if (required && !text) fail("Type a message first.", "invalid");
  if (text.length > BODY_MAX) fail(`Messages must be ${BODY_MAX.toLocaleString("en")} characters or fewer.`, "invalid");
  return text;
}
function cleanName(value: string) {
  const name = value.replace(/\s+/g, " ").trim();
  if (name.length < NAME_MIN || name.length > NAME_MAX) fail(`Group names must be ${NAME_MIN} to ${NAME_MAX} characters.`, "invalid");
  return name;
}
function cleanRequestId(value: string) {
  if (!REQUEST_ID.test(value)) fail("The form expired. Reload the page and try again.", "invalid");
  return value;
}

async function userName(userId: string) {
  const user = await db.user.findUnique({ where: { id: userId }, select: { name: true, email: true } });
  return (user?.name?.trim() || user?.email || "School staff").slice(0, 120);
}

// --- Viewer and reachability ------------------------------------------------------

/** Builds the viewer from the server-resolved tenant. Null when the user can neither message as staff nor as a guardian. */
export async function resolveChatViewer(tenant: { organizationId: string; userId: string }, can: (permission: string) => boolean): Promise<ChatViewer | null> {
  if (can("school.messages.manage")) {
    return { kind: "staff", organizationId: tenant.organizationId, userId: tenant.userId, name: await userName(tenant.userId), canBroadcast: can("school.announcements.publish") };
  }
  if (can("school.portal.view")) {
    const guardian = await resolveGuardianActor(tenant.organizationId, tenant.userId);
    if (guardian && guardian.studentIds.length > 0) return { kind: "guardian", organizationId: tenant.organizationId, userId: tenant.userId, name: guardian.name, guardianId: guardian.guardianId, studentIds: guardian.studentIds };
  }
  return null;
}

/** Active members whose role carries the School messaging permission. */
export async function listMessagingStaff(organizationId: string) {
  const members = await db.organizationMember.findMany({
    where: { organizationId, status: "ACTIVE", role: { rolePermissions: { some: { permission: { key: "school.messages.manage" } } } } },
    select: { userId: true, user: { select: { name: true, email: true } }, role: { select: { name: true } } },
    orderBy: { user: { name: "asc" } },
  });
  return members.map((member) => ({ userId: member.userId, name: (member.user.name?.trim() || member.user.email || "School staff").slice(0, 120), roleName: member.role?.name ?? null }));
}

async function isMessagingStaff(organizationId: string, userId: string) {
  const member = await db.organizationMember.findFirst({ where: { organizationId, userId, status: "ACTIVE", role: { rolePermissions: { some: { permission: { key: "school.messages.manage" } } } } }, select: { id: true } });
  return !!member;
}

/** Guardians (with portal logins) a staff member may chat with, with their linked children in scope. */
export async function listReachableGuardians(organizationId: string, staffUserId: string) {
  const scope = await staffStudentScope(organizationId, staffUserId);
  const links = await db.schoolStudentGuardian.findMany({
    where: { organizationId, guardian: { userId: { not: null } }, student: { status: { in: ["ACTIVE", "SUSPENDED"] } }, ...(scope ? { studentId: { in: [...scope] } } : {}) },
    select: { relationship: true, guardian: { select: { id: true, userId: true, firstName: true, lastName: true } }, student: { select: { id: true, firstName: true, lastName: true } } },
    take: 5000,
  });
  const byUser = new Map<string, { userId: string; guardianId: string; name: string; children: string[]; studentIds: string[] }>();
  for (const link of links) {
    const userId = link.guardian.userId!;
    const entry = byUser.get(userId) ?? { userId, guardianId: link.guardian.id, name: `${link.guardian.firstName} ${link.guardian.lastName}`.slice(0, 120), children: [], studentIds: [] };
    entry.children.push(`${link.student.firstName} ${link.student.lastName}`);
    entry.studentIds.push(link.student.id);
    byUser.set(userId, entry);
  }
  return [...byUser.values()].sort((a, b) => a.name.localeCompare(b.name));
}

async function guardianByUser(organizationId: string, userId: string) {
  return resolveGuardianActor(organizationId, userId);
}

/** Whether staffUserId may chat with the guardian whose children are studentIds. */
async function staffReachesStudents(organizationId: string, staffUserId: string, studentIds: string[]) {
  if (!studentIds.length) return false;
  const scope = await staffStudentScope(organizationId, staffUserId);
  return !scope || studentIds.some((id) => scope.has(id));
}

/** Staff a guardian may start a chat with: messaging staff whose scope includes one of the guardian's children. */
export async function listStaffReachableByGuardian(organizationId: string, guardian: { studentIds: string[] }) {
  const staff = await listMessagingStaff(organizationId);
  const assignments = await db.schoolClassTeacher.findMany({ where: { organizationId, userId: { in: staff.map((member) => member.userId) } }, select: { userId: true, classId: true } });
  const enrollments = await db.schoolEnrollment.findMany({ where: { organizationId, studentId: { in: guardian.studentIds }, status: "ACTIVE" }, select: { classId: true } });
  const childClasses = new Set(enrollments.map((enrollment) => enrollment.classId));
  const assigned = new Map<string, Set<string>>();
  for (const assignment of assignments) assigned.set(assignment.userId, (assigned.get(assignment.userId) ?? new Set()).add(assignment.classId));
  return staff.filter((member) => {
    const classes = assigned.get(member.userId);
    return !classes || [...classes].some((classId) => childClasses.has(classId));
  });
}

async function requireGuardianFeatures(organizationId: string) {
  if (!(await isGuardianMessagingAvailable(organizationId))) fail("Chatting with guardians is not enabled for this school.", "unavailable");
}

// --- Membership ---------------------------------------------------------------------

async function loadMembership(viewer: ChatViewer, chatId: string) {
  const membership = await db.schoolChatMember.findFirst({
    where: { organizationId: viewer.organizationId, chatId, userId: viewer.userId, leftAt: null },
    include: { chat: { include: { members: { where: { leftAt: null }, select: { userId: true, side: true, role: true, displayName: true, lastReadAt: true, joinedAt: true } } } } },
  });
  if (!membership) fail("Chat not found.", "not-found");
  const chat = membership!.chat;
  const hasGuardian = chat.members.some((member) => member.side === "GUARDIAN");
  if (hasGuardian || viewer.kind === "guardian") await requireGuardianFeatures(viewer.organizationId);
  return membership!;
}

function directKey(a: string, b: string) {
  return [a, b].sort().join(":");
}

// --- Listing ------------------------------------------------------------------------

function messagePreview(message: { kind: string; body: string; deletedAt: Date | null; attachmentMimeType: string | null; attachmentName: string | null } | undefined) {
  if (!message) return "";
  if (message.deletedAt) return "This message was deleted";
  if (message.kind === "ATTACHMENT") {
    const label = message.attachmentMimeType?.startsWith("image/") ? "Photo" : `Document${message.attachmentName ? `: ${message.attachmentName}` : ""}`;
    return message.body ? `${label}. ${message.body}` : label;
  }
  const single = message.body.replace(/\s+/g, " ").trim();
  return single.length > 90 ? `${single.slice(0, 87)}...` : single;
}

export type ChatListItem = Awaited<ReturnType<typeof listChats>>[number];

export async function listChats(viewer: ChatViewer, options: { search?: string; archived?: boolean } = {}) {
  const guardianFeatures = await isGuardianMessagingAvailable(viewer.organizationId);
  if (viewer.kind === "guardian" && !guardianFeatures) return [];
  const memberships = await db.schoolChatMember.findMany({
    where: { organizationId: viewer.organizationId, userId: viewer.userId, leftAt: null, archivedAt: options.archived ? { not: null } : null },
    include: {
      chat: {
        include: {
          members: { where: { leftAt: null }, select: { userId: true, side: true, displayName: true } },
          messages: { orderBy: { createdAt: "desc" }, take: 1, select: { kind: true, body: true, deletedAt: true, attachmentMimeType: true, attachmentName: true, senderName: true, senderUserId: true, createdAt: true } },
        },
      },
    },
    orderBy: { chat: { lastMessageAt: "desc" } },
    take: LIST_LIMIT,
  });
  const visible = memberships.filter((membership) => guardianFeatures || !membership.chat.members.some((member) => member.side === "GUARDIAN"));
  const unread = await Promise.all(visible.map((membership) => db.schoolChatMessage.count({ where: { chatId: membership.chatId, createdAt: { gt: membership.lastReadAt }, OR: [{ senderUserId: null }, { senderUserId: { not: viewer.userId } }] } })));
  const now = Date.now();
  const search = options.search?.trim().toLowerCase();
  return visible
    .map((membership, index) => {
      const chat = membership.chat;
      const other = chat.type === "DIRECT" ? chat.members.find((member) => member.userId !== viewer.userId) : null;
      const last = chat.messages[0];
      const title = chat.type === "GROUP" ? chat.name ?? "Group" : other?.displayName ?? "Chat";
      return {
        id: chat.id,
        type: chat.type,
        title,
        subtitle: chat.type === "DIRECT" ? (other?.side === "GUARDIAN" ? "Guardian" : "School staff") : `${chat.members.length} members`,
        preview: last ? `${chat.type === "GROUP" && last.senderUserId && last.senderUserId !== viewer.userId ? `${last.senderName}: ` : last.senderUserId === viewer.userId ? "You: " : ""}${messagePreview(last)}` : "No messages yet",
        lastMessageAt: chat.lastMessageAt,
        unread: unread[index],
        pinned: !!membership.pinnedAt,
        muted: !!membership.mutedUntil && membership.mutedUntil.getTime() > now,
        archived: !!membership.archivedAt,
      };
    })
    .filter((item) => !search || item.title.toLowerCase().includes(search) || item.preview.toLowerCase().includes(search))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.lastMessageAt.getTime() - a.lastMessageAt.getTime());
}

export async function unreadChatTotal(viewer: ChatViewer) {
  const items = await listChats(viewer);
  return items.filter((item) => !item.muted).reduce((sum, item) => sum + item.unread, 0);
}

// --- Opening a chat -------------------------------------------------------------------

export async function getChat(viewer: ChatViewer, chatId: string, options: { search?: string } = {}) {
  const membership = await loadMembership(viewer, chatId);
  const chat = membership.chat;
  const search = options.search?.trim();
  const where: Prisma.SchoolChatMessageWhereInput = { organizationId: viewer.organizationId, chatId, createdAt: { gte: membership.joinedAt }, ...(search ? { body: { contains: search, mode: "insensitive" }, deletedAt: null } : {}) };
  const [messages, total] = await Promise.all([
    db.schoolChatMessage.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: HISTORY_LIMIT,
      select: {
        id: true, kind: true, body: true, senderUserId: true, senderSide: true, senderName: true, createdAt: true, editedAt: true, deletedAt: true, broadcastId: true,
        attachmentName: true, attachmentMimeType: true, attachmentSize: true,
        replyTo: { select: { id: true, senderName: true, body: true, kind: true, deletedAt: true, attachmentMimeType: true, attachmentName: true } },
        reactions: { select: { emoji: true, userId: true } },
      },
    }),
    db.schoolChatMessage.count({ where }),
  ]);
  const others = chat.members.filter((member) => member.userId !== viewer.userId);
  const now = new Date();
  await db.schoolChatMember.update({ where: { id: membership.id }, data: { lastReadAt: now } });
  await db.notification.updateMany({ where: { organizationId: viewer.organizationId, userId: viewer.userId, type: SCHOOL_CHAT_NOTIFICATION_TYPE, readAt: null, metadata: { path: ["chatId"], equals: chatId } }, data: { readAt: now } });
  const directOther = chat.type === "DIRECT" ? others[0] ?? null : null;
  const isAdmin = membership.role === "ADMIN";
  return {
    id: chat.id,
    type: chat.type,
    title: chat.type === "GROUP" ? chat.name ?? "Group" : directOther?.displayName ?? "Chat",
    description: chat.description,
    onlyAdminsCanPost: chat.onlyAdminsCanPost,
    isAdmin,
    canPost: !(chat.type === "GROUP" && chat.onlyAdminsCanPost && !isAdmin),
    canManage: chat.type === "GROUP" && isAdmin && viewer.kind === "staff",
    muted: !!membership.mutedUntil && membership.mutedUntil > now,
    pinned: !!membership.pinnedAt,
    archived: !!membership.archivedAt,
    members: chat.members.map((member) => ({ userId: member.userId, name: member.displayName, side: member.side, role: member.role, isYou: member.userId === viewer.userId })),
    olderCount: Math.max(0, total - messages.length),
    messages: messages.reverse().map((message) => {
      const mine = message.senderUserId === viewer.userId;
      const seenBy = mine ? others.filter((member) => member.lastReadAt >= message.createdAt).map((member) => member.displayName) : [];
      const reactionCounts = new Map<string, { emoji: string; count: number; mine: boolean }>();
      for (const reaction of message.reactions) {
        const entry = reactionCounts.get(reaction.emoji) ?? { emoji: reaction.emoji, count: 0, mine: false };
        entry.count += 1;
        entry.mine ||= reaction.userId === viewer.userId;
        reactionCounts.set(reaction.emoji, entry);
      }
      return {
        id: message.id,
        kind: message.kind,
        body: message.deletedAt ? "" : message.body,
        deleted: !!message.deletedAt,
        edited: !!message.editedAt,
        mine,
        senderName: message.senderName,
        senderSide: message.senderSide,
        createdAt: message.createdAt,
        broadcast: !!message.broadcastId,
        attachment: message.kind === "ATTACHMENT" && !message.deletedAt ? { name: message.attachmentName ?? "attachment", mimeType: message.attachmentMimeType ?? "application/octet-stream", size: message.attachmentSize ?? 0 } : null,
        replyTo: message.replyTo ? { id: message.replyTo.id, senderName: message.replyTo.senderName, preview: messagePreview({ ...message.replyTo }) } : null,
        reactions: [...reactionCounts.values()],
        seenBy,
        seenByAll: mine && others.length > 0 && seenBy.length === others.length,
        canEdit: mine && message.kind === "TEXT" && !message.deletedAt && now.getTime() - message.createdAt.getTime() < EDIT_WINDOW_MS,
        canDelete: !message.deletedAt && message.kind !== "SYSTEM" && (mine || (chat.type === "GROUP" && isAdmin && viewer.kind === "staff")),
      };
    }),
  };
}

// --- Sending ---------------------------------------------------------------------------

export type ChatAttachmentInput = { fileName: string; mimeType: string; size: number; dataUrl: string };

async function notifyMembers(organizationId: string, chat: { id: string; type: string; name: string | null }, sender: { userId: string | null; name: string }, preview: string) {
  const now = new Date();
  const recipients = await db.schoolChatMember.findMany({
    where: { organizationId, chatId: chat.id, leftAt: null, ...(sender.userId ? { userId: { not: sender.userId } } : {}), OR: [{ mutedUntil: null }, { mutedUntil: { lt: now } }] },
    select: { userId: true },
  });
  if (!recipients.length) return;
  const title = chat.type === "GROUP" ? chat.name ?? "Group" : sender.name;
  const message = chat.type === "GROUP" ? `${sender.name}: ${preview}` : preview;
  for (const recipient of recipients) {
    const updated = await db.notification.updateMany({
      where: { organizationId, userId: recipient.userId, type: SCHOOL_CHAT_NOTIFICATION_TYPE, readAt: null, metadata: { path: ["chatId"], equals: chat.id } },
      data: { title, message: message.slice(0, 300), status: "SENT", sentAt: now },
    });
    if (updated.count === 0) {
      await db.notification.create({ data: { organizationId, userId: recipient.userId, type: SCHOOL_CHAT_NOTIFICATION_TYPE, channel: "IN_APP", title, message: message.slice(0, 300), status: "SENT", sentAt: now, metadata: { chatId: chat.id } } });
    }
  }
  const push = () => sendWebPushToUsers(recipients.map((recipient) => recipient.userId), { title, body: message, url: `/app/school/chats/${chat.id}`, tag: `school-chat-${chat.id}` }).catch((error) => console.error("[school-chat] push failed", error));
  try {
    after(push);
  } catch {
    // Outside a request (scripts and tests): send inline.
    await push();
  }
}

export async function sendChatMessage(viewer: ChatViewer, input: { chatId: string; body: string; clientRequestId: string; replyToId?: string | null; attachment?: ChatAttachmentInput | null }) {
  const clientRequestId = cleanRequestId(input.clientRequestId);
  const body = cleanBody(input.body, !input.attachment);
  const membership = await loadMembership(viewer, input.chatId);
  const chat = membership.chat;
  if (chat.type === "GROUP" && chat.onlyAdminsCanPost && membership.role !== "ADMIN") fail("Only group admins can send messages in this group.", "forbidden");
  if (chat.type === "DIRECT") await assertDirectPairStillAllowed(viewer, chat.members);
  let replyToId: string | null = null;
  if (input.replyToId) {
    const reply = await db.schoolChatMessage.findFirst({ where: { id: input.replyToId, chatId: chat.id, organizationId: viewer.organizationId }, select: { id: true } });
    if (!reply) fail("The message you replied to is no longer available.", "invalid");
    replyToId = reply!.id;
  }
  const side = viewer.kind === "staff" ? "STAFF" : "GUARDIAN";
  let message;
  try {
    message = await db.$transaction(async (tx) => {
      let attachment: { attachmentAssetId: string; attachmentName: string; attachmentMimeType: string; attachmentSize: number } | null = null;
      if (input.attachment) {
        const asset = await tx.fileAsset.create({ data: { organizationId: viewer.organizationId, uploadedById: viewer.userId, fileName: input.attachment.fileName, mimeType: input.attachment.mimeType, size: input.attachment.size, storagePath: "database://school/chat", url: input.attachment.dataUrl, metadata: { purpose: "school-chat-attachment", chatId: chat.id } } });
        attachment = { attachmentAssetId: asset.id, attachmentName: input.attachment.fileName, attachmentMimeType: input.attachment.mimeType, attachmentSize: input.attachment.size };
      }
      const created = await tx.schoolChatMessage.create({ data: { organizationId: viewer.organizationId, chatId: chat.id, senderUserId: viewer.userId, senderSide: side, senderName: viewer.name, kind: attachment ? "ATTACHMENT" : "TEXT", body, replyToId, clientRequestId, ...(attachment ?? {}) } });
      await tx.schoolChat.update({ where: { id: chat.id }, data: { lastMessageAt: created.createdAt } });
      await tx.schoolChatMember.update({ where: { id: membership.id }, data: { lastReadAt: created.createdAt } });
      await tx.schoolChatMember.updateMany({ where: { chatId: chat.id, leftAt: null, archivedAt: { not: null } }, data: { archivedAt: null } });
      return created;
    });
  } catch (error) {
    if (isUniqueViolation(error)) return { messageId: null, duplicate: true };
    throw error;
  }
  await notifyMembers(viewer.organizationId, chat, { userId: viewer.userId, name: viewer.name }, messagePreview(message));
  return { messageId: message.id, duplicate: false };
}

/** A direct chat stays usable only while its two people may still reach each other. */
async function assertDirectPairStillAllowed(viewer: ChatViewer, members: { userId: string; side: string }[]) {
  const other = members.find((member) => member.userId !== viewer.userId);
  if (!other) return;
  if (viewer.kind === "guardian") {
    if (other.side !== "STAFF" || !(await staffReachesStudents(viewer.organizationId, other.userId, viewer.studentIds))) fail("You can no longer message this person. Contact the school office.", "forbidden");
  } else if (other.side === "GUARDIAN") {
    const guardian = await guardianByUser(viewer.organizationId, other.userId);
    if (!guardian || !(await staffReachesStudents(viewer.organizationId, viewer.userId, guardian.studentIds))) fail("This guardian is no longer linked to a student you teach.", "forbidden");
  } else if (!(await isMessagingStaff(viewer.organizationId, other.userId))) {
    fail("This staff member no longer has School messaging.", "forbidden");
  }
}

export async function editChatMessage(viewer: ChatViewer, input: { messageId: string; body: string }) {
  const body = cleanBody(input.body, true);
  const message = await db.schoolChatMessage.findFirst({ where: { id: input.messageId, organizationId: viewer.organizationId }, select: { id: true, chatId: true, senderUserId: true, kind: true, deletedAt: true, createdAt: true } });
  if (!message) return fail("Message not found.", "not-found");
  await loadMembership(viewer, message.chatId);
  if (message.senderUserId !== viewer.userId || message.kind !== "TEXT" || message.deletedAt) fail("You can only edit your own text messages.", "forbidden");
  if (Date.now() - message.createdAt.getTime() > EDIT_WINDOW_MS) fail("Messages can only be edited within 15 minutes of sending.", "invalid");
  await db.schoolChatMessage.update({ where: { id: message.id }, data: { body, editedAt: new Date() } });
}

export async function deleteChatMessage(viewer: ChatViewer, messageId: string) {
  const message = await db.schoolChatMessage.findFirst({ where: { id: messageId, organizationId: viewer.organizationId }, select: { id: true, chatId: true, senderUserId: true, kind: true, deletedAt: true, attachmentAssetId: true } });
  if (!message) return fail("Message not found.", "not-found");
  const membership = await loadMembership(viewer, message.chatId);
  const moderator = membership.chat.type === "GROUP" && membership.role === "ADMIN" && viewer.kind === "staff";
  if (message.deletedAt || message.kind === "SYSTEM" || (message.senderUserId !== viewer.userId && !moderator)) fail("You cannot delete this message.", "forbidden");
  await db.$transaction(async (tx) => {
    await tx.schoolChatMessage.update({ where: { id: message.id }, data: { deletedAt: new Date(), deletedById: viewer.userId, body: "" } });
    if (message.attachmentAssetId) await tx.fileAsset.deleteMany({ where: { id: message.attachmentAssetId, organizationId: viewer.organizationId } });
    await tx.schoolChatReaction.deleteMany({ where: { messageId: message.id } });
  });
  if (message.senderUserId !== viewer.userId) await logAuditEvent({ organizationId: viewer.organizationId, userId: viewer.userId, module: "school", action: "school.chat.message_removed_by_admin", entityName: "SchoolChatMessage", entityId: message.id, metadata: { chatId: message.chatId } });
}

export async function reactToChatMessage(viewer: ChatViewer, input: { messageId: string; emoji: string }) {
  if (!(CHAT_REACTIONS as readonly string[]).includes(input.emoji)) fail("Choose one of the available reactions.", "invalid");
  const message = await db.schoolChatMessage.findFirst({ where: { id: input.messageId, organizationId: viewer.organizationId }, select: { id: true, chatId: true, deletedAt: true, kind: true } });
  if (!message) return fail("Message not found.", "not-found");
  await loadMembership(viewer, message.chatId);
  if (message.deletedAt || message.kind === "SYSTEM") fail("You cannot react to this message.", "invalid");
  const existing = await db.schoolChatReaction.findUnique({ where: { messageId_userId: { messageId: message.id, userId: viewer.userId } } });
  if (existing?.emoji === input.emoji) await db.schoolChatReaction.delete({ where: { id: existing.id } });
  else await db.schoolChatReaction.upsert({ where: { messageId_userId: { messageId: message.id, userId: viewer.userId } }, update: { emoji: input.emoji }, create: { organizationId: viewer.organizationId, messageId: message.id, userId: viewer.userId, emoji: input.emoji } });
}

/** Attachment bytes for a member of the chat. */
export async function getChatAttachment(viewer: ChatViewer, messageId: string) {
  const message = await db.schoolChatMessage.findFirst({ where: { id: messageId, organizationId: viewer.organizationId, kind: "ATTACHMENT", deletedAt: null }, select: { chatId: true, attachmentAssetId: true, attachmentName: true, attachmentMimeType: true } });
  if (!message?.attachmentAssetId) return fail("Attachment not found.", "not-found");
  await loadMembership(viewer, message.chatId);
  const asset = await db.fileAsset.findFirst({ where: { id: message.attachmentAssetId, organizationId: viewer.organizationId }, select: { url: true, mimeType: true, fileName: true } });
  const match = asset?.url?.match(/^data:([^;]+);base64,(.*)$/);
  if (!asset || !match) return fail("Attachment not found.", "not-found");
  return { bytes: Buffer.from(match[2], "base64"), mimeType: asset.mimeType, fileName: asset.fileName };
}

// --- Starting chats and groups --------------------------------------------------------

async function memberSpec(viewer: ChatViewer, targetUserId: string): Promise<{ userId: string; side: "STAFF" | "GUARDIAN"; displayName: string }> {
  if (targetUserId === viewer.userId) return fail("Choose someone else.", "invalid");
  if (await isMessagingStaff(viewer.organizationId, targetUserId)) {
    if (viewer.kind === "guardian") {
      const reachable = await listStaffReachableByGuardian(viewer.organizationId, viewer);
      if (!reachable.some((member) => member.userId === targetUserId)) fail("You can message staff who teach your children or the school office.", "forbidden");
    }
    return { userId: targetUserId, side: "STAFF", displayName: await userName(targetUserId) };
  }
  const guardian = await guardianByUser(viewer.organizationId, targetUserId);
  if (!guardian || guardian.studentIds.length === 0) return fail("That person is not available to message.", "not-found");
  if (viewer.kind === "guardian") return fail("Guardians can message school staff, not other guardians.", "forbidden");
  if (!(await staffReachesStudents(viewer.organizationId, viewer.userId, guardian.studentIds))) fail("That guardian has no child in your classes.", "forbidden");
  await requireGuardianFeatures(viewer.organizationId);
  return { userId: targetUserId, side: "GUARDIAN", displayName: guardian.name };
}

export async function startDirectChat(viewer: ChatViewer, targetUserId: string) {
  const target = await memberSpec(viewer, targetUserId);
  if (viewer.kind === "guardian") await requireGuardianFeatures(viewer.organizationId);
  const key = directKey(viewer.userId, target.userId);
  const existing = await db.schoolChat.findUnique({ where: { organizationId_directKey: { organizationId: viewer.organizationId, directKey: key } }, select: { id: true } });
  if (existing) {
    await db.schoolChatMember.updateMany({ where: { chatId: existing.id, userId: viewer.userId }, data: { leftAt: null, archivedAt: null } });
    return { chatId: existing.id, created: false };
  }
  try {
    const chat = await db.schoolChat.create({
      data: {
        organizationId: viewer.organizationId, type: "DIRECT", directKey: key, createdById: viewer.userId,
        members: { create: [
          { userId: viewer.userId, side: viewer.kind === "staff" ? "STAFF" : "GUARDIAN", displayName: viewer.name, addedById: viewer.userId },
          { userId: target.userId, side: target.side, displayName: target.displayName, addedById: viewer.userId },
        ] },
      },
    });
    return { chatId: chat.id, created: true };
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const raced = await db.schoolChat.findUniqueOrThrow({ where: { organizationId_directKey: { organizationId: viewer.organizationId, directKey: key } }, select: { id: true } });
    return { chatId: raced.id, created: false };
  }
}

function requireStaff(viewer: ChatViewer): asserts viewer is Extract<ChatViewer, { kind: "staff" }> {
  if (viewer.kind !== "staff") fail("Only school staff can do this.", "forbidden");
}

async function systemMessage(tx: Prisma.TransactionClient, organizationId: string, chatId: string, body: string) {
  const created = await tx.schoolChatMessage.create({ data: { organizationId, chatId, senderName: "System", kind: "SYSTEM", body: body.slice(0, BODY_MAX), clientRequestId: `system-${crypto.randomUUID()}` } });
  await tx.schoolChat.update({ where: { id: chatId }, data: { lastMessageAt: created.createdAt } });
}

export async function createGroupChat(viewer: ChatViewer, input: { name: string; description?: string | null; memberUserIds: string[]; onlyAdminsCanPost?: boolean; classId?: string | null }) {
  requireStaff(viewer);
  const name = cleanName(input.name);
  const description = input.description?.trim().slice(0, 500) || null;
  const ids = [...new Set(input.memberUserIds.filter((id) => id && id !== viewer.userId))];
  if (!ids.length) fail("Add at least one member.", "invalid");
  if (ids.length > GROUP_MEMBER_LIMIT) fail(`Groups can have up to ${GROUP_MEMBER_LIMIT} members.`, "invalid");
  const members: Awaited<ReturnType<typeof memberSpec>>[] = [];
  for (const id of ids) members.push(await memberSpec(viewer, id));
  let classId: string | null = null;
  if (input.classId) {
    const schoolClass = await db.schoolClass.findFirst({ where: { id: input.classId, organizationId: viewer.organizationId }, select: { id: true } });
    classId = schoolClass?.id ?? null;
  }
  const chat = await db.$transaction(async (tx) => {
    const created = await tx.schoolChat.create({
      data: {
        organizationId: viewer.organizationId, type: "GROUP", name, description, classId, onlyAdminsCanPost: !!input.onlyAdminsCanPost, createdById: viewer.userId,
        members: { create: [
          { userId: viewer.userId, side: "STAFF", role: "ADMIN", displayName: viewer.name, addedById: viewer.userId },
          ...members.map((member) => ({ userId: member.userId, side: member.side, displayName: member.displayName, addedById: viewer.userId })),
        ] },
      },
    });
    await systemMessage(tx, viewer.organizationId, created.id, `${viewer.name} created the group "${name}".`);
    return created;
  });
  await logAuditEvent({ organizationId: viewer.organizationId, userId: viewer.userId, module: "school", action: "school.chat.group_created", entityName: "SchoolChat", entityId: chat.id, metadata: { members: members.length + 1, guardians: members.filter((member) => member.side === "GUARDIAN").length } });
  await notifyMembers(viewer.organizationId, chat, { userId: viewer.userId, name: viewer.name }, `added you to "${name}"`);
  return { chatId: chat.id };
}

async function requireGroupAdmin(viewer: ChatViewer, chatId: string) {
  requireStaff(viewer);
  const membership = await loadMembership(viewer, chatId);
  if (membership.chat.type !== "GROUP" || membership.role !== "ADMIN") fail("Only group admins can do this.", "forbidden");
  return membership;
}

export async function addGroupMembers(viewer: ChatViewer, chatId: string, userIds: string[]) {
  const membership = await requireGroupAdmin(viewer, chatId);
  const current = new Set(membership.chat.members.map((member) => member.userId));
  const ids = [...new Set(userIds)].filter((id) => !current.has(id));
  if (!ids.length) fail("Choose people who are not already in the group.", "invalid");
  if (current.size + ids.length > GROUP_MEMBER_LIMIT) fail(`Groups can have up to ${GROUP_MEMBER_LIMIT} members.`, "invalid");
  const added: Awaited<ReturnType<typeof memberSpec>>[] = [];
  for (const id of ids) added.push(await memberSpec(viewer, id));
  await db.$transaction(async (tx) => {
    for (const member of added) {
      await tx.schoolChatMember.upsert({
        where: { chatId_userId: { chatId, userId: member.userId } },
        update: { leftAt: null, role: "MEMBER", joinedAt: new Date(), lastReadAt: new Date(), displayName: member.displayName, addedById: viewer.userId, side: member.side },
        create: { organizationId: viewer.organizationId, chatId, userId: member.userId, side: member.side, displayName: member.displayName, addedById: viewer.userId },
      });
    }
    await systemMessage(tx, viewer.organizationId, chatId, `${viewer.name} added ${added.map((member) => member.displayName).join(", ")}.`);
  });
}

export async function removeGroupMember(viewer: ChatViewer, chatId: string, userId: string) {
  const membership = await requireGroupAdmin(viewer, chatId);
  const target = membership.chat.members.find((member) => member.userId === userId);
  if (!target || userId === viewer.userId) fail("Choose a current member other than yourself. To leave, use Leave group.", "invalid");
  await db.$transaction(async (tx) => {
    await tx.schoolChatMember.updateMany({ where: { chatId, userId }, data: { leftAt: new Date(), role: "MEMBER" } });
    await systemMessage(tx, viewer.organizationId, chatId, `${viewer.name} removed ${target!.displayName}.`);
  });
}

export async function setGroupAdmin(viewer: ChatViewer, chatId: string, userId: string, admin: boolean) {
  const membership = await requireGroupAdmin(viewer, chatId);
  const target = membership.chat.members.find((member) => member.userId === userId);
  if (!target) return fail("Member not found.", "not-found");
  if (target.side !== "STAFF") fail("Only staff members can be group admins.", "invalid");
  if (!admin && membership.chat.members.filter((member) => member.role === "ADMIN").length <= 1) fail("A group needs at least one admin.", "invalid");
  await db.schoolChatMember.updateMany({ where: { chatId, userId }, data: { role: admin ? "ADMIN" : "MEMBER" } });
}

export async function updateGroupSettings(viewer: ChatViewer, chatId: string, input: { name: string; description?: string | null; onlyAdminsCanPost: boolean }) {
  const membership = await requireGroupAdmin(viewer, chatId);
  const name = cleanName(input.name);
  const description = input.description?.trim().slice(0, 500) || null;
  await db.$transaction(async (tx) => {
    await tx.schoolChat.update({ where: { id: chatId }, data: { name, description, onlyAdminsCanPost: input.onlyAdminsCanPost } });
    const changes = [];
    if (name !== membership.chat.name) changes.push(`renamed the group to "${name}"`);
    if (input.onlyAdminsCanPost !== membership.chat.onlyAdminsCanPost) changes.push(input.onlyAdminsCanPost ? "allowed only admins to send messages" : "allowed everyone to send messages");
    if (changes.length) await systemMessage(tx, viewer.organizationId, chatId, `${viewer.name} ${changes.join(" and ")}.`);
  });
}

export async function leaveChat(viewer: ChatViewer, chatId: string) {
  const membership = await loadMembership(viewer, chatId);
  if (membership.chat.type !== "GROUP") fail("You can archive a direct chat instead of leaving it.", "invalid");
  await db.$transaction(async (tx) => {
    const admins = membership.chat.members.filter((member) => member.role === "ADMIN");
    if (membership.role === "ADMIN" && admins.length === 1) {
      const successor = membership.chat.members.filter((member) => member.side === "STAFF" && member.userId !== viewer.userId).sort((a, b) => a.joinedAt.getTime() - b.joinedAt.getTime())[0];
      if (successor) await tx.schoolChatMember.updateMany({ where: { chatId, userId: successor.userId }, data: { role: "ADMIN" } });
    }
    await tx.schoolChatMember.update({ where: { id: membership.id }, data: { leftAt: new Date(), role: "MEMBER" } });
    await systemMessage(tx, viewer.organizationId, chatId, `${viewer.name} left.`);
  });
}

const MUTE_DURATIONS: Record<string, number | null> = { "8h": 8 * 3600_000, "1w": 7 * 24 * 3600_000, always: null };

export async function setChatPreferences(viewer: ChatViewer, chatId: string, input: { pinned?: boolean; archived?: boolean; mute?: "8h" | "1w" | "always" | "off" }) {
  const membership = await loadMembership(viewer, chatId);
  const data: Prisma.SchoolChatMemberUpdateInput = {};
  if (input.pinned !== undefined) data.pinnedAt = input.pinned ? new Date() : null;
  if (input.archived !== undefined) data.archivedAt = input.archived ? new Date() : null;
  if (input.mute) data.mutedUntil = input.mute === "off" ? null : input.mute in MUTE_DURATIONS ? (MUTE_DURATIONS[input.mute] === null ? new Date("9999-12-31T00:00:00Z") : new Date(Date.now() + MUTE_DURATIONS[input.mute]!)) : undefined;
  await db.schoolChatMember.update({ where: { id: membership.id }, data });
}

// --- Broadcast lists ------------------------------------------------------------------

export async function broadcastMessage(viewer: ChatViewer, input: { audience: SchoolChatBroadcastAudience; classId?: string | null; userIds?: string[]; body: string; clientRequestId: string }) {
  requireStaff(viewer);
  if (!viewer.canBroadcast) fail("Your role cannot send broadcast messages.", "forbidden");
  const body = cleanBody(input.body, true);
  const clientRequestId = cleanRequestId(input.clientRequestId);
  const prior = await db.schoolChatBroadcast.findUnique({ where: { organizationId_clientRequestId: { organizationId: viewer.organizationId, clientRequestId } }, select: { id: true, recipientCount: true } });
  if (prior) return { broadcastId: prior.id, recipients: prior.recipientCount, duplicate: true };

  let recipients: { userId: string; side: "STAFF" | "GUARDIAN"; displayName: string }[] = [];
  let classId: string | null = null;
  if (input.audience === "ALL_STAFF") {
    recipients = (await listMessagingStaff(viewer.organizationId)).filter((member) => member.userId !== viewer.userId).map((member) => ({ userId: member.userId, side: "STAFF" as const, displayName: member.name }));
  } else if (input.audience === "ALL_GUARDIANS" || input.audience === "CLASS_GUARDIANS") {
    await requireGuardianFeatures(viewer.organizationId);
    let guardians = await listReachableGuardians(viewer.organizationId, viewer.userId);
    if (input.audience === "CLASS_GUARDIANS") {
      const schoolClass = input.classId ? await db.schoolClass.findFirst({ where: { id: input.classId, organizationId: viewer.organizationId }, select: { id: true } }) : null;
      if (!schoolClass) fail("Choose a class.", "invalid");
      classId = schoolClass!.id;
      const enrolled = new Set((await db.schoolEnrollment.findMany({ where: { organizationId: viewer.organizationId, classId, status: "ACTIVE" }, select: { studentId: true } })).map((enrollment) => enrollment.studentId));
      guardians = guardians.filter((guardian) => guardian.studentIds.some((id) => enrolled.has(id)));
    }
    recipients = guardians.map((guardian) => ({ userId: guardian.userId, side: "GUARDIAN" as const, displayName: guardian.name }));
  } else {
    const ids = [...new Set(input.userIds ?? [])].filter((id) => id !== viewer.userId);
    for (const id of ids) recipients.push(await memberSpec(viewer, id));
  }
  if (!recipients.length) fail("Nobody matches that audience yet.", "invalid");
  if (recipients.length > BROADCAST_LIMIT) fail(`A broadcast can reach up to ${BROADCAST_LIMIT} people at once.`, "invalid");

  let broadcastId: string;
  try {
    broadcastId = (await db.schoolChatBroadcast.create({ data: { organizationId: viewer.organizationId, senderUserId: viewer.userId, audience: input.audience, classId, body, recipientCount: recipients.length, clientRequestId } })).id;
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const raced = await db.schoolChatBroadcast.findUniqueOrThrow({ where: { organizationId_clientRequestId: { organizationId: viewer.organizationId, clientRequestId } } });
    return { broadcastId: raced.id, recipients: raced.recipientCount, duplicate: true };
  }

  const chatIds: string[] = [];
  for (const recipient of recipients) {
    const key = directKey(viewer.userId, recipient.userId);
    let chat = await db.schoolChat.findUnique({ where: { organizationId_directKey: { organizationId: viewer.organizationId, directKey: key } }, select: { id: true, type: true, name: true } });
    if (!chat) {
      try {
        chat = await db.schoolChat.create({
          data: { organizationId: viewer.organizationId, type: "DIRECT", directKey: key, createdById: viewer.userId, members: { create: [
            { userId: viewer.userId, side: "STAFF", displayName: viewer.name, addedById: viewer.userId },
            { userId: recipient.userId, side: recipient.side, displayName: recipient.displayName, addedById: viewer.userId },
          ] } },
          select: { id: true, type: true, name: true },
        });
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        chat = await db.schoolChat.findUniqueOrThrow({ where: { organizationId_directKey: { organizationId: viewer.organizationId, directKey: key } }, select: { id: true, type: true, name: true } });
      }
    } else {
      await db.schoolChatMember.updateMany({ where: { chatId: chat.id, userId: { in: [viewer.userId, recipient.userId] } }, data: { leftAt: null } });
    }
    const created = await db.schoolChatMessage.create({ data: { organizationId: viewer.organizationId, chatId: chat.id, senderUserId: viewer.userId, senderSide: "STAFF", senderName: viewer.name, kind: "TEXT", body, broadcastId, clientRequestId: `broadcast-${broadcastId}` } });
    await db.schoolChat.update({ where: { id: chat.id }, data: { lastMessageAt: created.createdAt } });
    await db.schoolChatMember.updateMany({ where: { chatId: chat.id, userId: viewer.userId }, data: { lastReadAt: created.createdAt } });
    chatIds.push(chat.id);
    await notifyMembers(viewer.organizationId, chat, { userId: viewer.userId, name: viewer.name }, messagePreview({ kind: "TEXT", body, deletedAt: null, attachmentMimeType: null, attachmentName: null }));
  }
  await logAuditEvent({ organizationId: viewer.organizationId, userId: viewer.userId, module: "school", action: "school.chat.broadcast_sent", entityName: "SchoolChatBroadcast", entityId: broadcastId, metadata: { audience: input.audience, classId, recipients: recipients.length } });
  return { broadcastId, recipients: recipients.length, duplicate: false };
}

/** People the viewer can start a chat with, for the New chat screen. */
export async function listChatContacts(viewer: ChatViewer) {
  if (viewer.kind === "guardian") {
    if (!(await isGuardianMessagingAvailable(viewer.organizationId))) return { staff: [], guardians: [] };
    return { staff: await listStaffReachableByGuardian(viewer.organizationId, viewer), guardians: [] };
  }
  const [staff, guardianFeatures] = await Promise.all([listMessagingStaff(viewer.organizationId), isGuardianMessagingAvailable(viewer.organizationId)]);
  return { staff: staff.filter((member) => member.userId !== viewer.userId), guardians: guardianFeatures ? await listReachableGuardians(viewer.organizationId, viewer.userId) : [] };
}
