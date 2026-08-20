import { NextResponse } from "next/server";
import { getCurrentTenant } from "@/lib/tenant";
import { canAccessModule } from "@/lib/auth/permissions";
import { getSchoolGuardianPhoto } from "@/modules/school/service";
import { parseSchoolPhotoImage } from "@/lib/school-photo-image";

export async function GET(_request: Request, { params }: { params: Promise<{ guardianId: string }> }) {
  const tenant = await getCurrentTenant();
  if (!tenant) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canAccessModule(tenant, "school")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { guardianId } = await params;
  const guardian = await getSchoolGuardianPhoto(tenant.organizationId, guardianId);
  if (!guardian?.photoData) return NextResponse.json({ error: "Photo not found" }, { status: 404 });
  const image = parseSchoolPhotoImage(guardian.photoData);
  if (!image) return NextResponse.json({ error: "Photo not found" }, { status: 404 });
  return new NextResponse(image.bytes, {
    headers: {
      "Content-Type": image.type,
      "Cache-Control": "private, no-cache",
      "Last-Modified": guardian.updatedAt.toUTCString(),
      "X-Content-Type-Options": "nosniff",
    },
  });
}
