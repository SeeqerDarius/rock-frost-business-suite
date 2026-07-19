import "server-only";

import { db } from "@/lib/db";
import type { NotificationChannel, Prisma } from "@prisma/client";

interface CreateNotificationArgs {
  organizationId: string;
  userId?: string | null;
  type: string;
  channel?: NotificationChannel;
  title: string;
  message: string;
  metadata?: Prisma.InputJsonValue | null;
}

/**
 * Creates a notification. IN_APP notifications are considered delivered as
 * soon as they're stored (there's nothing further to "send"). Other channels
 * (EMAIL, SMS, PUSH) don't have a delivery integration wired up yet, so they
 * stay QUEUED — this is an honest reflection of what's actually implemented,
 * not a placeholder pretending to work.
 */
export async function createNotification(args: CreateNotificationArgs) {
  const channel = args.channel ?? "IN_APP";
  return db.notification.create({
    data: {
      organizationId: args.organizationId,
      userId: args.userId ?? undefined,
      type: args.type,
      channel,
      title: args.title,
      message: args.message,
      metadata: args.metadata ?? undefined,
      status: channel === "IN_APP" ? "SENT" : "QUEUED",
      sentAt: channel === "IN_APP" ? new Date() : null,
    },
  });
}

export async function getNotificationsForUser(organizationId: string, userId: string, take = 30) {
  return db.notification.findMany({
    where: { organizationId, userId },
    orderBy: { createdAt: "desc" },
    take,
  });
}

export async function getUnreadNotificationCount(organizationId: string, userId: string) {
  return db.notification.count({ where: { organizationId, userId, readAt: null } });
}

/** Ownership check is baked into the where clause — a user can only mark their own notifications read. */
export async function markNotificationRead(id: string, userId: string) {
  return db.notification.updateMany({
    where: { id, userId },
    data: { readAt: new Date() },
  });
}
