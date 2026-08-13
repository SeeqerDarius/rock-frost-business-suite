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

export async function sendPlatformSupportMessage(organizationId: string, content: string): Promise<SupportChatMessage> {
  const tenant = await requirePlatformOperatorTenant();
  const parsedOrg = cuid.safeParse(organizationId);
  const parsedContent = messageSchema.safeParse(content);
  if (!parsedOrg.success) throw new Error("Invalid organization.");
  if (!parsedContent.success) throw new Error(parsedContent.error.issues[0]?.message ?? "Invalid message.");
  const senderName = await currentSenderName();
  const message = await support.sendPlatformMessage(parsedOrg.data, tenant.userId, senderName, parsedContent.data);
  revalidatePath("/app/platform/support");
  return toChatMessage(message);
}

export async function pollPlatformSupportMessages(organizationId: string, sinceIso: string | null): Promise<{ messages: SupportChatMessage[]; online: boolean }> {
  await requirePlatformOperatorTenant();
  const parsedOrg = cuid.safeParse(organizationId);
  if (!parsedOrg.success) throw new Error("Invalid organization.");
  const { messages } = await support.listSupportMessages(parsedOrg.data, sinceIso ? new Date(sinceIso) : undefined);
  const online = await support.isTenantOnline(parsedOrg.data);
  return { messages: messages.map(toChatMessage), online };
}

export async function platformSupportHeartbeat(): Promise<void> {
  const tenant = await requirePlatformOperatorTenant();
  await support.recordHeartbeat(tenant.userId);
}

export async function markPlatformSupportRead(organizationId: string): Promise<void> {
  await requirePlatformOperatorTenant();
  const parsedOrg = cuid.safeParse(organizationId);
  if (!parsedOrg.success) throw new Error("Invalid organization.");
  await support.markReadByPlatform(parsedOrg.data);
  revalidatePath("/app/platform/support");
}

export async function setPlatformSupportStatus(organizationId: string, status: "OPEN" | "RESOLVED"): Promise<void> {
  await requirePlatformOperatorTenant();
  const parsedOrg = cuid.safeParse(organizationId);
  if (!parsedOrg.success) throw new Error("Invalid organization.");
  await support.setConversationStatus(parsedOrg.data, status);
  revalidatePath("/app/platform/support");
}
