import { NextResponse } from "next/server";
import { getCurrentTenant } from "@/lib/tenant";
import { canAccessModule, hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getFleetMaintenancePhoto } from "@/modules/fleet/service";
import { parseFleetMaintenancePhoto } from "@/lib/fleet-maintenance-photo";

export async function GET(_request: Request, { params }: { params: Promise<{ requestId: string }> }) {
  const tenant = await getCurrentTenant();
  if (!tenant) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canAccessModule(tenant, "fleet")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const canViewAll =
    hasPermission(tenant, PERMISSIONS.FLEET_VIEW) ||
    hasPermission(tenant, PERMISSIONS.FLEET_MAINTENANCE_MANAGE);
  const { requestId } = await params;
  const request = await getFleetMaintenancePhoto(tenant.organizationId, requestId, tenant.userId, canViewAll);
  if (!request?.photoAsset?.url) return NextResponse.json({ error: "Photo not found" }, { status: 404 });
  const image = parseFleetMaintenancePhoto(request.photoAsset.url);
  if (!image) return NextResponse.json({ error: "Photo not found" }, { status: 404 });
  return new NextResponse(image.bytes, {
    headers: {
      "Content-Type": image.type,
      "Cache-Control": "private, no-cache",
      "Last-Modified": request.photoAsset.updatedAt.toUTCString(),
      "X-Content-Type-Options": "nosniff",
    },
  });
}
