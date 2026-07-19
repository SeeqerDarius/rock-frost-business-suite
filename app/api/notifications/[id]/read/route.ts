import { NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/auth/session";
import { markNotificationRead } from "@/lib/notifications";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerAuthSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  await markNotificationRead(id, session.user.id);

  return NextResponse.json({ ok: true });
}
