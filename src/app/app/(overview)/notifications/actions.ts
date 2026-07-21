"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireCurrentTenant } from "@/lib/tenant";
import { getServerAuthSession } from "@/lib/auth/session";
import { cuid, parseWithSchema } from "@/lib/validation";

export async function markNotificationRead(formData: FormData): Promise<void> {
  const notificationIdRaw = String(formData.get("notificationId") ?? "").trim();
  const tenant = await requireCurrentTenant();
  if (!notificationIdRaw) return;

  const parsed = parseWithSchema(cuid, notificationIdRaw);
  if (!parsed.success) return;
  const notificationId = parsed.data;

  await db.notification.updateMany({
    where: { id: notificationId, organizationId: tenant.organizationId },
    data: { readAt: new Date() },
  });

  revalidatePath("/app/notifications");
}

export async function markAllNotificationsRead(): Promise<void> {
  const tenant = await requireCurrentTenant();
  const session = await getServerAuthSession();
  const userId = session?.user?.id;

  await db.notification.updateMany({
    where: {
      organizationId: tenant.organizationId,
      readAt: null,
      OR: [{ userId }, { userId: null }],
    },
    data: { readAt: new Date() },
  });

  revalidatePath("/app/notifications");
}
