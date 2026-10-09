import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerAuthSession } from "@/lib/auth/session";
import { deleteWebPushSubscription, isWebPushConfigured, saveWebPushSubscription } from "@/lib/web-push";

/** Stores or removes the signed-in user's own push subscription for this device. */
const subscriptionSchema = z.object({
  endpoint: z.string().url().max(1000).refine((value) => value.startsWith("https://"), "Push endpoints must use HTTPS."),
  keys: z.object({ p256dh: z.string().min(16).max(200), auth: z.string().min(8).max(100) }),
});

async function requireUser() {
  const session = await getServerAuthSession();
  return session?.user?.id ?? null;
}

export async function POST(request: Request) {
  const userId = await requireUser();
  if (!userId) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (!isWebPushConfigured()) return NextResponse.json({ error: "Push notifications are not configured." }, { status: 503 });
  const parsed = subscriptionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid subscription." }, { status: 400 });
  await saveWebPushSubscription(userId, { endpoint: parsed.data.endpoint, p256dh: parsed.data.keys.p256dh, auth: parsed.data.keys.auth, userAgent: request.headers.get("user-agent")?.slice(0, 300) });
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}

export async function DELETE(request: Request) {
  const userId = await requireUser();
  if (!userId) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const parsed = z.object({ endpoint: z.string().url().max(1000) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid subscription." }, { status: 400 });
  await deleteWebPushSubscription(userId, parsed.data.endpoint);
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
