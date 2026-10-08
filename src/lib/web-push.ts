import "server-only";

import webpush from "web-push";
import { db } from "@/lib/db";

/**
 * Browser and phone push notifications (Web Push with VAPID). A user opts in
 * per device; subscriptions are stored in WebPushSubscription. Push is
 * configured by three environment variables and is simply off without them:
 *
 * - VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY: generate once with
 *   `npx web-push generate-vapid-keys` and keep the private key secret.
 * - VAPID_SUBJECT: a contact URL or mailto: address for push services.
 *
 * Sending never throws to the caller: a failed push must not fail the action
 * that triggered it. Subscriptions the push service reports as gone (404 or
 * 410) are deleted.
 */

export type PushPayload = { title: string; body: string; url: string; tag?: string };

let configured: boolean | null = null;

export function webPushPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY?.trim() || null;
}

function ensureConfigured() {
  if (configured !== null) return configured;
  const publicKey = webPushPublicKey();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.VAPID_SUBJECT?.trim() || "mailto:support@rockfrostgroup.com";
  if (!publicKey || !privateKey) return (configured = false);
  try {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    configured = true;
  } catch (error) {
    console.error("[web-push] invalid VAPID configuration", error);
    configured = false;
  }
  return configured;
}

export function isWebPushConfigured() {
  return ensureConfigured();
}

export async function saveWebPushSubscription(userId: string, input: { endpoint: string; p256dh: string; auth: string; userAgent?: string | null }) {
  return db.webPushSubscription.upsert({
    where: { endpoint: input.endpoint },
    update: { userId, p256dh: input.p256dh, auth: input.auth, userAgent: input.userAgent ?? null, failureCount: 0 },
    create: { userId, endpoint: input.endpoint, p256dh: input.p256dh, auth: input.auth, userAgent: input.userAgent ?? null },
  });
}

export async function deleteWebPushSubscription(userId: string, endpoint: string) {
  await db.webPushSubscription.deleteMany({ where: { userId, endpoint } });
}

export async function sendWebPushToUsers(userIds: string[], payload: PushPayload) {
  if (!userIds.length || !ensureConfigured()) return { sent: 0 };
  const subscriptions = await db.webPushSubscription.findMany({ where: { userId: { in: [...new Set(userIds)] } } });
  const body = JSON.stringify({ ...payload, title: payload.title.slice(0, 80), body: payload.body.slice(0, 160) });
  let sent = 0;
  await Promise.allSettled(subscriptions.map(async (subscription) => {
    try {
      await webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, body, { TTL: 60 * 60 * 24, urgency: "high", timeout: 5000 });
      sent += 1;
      await db.webPushSubscription.update({ where: { id: subscription.id }, data: { lastUsedAt: new Date(), failureCount: 0 } });
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) await db.webPushSubscription.delete({ where: { id: subscription.id } }).catch(() => undefined);
      else await db.webPushSubscription.update({ where: { id: subscription.id }, data: { failureCount: { increment: 1 } } }).catch(() => undefined);
    }
  }));
  return { sent };
}
