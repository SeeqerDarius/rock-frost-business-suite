import "server-only";

import { db } from "@/lib/db";
import { getPlatformAnchorOrganizationIds } from "@/lib/platform-organizations";

export class SupportNotFoundError extends Error {}

/** Thrown when platform staff or an org admin try to reply into a pre-migration shared conversation — those are frozen read-only history, not addressable going forward. */
export class LegacyConversationError extends Error {}

export type SupportSenderRole = "TENANT" | "PLATFORM" | "AI" | "ADMIN";

export interface SerializedSupportMessage {
  id: string;
  content: string;
  createdAt: string;
  senderRole: SupportSenderRole;
  senderName: string;
}

/** Converts a Prisma row into the plain, RSC-serializable shape client components and Server Action returns use. */
export function toChatMessage(message: { id: string; content: string; createdAt: Date; senderRole: string; senderName: string }): SerializedSupportMessage {
  return {
    id: message.id,
    content: message.content,
    createdAt: message.createdAt.toISOString(),
    senderRole: message.senderRole as SupportSenderRole,
    senderName: message.senderName,
  };
}

/** A user counts as "online" if their support surface sent a heartbeat within this window. */
const ONLINE_WINDOW_MS = 45_000;

/**
 * Idempotent — every (organization, tenant user) pair gets exactly one
 * private conversation, created on first contact. A conversation created
 * this way always has a real userId; only pre-migration rows have userId
 * null, so a brand-new user's first message can never resolve to one of
 * those legacy rows.
 */
export async function getOrCreateSupportConversation(organizationId: string, userId: string) {
  return db.supportConversation.upsert({
    where: { organizationId_userId: { organizationId, userId } },
    update: {},
    create: { organizationId, userId },
  });
}

export async function listSupportMessages(organizationId: string, userId: string, sinceCreatedAt?: Date) {
  const conversation = await db.supportConversation.findUnique({ where: { organizationId_userId: { organizationId, userId } } });
  if (!conversation) return { conversation: null, messages: [] };
  const messages = await db.supportMessage.findMany({
    where: { organizationId, conversationId: conversation.id, ...(sinceCreatedAt ? { createdAt: { gt: sinceCreatedAt } } : {}) },
    orderBy: { createdAt: "asc" },
    take: 200,
  });
  return { conversation, messages };
}

/** Looked up by conversation id directly — the natural key for the platform and admin inboxes, which already have a selected row from a list rather than an (organizationId, userId) pair. */
export async function listMessagesByConversationId(conversationId: string, sinceCreatedAt?: Date) {
  const conversation = await db.supportConversation.findUnique({ where: { id: conversationId } });
  if (!conversation) return { conversation: null, messages: [] };
  const messages = await db.supportMessage.findMany({
    where: { conversationId, ...(sinceCreatedAt ? { createdAt: { gt: sinceCreatedAt } } : {}) },
    orderBy: { createdAt: "asc" },
    take: 200,
  });
  return { conversation, messages };
}

async function appendMessage(
  conversation: { id: string; organizationId: string; userId: string | null },
  data: { senderId: string | null; senderName: string; senderRole: SupportSenderRole; content: string },
) {
  const content = data.content.trim();
  if (!content) throw new Error("Message cannot be empty.");
  return db.$transaction(async (tx) => {
    const message = await tx.supportMessage.create({
      data: {
        organizationId: conversation.organizationId,
        conversationId: conversation.id,
        senderId: data.senderId,
        senderName: data.senderName,
        senderRole: data.senderRole,
        content,
      },
    });
    // Sending implicitly marks your own side as caught up, and always
    // reopens a resolved conversation. An AI-authored message isn't a read
    // acknowledgment from any human party, so it bumps no cursor.
    const readCursorUpdate =
      data.senderRole === "TENANT" ? { tenantLastReadAt: message.createdAt }
      : data.senderRole === "PLATFORM" ? { platformLastReadAt: message.createdAt }
      : data.senderRole === "ADMIN" ? { adminLastReadAt: message.createdAt }
      : {};
    await tx.supportConversation.update({ where: { id: conversation.id }, data: { status: "OPEN", ...readCursorUpdate } });
    await tx.$executeRaw`
      UPDATE "SupportConversation"
      SET "lastMessageAt" = GREATEST("lastMessageAt", ${message.createdAt})
      WHERE "id" = ${conversation.id}
    `;
    const updated = await tx.supportConversation.findUniqueOrThrow({ where: { id: conversation.id } });
    return { message, conversation: updated };
  }, { timeout: 15_000 });
}

/** The tenant participant's own message — always creates or reuses their own private conversation, never a legacy shared one. */
export function sendTenantMessage(organizationId: string, userId: string, senderName: string, content: string) {
  return getOrCreateSupportConversation(organizationId, userId).then((conversation) =>
    appendMessage(conversation, { senderId: userId, senderName, senderRole: "TENANT", content }),
  );
}

/** Platform staff reply into one specific conversation. Throws LegacyConversationError on a pre-migration (userId: null) conversation — those are frozen read-only history. */
export async function sendPlatformMessage(conversationId: string, senderId: string, senderName: string, content: string) {
  const conversation = await db.supportConversation.findUniqueOrThrow({ where: { id: conversationId } });
  if (conversation.userId === null) throw new LegacyConversationError("This conversation predates per-user support threads and is read-only.");
  return appendMessage(conversation, { senderId, senderName, senderRole: "PLATFORM", content });
}

/**
 * An organization admin replying from the org-scoped admin inbox. The
 * organizationId the caller passes must be that admin's own tenant — this
 * function refuses to touch any conversation belonging to a different
 * organization even if a crafted conversationId is supplied, which is the
 * structural guarantee that makes the admin inbox impossible to leak
 * cross-tenant. Also throws on a legacy conversation, same as the platform side.
 */
export async function sendAdminMessage(organizationId: string, conversationId: string, adminUserId: string, adminName: string, content: string) {
  const conversation = await db.supportConversation.findUniqueOrThrow({ where: { id: conversationId } });
  if (conversation.organizationId !== organizationId) throw new SupportNotFoundError("Conversation not found.");
  if (conversation.userId === null) throw new LegacyConversationError("This conversation predates per-user support threads and is read-only.");
  return appendMessage(conversation, { senderId: adminUserId, senderName: adminName, senderRole: "ADMIN", content });
}

/** The AI assistant has no user account — senderId is always null, senderName is a fixed display label. Targets one specific tenant conversation. */
export async function sendAiMessage(conversationId: string, content: string) {
  const conversation = await db.supportConversation.findUniqueOrThrow({ where: { id: conversationId } });
  return appendMessage(conversation, { senderId: null, senderName: "Rock Frost AI Assistant", senderRole: "AI", content });
}

/**
 * When did the OTHER side last read this conversation, from viewerRole's
 * perspective — the cursor a viewer's own sent messages must be compared
 * against to know whether they've been seen yet. An admin viewer has no
 * single fixed "other side" (a conversation has a tenant, platform staff,
 * and potentially the admin all present), so admin-authored messages always
 * show as sent rather than a full read receipt.
 */
export function otherPartyReadAt(
  conversation: { tenantLastReadAt: Date | null; platformLastReadAt: Date | null },
  viewerRole: "TENANT" | "PLATFORM" | "ADMIN",
): string | null {
  if (viewerRole === "ADMIN") return null;
  const date = viewerRole === "TENANT" ? conversation.platformLastReadAt : conversation.tenantLastReadAt;
  return date ? date.toISOString() : null;
}

export async function markReadByTenant(organizationId: string, userId: string) {
  const conversation = await getOrCreateSupportConversation(organizationId, userId);
  return db.supportConversation.update({ where: { id: conversation.id }, data: { tenantLastReadAt: new Date() } });
}

export async function markReadByPlatform(conversationId: string) {
  return db.supportConversation.update({ where: { id: conversationId }, data: { platformLastReadAt: new Date() } });
}

/** Marks an admin's own read cursor. Re-verifies the conversation belongs to the admin's own organization before touching it. */
export async function markReadByAdmin(organizationId: string, conversationId: string) {
  const conversation = await db.supportConversation.findUniqueOrThrow({ where: { id: conversationId } });
  if (conversation.organizationId !== organizationId) throw new SupportNotFoundError("Conversation not found.");
  return db.supportConversation.update({ where: { id: conversationId }, data: { adminLastReadAt: new Date() } });
}

export async function setConversationStatus(conversationId: string, status: "OPEN" | "RESOLVED") {
  const conversation = await db.supportConversation.findUnique({ where: { id: conversationId } });
  if (!conversation) throw new SupportNotFoundError("Conversation not found.");
  return db.supportConversation.update({ where: { id: conversationId }, data: { status } });
}

export async function getTenantUnreadCount(organizationId: string, userId: string) {
  const conversation = await db.supportConversation.findUnique({ where: { organizationId_userId: { organizationId, userId } } });
  if (!conversation) return 0;
  return db.supportMessage.count({
    where: {
      organizationId,
      conversationId: conversation.id,
      // AI and admin messages count toward the tenant's unread badge the
      // same way a platform reply does — the tenant should still notice new
      // content arrived, regardless of who inside Rock Frost or their own
      // organization's admin surface produced it.
      senderRole: { in: ["PLATFORM", "AI", "ADMIN"] },
      createdAt: conversation.tenantLastReadAt ? { gt: conversation.tenantLastReadAt } : undefined,
    },
  });
}

/** Cap on AI-generated replies per organization per rolling hour — a cheap guard against runaway API spend, still counted across every one of that organization's conversations. */
const AI_REPLY_HOURLY_CAP = 40;

export async function isAiReplyRateLimited(organizationId: string): Promise<boolean> {
  const count = await db.supportMessage.count({
    where: { organizationId, senderRole: "AI", createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) } },
  });
  return count >= AI_REPLY_HOURLY_CAP;
}

/** Platform-wide presence — used only for the tenant's own vague "is the team around" indicator, not as a functional AI-eligibility gate (see isPlatformOnlineForConversation). */
export async function isPlatformOnline() {
  const platformUserIds = await db.organizationMember.findMany({
    where: { status: "ACTIVE", role: { name: "Super Admin", isSystem: true, organizationId: null } },
    select: { userId: true },
    distinct: ["userId"],
  });
  if (platformUserIds.length === 0) return false;
  const recent = await db.userPresence.findFirst({
    where: { userId: { in: platformUserIds.map((m) => m.userId) }, lastSeenAt: { gt: new Date(Date.now() - ONLINE_WINDOW_MS) } },
    select: { userId: true },
  });
  return !!recent;
}

/** Direct single-user presence lookup — each conversation now belongs to exactly one tenant user, so "is the other side online" means that one person, not an aggregate across the whole organization. */
export async function isTenantOnline(userId: string) {
  const presence = await db.userPresence.findUnique({ where: { userId }, select: { lastSeenAt: true } });
  return !!presence && presence.lastSeenAt.getTime() > Date.now() - ONLINE_WINDOW_MS;
}

export async function recordHeartbeat(userId: string) {
  await db.userPresence.upsert({
    where: { userId },
    update: { lastSeenAt: new Date() },
    create: { userId, lastSeenAt: new Date() },
  });
}

/** Every real tenant conversation (platform anchor organizations excluded), most recent activity first — one row per (organization, user), plus any frozen legacy rows. */
export async function listPlatformConversations() {
  const anchorIds = await getPlatformAnchorOrganizationIds();
  const conversations = await db.supportConversation.findMany({
    where: { organizationId: { notIn: anchorIds } },
    include: {
      organization: { select: { id: true, name: true, tenantCode: true } },
      user: { select: { id: true, name: true, email: true } },
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
    },
    orderBy: { lastMessageAt: "desc" },
  });

  // Per-row unread depends on that row's own platformLastReadAt, so this can't
  // be expressed as a single groupBy — recompute per conversation directly.
  const results = await Promise.all(conversations.map(async (conversation) => {
    const unread = await db.supportMessage.count({
      where: {
        conversationId: conversation.id,
        // An org admin's reply is real tenant-side progress on the thread,
        // so it counts toward operator attention the same way a tenant
        // message does; an AI reply does not.
        senderRole: { in: ["TENANT", "ADMIN"] },
        createdAt: conversation.platformLastReadAt ? { gt: conversation.platformLastReadAt } : undefined,
      },
    });
    return {
      ...conversation,
      unreadCount: unread,
      hasActivity: conversation.messages.length > 0,
      kind: (conversation.userId === null ? "LEGACY" : "INDIVIDUAL") as "LEGACY" | "INDIVIDUAL",
    };
  }));

  return results;
}

export async function getPlatformUnreadCount() {
  const anchorIds = await getPlatformAnchorOrganizationIds();
  const conversations = await db.supportConversation.findMany({
    where: { organizationId: { notIn: anchorIds } },
    select: { id: true, platformLastReadAt: true },
  });
  const counts = await Promise.all(conversations.map((conversation) =>
    db.supportMessage.count({
      where: { conversationId: conversation.id, senderRole: { in: ["TENANT", "ADMIN"] }, createdAt: conversation.platformLastReadAt ? { gt: conversation.platformLastReadAt } : undefined },
    }),
  ));
  return counts.reduce((sum, count) => sum + count, 0);
}

/**
 * Every conversation within one organization — the organization-admin inbox.
 * Scoped with a hard WHERE organizationId filter, so it is structurally
 * impossible for this to return a conversation from another tenant, however
 * it's called.
 */
export async function listOrgSupportConversations(organizationId: string) {
  const conversations = await db.supportConversation.findMany({
    where: { organizationId },
    include: {
      user: { select: { id: true, name: true, email: true } },
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
    },
    orderBy: { lastMessageAt: "desc" },
  });

  return Promise.all(conversations.map(async (conversation) => {
    const unread = await db.supportMessage.count({
      where: {
        conversationId: conversation.id,
        senderRole: { in: ["TENANT", "PLATFORM", "AI"] },
        createdAt: conversation.adminLastReadAt ? { gt: conversation.adminLastReadAt } : undefined,
      },
    });
    return {
      ...conversation,
      unreadCount: unread,
      hasActivity: conversation.messages.length > 0,
      kind: (conversation.userId === null ? "LEGACY" : "INDIVIDUAL") as "LEGACY" | "INDIVIDUAL",
    };
  }));
}

export async function getOrgSupportUnreadCount(organizationId: string) {
  const conversations = await db.supportConversation.findMany({ where: { organizationId }, select: { id: true, adminLastReadAt: true } });
  const counts = await Promise.all(conversations.map((conversation) =>
    db.supportMessage.count({
      where: { conversationId: conversation.id, senderRole: { in: ["TENANT", "PLATFORM", "AI"] }, createdAt: conversation.adminLastReadAt ? { gt: conversation.adminLastReadAt } : undefined },
    }),
  ));
  return counts.reduce((sum, count) => sum + count, 0);
}
