import { NextResponse } from "next/server";
import { getCurrentTenant } from "@/lib/tenant";
import { canAccessModule } from "@/lib/auth/permissions";
import { getSchoolStudentPhoto } from "@/modules/school/service";
import { parseSchoolPhotoImage } from "@/lib/school-photo-image";

export async function GET(_request: Request, { params }: { params: Promise<{ studentId: string }> }) {
  const tenant = await getCurrentTenant();
  if (!tenant) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canAccessModule(tenant, "school")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { studentId } = await params;
  const student = await getSchoolStudentPhoto(tenant.organizationId, studentId);
  if (!student?.photoData) return NextResponse.json({ error: "Photo not found" }, { status: 404 });
  const image = parseSchoolPhotoImage(student.photoData);
  if (!image) return NextResponse.json({ error: "Photo not found" }, { status: 404 });
  return new NextResponse(image.bytes, {
    headers: {
      "Content-Type": image.type,
      "Cache-Control": "private, no-cache",
      "Last-Modified": student.updatedAt.toUTCString(),
      "X-Content-Type-Options": "nosniff",
    },
  });
}
