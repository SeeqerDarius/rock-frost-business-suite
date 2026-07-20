"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireCurrentTenant } from "@/lib/tenant";
import { getServerAuthSession } from "@/lib/auth/session";

export async function markNotificationRead(formData: FormData): Promise<void> {
  const notificationId = String(formData.get("notificationId") ?? "");
  const tenant = await requireCurrentTenant();
  if (!notificationId) return;

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
