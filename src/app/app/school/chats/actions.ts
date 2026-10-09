"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { SchoolChatBroadcastAudience } from "@prisma/client";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission } from "@/lib/auth/permissions";
import { SchoolChatAttachmentError, schoolChatAttachmentData } from "@/lib/school-chat-attachment";
import {
  addGroupMembers, broadcastMessage, createGroupChat, deleteChatMessage, editChatMessage, leaveChat, reactToChatMessage,
  removeGroupMember, resolveChatViewer, SchoolChatError, sendChatMessage, setChatPreferences, setGroupAdmin, startDirectChat, updateGroupSettings,
} from "@/modules/school/chat-service";
import { SCHOOL_COMMS_FLASH_COOKIE } from "@/modules/school/communications-flash";

const BASE = "/app/school/chats";
const ID = /^[a-z0-9]{20,40}$/i;

function value(formData: FormData, key: string) { return String(formData.get(key) ?? ""); }
function id(formData: FormData, key: string) {
  const raw = value(formData, key);
  return ID.test(raw) ? raw : null;
}

/** Every chat action resolves the viewer (staff or guardian) from the session; the service re-checks membership and reachability. */
async function viewerOrRedirect() {
  const tenant = await requireModuleAccess("school");
  const viewer = await resolveChatViewer(tenant, (permission) => hasPermission(tenant, permission));
  if (!viewer) redirect(`${BASE}?error=forbidden`);
  return viewer;
}

async function failTo(error: unknown, back: string): Promise<never> {
  if (error instanceof SchoolChatError || error instanceof SchoolChatAttachmentError) {
    (await cookies()).set(SCHOOL_COMMS_FLASH_COOKIE, error.message.slice(0, 240), { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/app/school", maxAge: 30 });
    redirect(`${back}${back.includes("?") ? "&" : "?"}error=${error instanceof SchoolChatError ? error.code : "invalid"}`);
  }
  throw error;
}

export async function sendChatMessageAction(formData: FormData) {
  const viewer = await viewerOrRedirect();
  const chatId = id(formData, "chatId");
  if (!chatId) redirect(`${BASE}?error=invalid`);
  const back = `${BASE}/${chatId}`;
  try {
    const file = formData.get("file");
    const attachment = await schoolChatAttachmentData(file instanceof File ? file : null);
    await sendChatMessage(viewer, { chatId, body: value(formData, "body"), clientRequestId: value(formData, "clientRequestId"), replyToId: id(formData, "replyToId"), attachment });
  } catch (error) {
    return failTo(error, back);
  }
  revalidatePath(back);
  redirect(back);
}

export async function editChatMessageAction(formData: FormData) {
  const viewer = await viewerOrRedirect();
  const chatId = id(formData, "chatId");
  const messageId = id(formData, "messageId");
  if (!chatId || !messageId) redirect(`${BASE}?error=invalid`);
  try {
    await editChatMessage(viewer, { messageId, body: value(formData, "body") });
  } catch (error) {
    return failTo(error, `${BASE}/${chatId}`);
  }
  redirect(`${BASE}/${chatId}`);
}

export async function deleteChatMessageAction(formData: FormData) {
  const viewer = await viewerOrRedirect();
  const chatId = id(formData, "chatId");
  const messageId = id(formData, "messageId");
  if (!chatId || !messageId) redirect(`${BASE}?error=invalid`);
  try {
    await deleteChatMessage(viewer, messageId);
  } catch (error) {
    return failTo(error, `${BASE}/${chatId}`);
  }
  redirect(`${BASE}/${chatId}`);
}

export async function reactToChatMessageAction(formData: FormData) {
  const viewer = await viewerOrRedirect();
  const chatId = id(formData, "chatId");
  const messageId = id(formData, "messageId");
  if (!chatId || !messageId) redirect(`${BASE}?error=invalid`);
  try {
    await reactToChatMessage(viewer, { messageId, emoji: value(formData, "emoji") });
  } catch (error) {
    return failTo(error, `${BASE}/${chatId}`);
  }
  redirect(`${BASE}/${chatId}`);
}

export async function startDirectChatAction(formData: FormData) {
  const viewer = await viewerOrRedirect();
  const targetUserId = id(formData, "userId");
  if (!targetUserId) redirect(`${BASE}/new?error=invalid`);
  let chatId: string;
  try {
    ({ chatId } = await startDirectChat(viewer, targetUserId));
  } catch (error) {
    return failTo(error, `${BASE}/new`);
  }
  redirect(`${BASE}/${chatId}`);
}

export async function createGroupChatAction(formData: FormData) {
  const viewer = await viewerOrRedirect();
  let chatId: string;
  try {
    ({ chatId } = await createGroupChat(viewer, {
      name: value(formData, "name"),
      description: value(formData, "description"),
      memberUserIds: formData.getAll("memberUserIds").map(String).filter((entry) => ID.test(entry)),
      onlyAdminsCanPost: formData.get("onlyAdminsCanPost") === "on",
    }));
  } catch (error) {
    return failTo(error, `${BASE}/new?tab=group`);
  }
  revalidatePath(BASE);
  redirect(`${BASE}/${chatId}`);
}

async function groupAction(formData: FormData, operation: (viewer: Awaited<ReturnType<typeof viewerOrRedirect>>, chatId: string) => Promise<unknown>, after = "info") {
  const viewer = await viewerOrRedirect();
  const chatId = id(formData, "chatId");
  if (!chatId) redirect(`${BASE}?error=invalid`);
  const back = `${BASE}/${chatId}${after ? `/${after}` : ""}`;
  try {
    await operation(viewer, chatId);
  } catch (error) {
    return failTo(error, back);
  }
  revalidatePath(`${BASE}/${chatId}`);
  redirect(`${back}?saved=1`);
}

export async function addGroupMembersAction(formData: FormData) {
  await groupAction(formData, (viewer, chatId) => addGroupMembers(viewer, chatId, formData.getAll("memberUserIds").map(String).filter((entry) => ID.test(entry))));
}

export async function removeGroupMemberAction(formData: FormData) {
  await groupAction(formData, (viewer, chatId) => removeGroupMember(viewer, chatId, value(formData, "userId")));
}

export async function setGroupAdminAction(formData: FormData) {
  await groupAction(formData, (viewer, chatId) => setGroupAdmin(viewer, chatId, value(formData, "userId"), formData.get("admin") === "true"));
}

export async function updateGroupSettingsAction(formData: FormData) {
  await groupAction(formData, (viewer, chatId) => updateGroupSettings(viewer, chatId, { name: value(formData, "name"), description: value(formData, "description"), onlyAdminsCanPost: formData.get("onlyAdminsCanPost") === "on" }));
}

export async function leaveChatAction(formData: FormData) {
  const viewer = await viewerOrRedirect();
  const chatId = id(formData, "chatId");
  if (!chatId) redirect(`${BASE}?error=invalid`);
  try {
    await leaveChat(viewer, chatId);
  } catch (error) {
    return failTo(error, `${BASE}/${chatId}/info`);
  }
  revalidatePath(BASE);
  redirect(BASE);
}

export async function setChatPreferencesAction(formData: FormData) {
  const mute = value(formData, "mute");
  const preference = value(formData, "preference");
  await groupAction(formData, (viewer, chatId) => setChatPreferences(viewer, chatId, {
    ...(preference === "pin" ? { pinned: true } : preference === "unpin" ? { pinned: false } : {}),
    ...(preference === "archive" ? { archived: true } : preference === "unarchive" ? { archived: false } : {}),
    ...(mute === "8h" || mute === "1w" || mute === "always" || mute === "off" ? { mute } : {}),
  }), "");
}

const AUDIENCES = ["ALL_GUARDIANS", "CLASS_GUARDIANS", "ALL_STAFF", "SELECTED"] as const;

export async function broadcastMessageAction(formData: FormData) {
  const viewer = await viewerOrRedirect();
  const audience = value(formData, "audience") as SchoolChatBroadcastAudience;
  if (!(AUDIENCES as readonly string[]).includes(audience)) redirect(`${BASE}/broadcast?error=invalid`);
  let recipients: number;
  try {
    ({ recipients } = await broadcastMessage(viewer, {
      audience,
      classId: id(formData, "classId"),
      userIds: formData.getAll("userIds").map(String).filter((entry) => ID.test(entry)),
      body: value(formData, "body"),
      clientRequestId: value(formData, "clientRequestId"),
    }));
  } catch (error) {
    return failTo(error, `${BASE}/broadcast`);
  }
  revalidatePath(BASE);
  redirect(`${BASE}/broadcast?sent=${recipients}`);
}
