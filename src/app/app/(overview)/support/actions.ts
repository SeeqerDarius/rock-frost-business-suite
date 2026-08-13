"use server";

import { revalidatePath } from "next/cache";
import { requireCurrentTenant } from "@/lib/tenant";
import { getServerAuthSession } from "@/lib/auth/session";
import { longText } from "@/lib/validation";
import * as support from "@/lib/support/service";
import type { SupportChatMessage } from "@/components/support/support-chat";

const { toChatMessage } = support;

const messageSchema = longText.min(1, "Message cannot be empty.").max(4000);

async function currentSenderName() {
  const session = await getServerAuthSession();
  return session?.user?.name || session?.user?.email || "You";
}

export async function sendTenantSupportMessage(content: string): Promise<{ message: SupportChatMessage; otherPartyReadAt: string | null }> {
  const tenant = await requireCurrentTenant();
  const parsed = messageSchema.safeParse(content);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Invalid message.");
  const senderName = await currentSenderName();
  const { message, conversation } = await support.sendTenantMessage(tenant.organizationId, tenant.userId, senderName, parsed.data);
  revalidatePath("/app/support");
  return { message: toChatMessage(message), otherPartyReadAt: support.otherPartyReadAt(conversation, "TENANT") };
}

export async function pollTenantSupportMessages(sinceIso: string | null): Promise<{ messages: SupportChatMessage[]; online: boolean; otherPartyReadAt: string | null }> {
  const tenant = await requireCurrentTenant();
  const { conversation, messages } = await support.listSupportMessages(tenant.organizationId, sinceIso ? new Date(sinceIso) : undefined);
  const online = await support.isPlatformOnline();
  return {
    messages: messages.map(toChatMessage),
    online,
    otherPartyReadAt: conversation ? support.otherPartyReadAt(conversation, "TENANT") : null,
  };
}

export async function tenantSupportHeartbeat(): Promise<void> {
  const tenant = await requireCurrentTenant();
  await support.recordHeartbeat(tenant.userId);
}

export async function markTenantSupportRead(): Promise<void> {
  const tenant = await requireCurrentTenant();
  await support.markReadByTenant(tenant.organizationId);
  revalidatePath("/app/support");
}

export async function getTenantSupportUnreadCount(): Promise<number> {
  const tenant = await requireCurrentTenant();
  return support.getTenantUnreadCount(tenant.organizationId);
}
