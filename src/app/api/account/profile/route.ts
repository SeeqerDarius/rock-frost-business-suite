import { NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/auth/session";
import { db } from "@/lib/db";

export async function GET() {
  const session = await getServerAuthSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { name: true, email: true, image: true },
  });
  if (!user) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(user, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
