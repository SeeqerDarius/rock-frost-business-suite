import "server-only";

import { db } from "@/lib/db";
import { getPlatformAnchorOrganizationIds } from "@/lib/platform-organizations";

export class SupportNotFoundError extends Error {}

export interface SerializedSupportMessage {
  id: string;
  content: string;
  createdAt: string;
  senderRole: "TENANT" | "PLATFORM";
  senderName: string;
}

/** Converts a Prisma row into the plain, RSC-serializable shape client components and Server Action returns use. */
export function toChatMessage(message: { id: string; content: string; createdAt: Date; senderRole: string; senderName: string }): SerializedSupportMessage {
  return {
    id: message.id,
    content: message.content,
    createdAt: message.createdAt.toISOString(),
    senderRole: message.senderRole as "TENANT" | "PLATFORM",
    senderName: message.senderName,
  };
}

/** A user counts as "online" if their support surface sent a heartbeat within this window. */
const ONLINE_WINDOW_MS = 45_000;

/** Idempotent — every organization gets exactly one ongoing conversation, created on first contact from either side. */
export async function getOrCreateSupportConversation(organizationId: string) {
  return db.supportConversation.upsert({
    where: { organizationId },
    update: {},
    create: { organizationId },
  });
}

export async function listSupportMessages(organizationId: string, sinceCreatedAt?: Date) {
  const conversation = await db.supportConversation.findUnique({ where: { organizationId } });
  if (!conversation) return { conversation: null, messages: [] };
  const messages = await db.supportMessage.findMany({
    where: { organizationId, conversationId: conversation.id, ...(sinceCreatedAt ? { createdAt: { gt: sinceCreatedAt } } : {}) },
    orderBy: { createdAt: "asc" },
    take: 200,
  });
  return { conversation, messages };
}

async function sendMessage(organizationId: string, data: { senderId: string | null; senderName: string; senderRole: "TENANT" | "PLATFORM"; content: string }) {
  const content = data.content.trim();
  if (!content) throw new Error("Message cannot be empty.");
  return db.$transaction(async (tx) => {
    const conversation = await tx.supportConversation.upsert({
      where: { organizationId },
      update: { lastMessageAt: new Date(), status: "OPEN" },
      create: { organizationId, lastMessageAt: new Date() },
    });
    const message = await tx.supportMessage.create({
      data: { organizationId, conversationId: conversation.id, senderId: data.senderId, senderName: data.senderName, senderRole: data.senderRole, content },
    });
    // Sending implicitly marks your own side as caught up.
    const updated = await tx.supportConversation.update({
      where: { id: conversation.id },
      data: data.senderRole === "TENANT" ? { tenantLastReadAt: message.createdAt } : { platformLastReadAt: message.createdAt },
    });
    return { message, conversation: updated };
  });
}

export function sendTenantMessage(organizationId: string, senderId: string, senderName: string, content: string) {
  return sendMessage(organizationId, { senderId, senderName, senderRole: "TENANT", content });
}

export function sendPlatformMessage(organizationId: string, senderId: string, senderName: string, content: string) {
  return sendMessage(organizationId, { senderId, senderName, senderRole: "PLATFORM", content });
}

/**
 * When did the OTHER side last read this conversation, from viewerRole's
 * perspective — the cursor a viewer's own sent messages must be compared
 * against to know whether they've been seen yet.
 */
export function otherPartyReadAt(conversation: { tenantLastReadAt: Date | null; platformLastReadAt: Date | null }, viewerRole: "TENANT" | "PLATFORM"): string | null {
  const date = viewerRole === "TENANT" ? conversation.platformLastReadAt : conversation.tenantLastReadAt;
  return date ? date.toISOString() : null;
}

export async function markReadByTenant(organizationId: string) {
  const conversation = await getOrCreateSupportConversation(organizationId);
  return db.supportConversation.update({ where: { id: conversation.id }, data: { tenantLastReadAt: new Date() } });
}

export async function markReadByPlatform(organizationId: string) {
  const conversation = await getOrCreateSupportConversation(organizationId);
  return db.supportConversation.update({ where: { id: conversation.id }, data: { platformLastReadAt: new Date() } });
}

export async function setConversationStatus(organizationId: string, status: "OPEN" | "RESOLVED") {
  const conversation = await db.supportConversation.findUnique({ where: { organizationId } });
  if (!conversation) throw new SupportNotFoundError("Conversation not found.");
  return db.supportConversation.update({ where: { id: conversation.id }, data: { status } });
}

export async function getTenantUnreadCount(organizationId: string) {
  const conversation = await db.supportConversation.findUnique({ where: { organizationId } });
  if (!conversation) return 0;
  return db.supportMessage.count({
    where: {
      organizationId,
      conversationId: conversation.id,
      senderRole: "PLATFORM",
      createdAt: conversation.tenantLastReadAt ? { gt: conversation.tenantLastReadAt } : undefined,
    },
  });
}

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

export async function isTenantOnline(organizationId: string) {
  const memberUserIds = await db.organizationMember.findMany({
    where: { organizationId, status: "ACTIVE" },
    select: { userId: true },
  });
  if (memberUserIds.length === 0) return false;
  const recent = await db.userPresence.findFirst({
    where: { userId: { in: memberUserIds.map((m) => m.userId) }, lastSeenAt: { gt: new Date(Date.now() - ONLINE_WINDOW_MS) } },
    select: { userId: true },
  });
  return !!recent;
}

export async function recordHeartbeat(userId: string) {
  await db.userPresence.upsert({
    where: { userId },
    update: { lastSeenAt: new Date() },
    create: { userId, lastSeenAt: new Date() },
  });
}

/** Every real tenant conversation (platform anchor organizations excluded), most recent activity first. */
export async function listPlatformConversations() {
  const anchorIds = await getPlatformAnchorOrganizationIds();
  const conversations = await db.supportConversation.findMany({
    where: { organizationId: { notIn: anchorIds } },
    include: {
      organization: { select: { id: true, name: true, tenantCode: true } },
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
        senderRole: "TENANT",
        createdAt: conversation.platformLastReadAt ? { gt: conversation.platformLastReadAt } : undefined,
      },
    });
    return { ...conversation, unreadCount: unread, hasActivity: conversation.messages.length > 0 };
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
      where: { conversationId: conversation.id, senderRole: "TENANT", createdAt: conversation.platformLastReadAt ? { gt: conversation.platformLastReadAt } : undefined },
    }),
  ));
  return counts.reduce((sum, count) => sum + count, 0);
}
