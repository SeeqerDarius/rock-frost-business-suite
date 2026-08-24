import { NextResponse } from "next/server";
import { getCurrentTenant } from "@/lib/tenant";
import { canAccessModule } from "@/lib/auth/permissions";
import { getEmployeePhoto } from "@/modules/hr/service";
import { parseHrEmployeePhoto } from "@/lib/hr-employee-image";

export async function GET(_request: Request, { params }: { params: Promise<{ employeeId: string }> }) {
  const tenant = await getCurrentTenant();
  if (!tenant) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canAccessModule(tenant, "hr")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { employeeId } = await params;
  const employee = await getEmployeePhoto(tenant.organizationId, employeeId);
  if (!employee?.photoData) return NextResponse.json({ error: "Photo not found" }, { status: 404 });
  const photo = parseHrEmployeePhoto(employee.photoData);
  if (!photo) return NextResponse.json({ error: "Photo not found" }, { status: 404 });
  return new NextResponse(photo.bytes, {
    headers: {
      "Content-Type": photo.type,
      "Cache-Control": "private, no-cache",
      "Last-Modified": employee.updatedAt.toUTCString(),
      "X-Content-Type-Options": "nosniff",
    },
  });
}
