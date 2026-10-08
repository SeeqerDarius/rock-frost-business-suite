"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { SchoolCommunicationError, sendStaffMessage, setConversationStatus, staffActorFor, startStaffConversation } from "@/modules/school/communications-service";
import { SCHOOL_COMMS_FLASH_COOKIE } from "@/modules/school/communications-flash";

const PATH = "/app/school/messages";
const ID = /^[a-z0-9]{20,40}$/i;

function value(formData: FormData, key: string) { return String(formData.get(key) ?? ""); }

/** Every action resolves the organization and user from the session and requires the School messaging permission. */
async function authorize() {
  const tenant = await requireModuleAccess("school");
  if (!hasPermission(tenant, PERMISSIONS.SCHOOL_MESSAGES_MANAGE)) redirect(`${PATH}?error=forbidden`);
  return staffActorFor(tenant, (permission) => hasPermission(tenant, permission));
}

async function fail(error: unknown, back: string): Promise<never> {
  if (error instanceof SchoolCommunicationError) {
    (await cookies()).set(SCHOOL_COMMS_FLASH_COOKIE, error.message.slice(0, 240), { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/app/school", maxAge: 30 });
    redirect(`${back}${back.includes("?") ? "&" : "?"}error=${error.code}`);
  }
  throw error;
}

export async function startConversationAction(formData: FormData) {
  const actor = await authorize();
  const [studentId, guardianId] = value(formData, "recipient").split(":");
  if (!ID.test(studentId ?? "") || !ID.test(guardianId ?? "")) redirect(`${PATH}?error=invalid`);
  let conversationId: string;
  try {
    ({ conversationId } = await startStaffConversation(actor, { studentId, guardianId, subject: value(formData, "subject"), body: value(formData, "body"), clientRequestId: value(formData, "clientRequestId") }));
  } catch (error) {
    return fail(error, PATH);
  }
  revalidatePath(PATH);
  redirect(`${PATH}/${conversationId}?sent=1`);
}

export async function sendMessageAction(formData: FormData) {
  const actor = await authorize();
  const conversationId = value(formData, "conversationId");
  if (!ID.test(conversationId)) redirect(`${PATH}?error=invalid`);
  try {
    await sendStaffMessage(actor, { conversationId, body: value(formData, "body"), clientRequestId: value(formData, "clientRequestId") });
  } catch (error) {
    return fail(error, `${PATH}/${conversationId}`);
  }
  revalidatePath(`${PATH}/${conversationId}`);
  redirect(`${PATH}/${conversationId}?sent=1`);
}

export async function setConversationStatusAction(formData: FormData) {
  const actor = await authorize();
  const conversationId = value(formData, "conversationId");
  const status = value(formData, "status");
  if (!ID.test(conversationId) || (status !== "OPEN" && status !== "CLOSED")) redirect(`${PATH}?error=invalid`);
  try {
    await setConversationStatus(actor, conversationId, status);
  } catch (error) {
    return fail(error, `${PATH}/${conversationId}`);
  }
  revalidatePath(PATH);
  redirect(`${PATH}/${conversationId}?saved=1`);
}
