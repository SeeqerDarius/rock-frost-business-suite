"use server";

import { revalidatePath } from "next/cache";
import { requireCurrentTenant } from "@/lib/tenant";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getServerAuthSession } from "@/lib/auth/session";
import { longText, cuid } from "@/lib/validation";
import * as support from "@/lib/support/service";
import type { SupportChatMessage } from "@/components/support/support-chat";

const messageSchema = longText.min(1, "Message cannot be empty.").max(4000);

/**
 * Independently re-checks ORG_SETTINGS_MANAGE on every action rather than
 * trusting the page-level guard alone — the same "never trust the page guard
 * alone" convention the platform support inbox already follows.
 */
async function requireOrgSupportAdminTenant() {
  const tenant = await requireCurrentTenant();
  if (!hasPermission(tenant, PERMISSIONS.ORG_SETTINGS_MANAGE)) throw new Error("Forbidden.");
  return tenant;
}

const { toChatMessage } = support;

async function currentSenderName() {
  const session = await getServerAuthSession();
  const name = session?.user?.name || session?.user?.email || "Organization admin";
  return `${name} (Organization admin)`;
}

export async function sendAdminSupportMessage(conversationId: string, content: string): Promise<{ message: SupportChatMessage; otherPartyReadAt: string | null }> {
  const tenant = await requireOrgSupportAdminTenant();
  const parsedConversation = cuid.safeParse(conversationId);
  const parsedContent = messageSchema.safeParse(content);
  if (!parsedConversation.success) throw new Error("Invalid conversation.");
  if (!parsedContent.success) throw new Error(parsedContent.error.issues[0]?.message ?? "Invalid message.");
  const senderName = await currentSenderName();
  const { message, conversation } = await support.sendAdminMessage(tenant.organizationId, parsedConversation.data, tenant.userId, senderName, parsedContent.data);
  revalidatePath("/app/support/inbox");
  return { message: toChatMessage(message), otherPartyReadAt: support.otherPartyReadAt(conversation, "ADMIN") };
}

export async function pollAdminSupportMessages(conversationId: string, sinceIso: string | null): Promise<{ messages: SupportChatMessage[]; online: boolean; otherPartyReadAt: string | null }> {
  const tenant = await requireOrgSupportAdminTenant();
  const parsedConversation = cuid.safeParse(conversationId);
  if (!parsedConversation.success) throw new Error("Invalid conversation.");
  const { conversation, messages } = await support.listMessagesByConversationId(parsedConversation.data, sinceIso ? new Date(sinceIso) : undefined);
  if (conversation && conversation.organizationId !== tenant.organizationId) throw new Error("Forbidden.");
  const online = conversation?.userId ? await support.isTenantOnline(conversation.userId) : false;
  return {
    messages: messages.map(toChatMessage),
    online,
    otherPartyReadAt: conversation ? support.otherPartyReadAt(conversation, "ADMIN") : null,
  };
}

export async function adminSupportHeartbeat(): Promise<void> {
  const tenant = await requireOrgSupportAdminTenant();
  await support.recordHeartbeat(tenant.userId);
}

export async function markAdminSupportRead(conversationId: string): Promise<void> {
  const tenant = await requireOrgSupportAdminTenant();
  const parsedConversation = cuid.safeParse(conversationId);
  if (!parsedConversation.success) throw new Error("Invalid conversation.");
  await support.markReadByAdmin(tenant.organizationId, parsedConversation.data);
  revalidatePath("/app/support/inbox");
}

export async function getAdminSupportUnreadCount(): Promise<number> {
  const tenant = await requireOrgSupportAdminTenant();
  return support.getOrgSupportUnreadCount(tenant.organizationId);
}
