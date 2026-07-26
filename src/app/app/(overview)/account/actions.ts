"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getServerAuthSession } from "@/lib/auth/session";
import { verifyCurrentPassword } from "@/lib/auth/verify-password";
import { revokeUserSessions } from "@/lib/auth/session-revocation";

const MAX_IMAGE_BYTES = 1024 * 1024;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function value(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

async function currentUserId() {
  const session = await getServerAuthSession();
  if (!session?.user?.id) redirect("/login");
  return session.user.id;
}

export async function updateProfile(formData: FormData): Promise<void> {
  const userId = await currentUserId();
  const name = value(formData, "name");
  const email = value(formData, "email").toLowerCase();
  const phone = value(formData, "phone") || null;
  if (name.length < 2 || !email.includes("@")) redirect("/app/account?error=invalid-profile");

  const current = await db.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (!current) redirect("/login");
  const emailChanged = current.email.toLowerCase() !== email;
  if (emailChanged && !(await verifyCurrentPassword(userId, value(formData, "currentPassword")))) {
    redirect("/app/account?error=password-required");
  }

  const duplicate = await db.user.findFirst({ where: { email, id: { not: userId } }, select: { id: true } });
  if (duplicate) redirect("/app/account?error=email-in-use");

  await db.user.update({ where: { id: userId }, data: { name, email, phone } });
  revalidatePath("/app/account");
  if (emailChanged) {
    await revokeUserSessions(userId, "email_changed");
    redirect("/login?message=email-updated");
  }
  redirect("/app/account?saved=profile");
}

export async function uploadProfilePicture(formData: FormData): Promise<void> {
  const userId = await currentUserId();
  const file = formData.get("image");
  if (!(file instanceof File) || file.size === 0 || file.size > MAX_IMAGE_BYTES || !IMAGE_TYPES.has(file.type)) {
    redirect("/app/account?error=invalid-image");
  }
  const image = `data:${file.type};base64,${Buffer.from(await file.arrayBuffer()).toString("base64")}`;
  await db.user.update({ where: { id: userId }, data: { image } });
  revalidatePath("/app/account");
  redirect("/app/account?saved=photo");
}

export async function changePassword(formData: FormData): Promise<void> {
  const userId = await currentUserId();
  const currentPassword = value(formData, "currentPassword");
  const newPassword = value(formData, "newPassword");
  const confirmation = value(formData, "confirmation");
  if (newPassword.length < 8 || newPassword !== confirmation) redirect("/app/account?error=invalid-new-password");
  if (!(await verifyCurrentPassword(userId, currentPassword))) redirect("/app/account?error=wrong-password");

  await db.user.update({
    where: { id: userId },
    data: { passwordHash: await bcrypt.hash(newPassword, 12) },
  });
  await revokeUserSessions(userId, "password_changed");
  redirect("/login?message=password-changed");
}
