import { NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/auth/session";
import { isPlatformUser } from "@/lib/auth/platform-identity";
import { findPlatformOrganizationMetadata, readPlatformMarketing } from "@/lib/platform-marketing";

const DATA_IMAGE = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/;

export async function GET(_request: Request, { params }: { params: Promise<{ customerId: string }> }) {
  const { customerId } = await params;
  const platformOrganization = await findPlatformOrganizationMetadata();
  const marketing = readPlatformMarketing(platformOrganization?.metadata);
  const customer = marketing.externalCustomers.find((entry) => entry.id === customerId);
  if (!customer) return new NextResponse(null, { status: 404 });

  let mayView = marketing.showcaseEnabled && customer.enabled;
  if (!mayView) {
    const session = await getServerAuthSession();
    mayView = Boolean(session?.user?.id && await isPlatformUser(session.user.id));
  }
  if (!mayView) return new NextResponse(null, { status: 404 });
  const match = customer.logoUrl.match(DATA_IMAGE);
  if (!match) return new NextResponse(null, { status: 404 });

  return new NextResponse(Buffer.from(match[2], "base64"), {
    headers: {
      "Content-Type": match[1],
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
