"use server";

import { revalidatePath } from "next/cache";
import { requireCurrentTenant } from "@/lib/tenant";
import { isPlatformOperator } from "@/lib/auth/permissions";
import { getServerAuthSession } from "@/lib/auth/session";
import { longText, cuid } from "@/lib/validation";
import * as support from "@/lib/support/service";
import type { SupportChatMessage } from "@/components/support/support-chat";

const messageSchema = longText.min(1, "Message cannot be empty.").max(4000);

async function requirePlatformOperatorTenant() {
  const tenant = await requireCurrentTenant();
  if (!isPlatformOperator(tenant)) throw new Error("Forbidden.");
  return tenant;
}

const { toChatMessage } = support;

async function currentSenderName() {
  const session = await getServerAuthSession();
  return session?.user?.name || session?.user?.email || "Rock Frost Support";
}

export async function sendPlatformSupportMessage(conversationId: string, content: string): Promise<{ message: SupportChatMessage; otherPartyReadAt: string | null }> {
  const tenant = await requirePlatformOperatorTenant();
  const parsedConversation = cuid.safeParse(conversationId);
  const parsedContent = messageSchema.safeParse(content);
  if (!parsedConversation.success) throw new Error("Invalid conversation.");
  if (!parsedContent.success) throw new Error(parsedContent.error.issues[0]?.message ?? "Invalid message.");
  const senderName = await currentSenderName();
  const { message, conversation } = await support.sendPlatformMessage(parsedConversation.data, tenant.userId, senderName, parsedContent.data);
  revalidatePath("/app/platform/support");
  return { message: toChatMessage(message), otherPartyReadAt: support.otherPartyReadAt(conversation, "PLATFORM") };
}

export async function pollPlatformSupportMessages(conversationId: string, sinceIso: string | null): Promise<{ messages: SupportChatMessage[]; online: boolean; otherPartyReadAt: string | null }> {
  await requirePlatformOperatorTenant();
  const parsedConversation = cuid.safeParse(conversationId);
  if (!parsedConversation.success) throw new Error("Invalid conversation.");
  const { conversation, messages } = await support.listMessagesByConversationId(parsedConversation.data, sinceIso ? new Date(sinceIso) : undefined);
  const online = conversation?.userId ? await support.isTenantOnline(conversation.userId) : false;
  return {
    messages: messages.map(toChatMessage),
    online,
    otherPartyReadAt: conversation ? support.otherPartyReadAt(conversation, "PLATFORM") : null,
  };
}

export async function getPlatformSupportUnreadCount(): Promise<number> {
  await requirePlatformOperatorTenant();
  return support.getPlatformUnreadCount();
}

/** conversationId is the one currently selected in the inbox — recorded on every heartbeat so AI-eligibility checks can be scoped to that one conversation instead of the operator's presence in general. */
export async function platformSupportHeartbeat(conversationId?: string): Promise<void> {
  const tenant = await requirePlatformOperatorTenant();
  const parsedConversation = conversationId ? cuid.safeParse(conversationId) : null;
  await support.recordHeartbeat(tenant.userId, parsedConversation?.success ? parsedConversation.data : undefined);
}

export async function markPlatformSupportRead(conversationId: string): Promise<void> {
  await requirePlatformOperatorTenant();
  const parsedConversation = cuid.safeParse(conversationId);
  if (!parsedConversation.success) throw new Error("Invalid conversation.");
  await support.markReadByPlatform(parsedConversation.data);
  revalidatePath("/app/platform/support");
}

export async function setPlatformSupportStatus(conversationId: string, status: "OPEN" | "RESOLVED"): Promise<void> {
  await requirePlatformOperatorTenant();
  const parsedConversation = cuid.safeParse(conversationId);
  if (!parsedConversation.success) throw new Error("Invalid conversation.");
  await support.setConversationStatus(parsedConversation.data, status);
  revalidatePath("/app/platform/support");
}
