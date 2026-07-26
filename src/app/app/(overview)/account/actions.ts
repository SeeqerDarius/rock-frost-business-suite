"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { getServerAuthSession } from "@/lib/auth/session";
import { verifyCurrentPassword } from "@/lib/auth/verify-password";
import { revokeUserSessions } from "@/lib/auth/session-revocation";

const MAX_IMAGE_BYTES = 1024 * 1024;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function value(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

async function accountPath() {
  const referer = (await headers()).get("referer");
  if (!referer) return "/app/account";
  try {
    return new URL(referer).pathname.startsWith("/app/platform/account")
      ? "/app/platform/account"
      : "/app/account";
  } catch {
    return "/app/account";
  }
}

async function currentUserId() {
  const session = await getServerAuthSession();
  if (!session?.user?.id) redirect("/login");
  return session.user.id;
}

export async function updateProfile(formData: FormData): Promise<void> {
  const destination = await accountPath();
  const userId = await currentUserId();
  const name = value(formData, "name");
  const email = value(formData, "email").toLowerCase();
  const phone = value(formData, "phone") || null;
  if (name.length < 2 || !email.includes("@")) redirect(`${destination}?error=invalid-profile`);

  const current = await db.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (!current) redirect("/login");
  const emailChanged = current.email.toLowerCase() !== email;
  if (emailChanged && !(await verifyCurrentPassword(userId, value(formData, "currentPassword")))) {
    redirect(`${destination}?error=password-required`);
  }

  const duplicate = await db.user.findFirst({ where: { email, id: { not: userId } }, select: { id: true } });
  if (duplicate) redirect(`${destination}?error=email-in-use`);

  await db.user.update({ where: { id: userId }, data: { name, email, phone } });
  revalidatePath(destination);
  if (emailChanged) {
    await revokeUserSessions(userId, "email_changed");
    redirect("/login?message=email-updated");
  }
  redirect(`${destination}?saved=profile`);
}

export async function uploadProfilePicture(formData: FormData): Promise<void | { ok: boolean; error?: string }> {
  const destination = await accountPath();
  const userId = await currentUserId();
  const file = formData.get("image");
  const clientSubmission = formData.get("_client") === "1";
  if (!(file instanceof File) || file.size === 0 || file.size > MAX_IMAGE_BYTES || !IMAGE_TYPES.has(file.type)) {
    if (clientSubmission) return { ok: false, error: "Choose a JPG, PNG, or WebP image no larger than 1 MB." };
    redirect(`${destination}?error=invalid-image`);
  }
  const image = `data:${file.type};base64,${Buffer.from(await file.arrayBuffer()).toString("base64")}`;
  await db.user.update({ where: { id: userId }, data: { image } });
  revalidatePath("/app", "layout");
  if (clientSubmission) return { ok: true };
  redirect(`${destination}?saved=photo`);
}

export async function changePassword(formData: FormData): Promise<void> {
  const destination = await accountPath();
  const userId = await currentUserId();
  const currentPassword = value(formData, "currentPassword");
  const newPassword = value(formData, "newPassword");
  const confirmation = value(formData, "confirmation");
  if (newPassword.length < 8 || newPassword !== confirmation) redirect(`${destination}?error=invalid-new-password`);
  if (!(await verifyCurrentPassword(userId, currentPassword))) redirect(`${destination}?error=wrong-password`);

  await db.user.update({
    where: { id: userId },
    data: { passwordHash: await bcrypt.hash(newPassword, 12) },
  });
  await revokeUserSessions(userId, "password_changed");
  redirect("/login?message=password-changed");
}
