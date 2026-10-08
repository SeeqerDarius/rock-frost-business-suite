"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { SchoolCommunicationError, sendGuardianMessage, startGuardianConversation } from "@/modules/school/communications-service";
import { SCHOOL_COMMS_FLASH_COOKIE } from "@/modules/school/communications-flash";

const PATH = "/app/school/portal/messages";
const ID = /^[a-z0-9]{20,40}$/i;

function value(formData: FormData, key: string) { return String(formData.get(key) ?? ""); }

/** Guardian actions resolve the guardian from the signed-in portal account inside the service, never from form input. */
async function authorize() {
  const tenant = await requireModuleAccess("school");
  if (!hasPermission(tenant, PERMISSIONS.SCHOOL_PORTAL_VIEW)) redirect(`${PATH}?error=forbidden`);
  return tenant;
}

async function fail(error: unknown, back: string): Promise<never> {
  if (error instanceof SchoolCommunicationError) {
    (await cookies()).set(SCHOOL_COMMS_FLASH_COOKIE, error.message.slice(0, 240), { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/app/school", maxAge: 30 });
    redirect(`${back}?error=${error.code}`);
  }
  throw error;
}

export async function startGuardianConversationAction(formData: FormData) {
  const tenant = await authorize();
  const studentId = value(formData, "studentId");
  if (!ID.test(studentId)) redirect(`${PATH}?error=invalid`);
  let conversationId: string;
  try {
    ({ conversationId } = await startGuardianConversation(tenant.organizationId, tenant.userId, { studentId, subject: value(formData, "subject"), body: value(formData, "body"), clientRequestId: value(formData, "clientRequestId") }));
  } catch (error) {
    return fail(error, PATH);
  }
  revalidatePath(PATH);
  redirect(`${PATH}/${conversationId}?sent=1`);
}

export async function sendGuardianMessageAction(formData: FormData) {
  const tenant = await authorize();
  const conversationId = value(formData, "conversationId");
  if (!ID.test(conversationId)) redirect(`${PATH}?error=invalid`);
  try {
    await sendGuardianMessage(tenant.organizationId, tenant.userId, { conversationId, body: value(formData, "body"), clientRequestId: value(formData, "clientRequestId") });
  } catch (error) {
    return fail(error, `${PATH}/${conversationId}`);
  }
  revalidatePath(`${PATH}/${conversationId}`);
  redirect(`${PATH}/${conversationId}?sent=1`);
}
