"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { SchoolAnnouncementAudience } from "@prisma/client";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { AUDIENCE_LABEL, publishAnnouncement, SchoolCommunicationError, staffActorFor, withdrawAnnouncement } from "@/modules/school/communications-service";
import { SCHOOL_COMMS_FLASH_COOKIE } from "@/modules/school/communications-flash";

const PATH = "/app/school/announcements";
const ID = /^[a-z0-9]{20,40}$/i;

function value(formData: FormData, key: string) { return String(formData.get(key) ?? ""); }

/** Publishing and withdrawing require the announcements permission, resolved from the session. */
async function authorize() {
  const tenant = await requireModuleAccess("school");
  if (!hasPermission(tenant, PERMISSIONS.SCHOOL_ANNOUNCEMENTS_PUBLISH)) redirect(`${PATH}?error=forbidden`);
  return staffActorFor(tenant, (permission) => hasPermission(tenant, permission));
}

async function fail(error: unknown): Promise<never> {
  if (error instanceof SchoolCommunicationError) {
    (await cookies()).set(SCHOOL_COMMS_FLASH_COOKIE, error.message.slice(0, 240), { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/app/school", maxAge: 30 });
    redirect(`${PATH}?error=${error.code}`);
  }
  throw error;
}

export async function publishAnnouncementAction(formData: FormData) {
  const actor = await authorize();
  const audience = value(formData, "audience");
  if (!(audience in AUDIENCE_LABEL)) redirect(`${PATH}?error=invalid`);
  const classId = value(formData, "classId");
  try {
    await publishAnnouncement(actor, {
      title: value(formData, "title"),
      body: value(formData, "body"),
      audience: audience as SchoolAnnouncementAudience,
      classId: audience === "CLASS_GUARDIANS" && ID.test(classId) ? classId : null,
      clientRequestId: value(formData, "clientRequestId"),
    });
  } catch (error) {
    return fail(error);
  }
  revalidatePath(PATH);
  redirect(`${PATH}?saved=1`);
}

export async function withdrawAnnouncementAction(formData: FormData) {
  const actor = await authorize();
  const announcementId = value(formData, "announcementId");
  if (!ID.test(announcementId)) redirect(`${PATH}?error=invalid`);
  try {
    await withdrawAnnouncement(actor, announcementId);
  } catch (error) {
    return fail(error);
  }
  revalidatePath(PATH);
  redirect(`${PATH}?withdrawn=1`);
}
