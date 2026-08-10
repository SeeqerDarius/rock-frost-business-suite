import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { PUBLIC_SHOWCASE_FILTER } from "@/lib/public-showcase";

const DATA_IMAGE = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/;

export async function GET(_request: Request, { params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  const organization = await db.organization.findFirst({
    where: { ...PUBLIC_SHOWCASE_FILTER, id: organizationId },
    select: { logoUrl: true },
  });
  const match = organization?.logoUrl?.match(DATA_IMAGE);
  if (!match) return new NextResponse(null, { status: 404 });

  return new NextResponse(Buffer.from(match[2], "base64"), {
    headers: {
      "Content-Type": match[1],
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
