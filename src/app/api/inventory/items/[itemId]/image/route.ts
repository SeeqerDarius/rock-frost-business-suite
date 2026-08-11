import { NextResponse } from "next/server";
import { getCurrentTenant } from "@/lib/tenant";
import { canAccessModule } from "@/lib/auth/permissions";
import { getItemImage } from "@/modules/inventory/service";
import { parseInventoryItemImage } from "@/lib/inventory-item-image";

export async function GET(_request: Request, { params }: { params: Promise<{ itemId: string }> }) {
  const tenant = await getCurrentTenant();
  if (!tenant) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canAccessModule(tenant, "inventory")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { itemId } = await params;
  const item = await getItemImage(tenant.organizationId, itemId);
  if (!item?.imageData) return NextResponse.json({ error: "Image not found" }, { status: 404 });
  const image = parseInventoryItemImage(item.imageData);
  if (!image) return NextResponse.json({ error: "Image not found" }, { status: 404 });
  return new NextResponse(image.bytes, {
    headers: {
      "Content-Type": image.type,
      "Cache-Control": "private, no-cache",
      "Last-Modified": item.updatedAt.toUTCString(),
      "X-Content-Type-Options": "nosniff",
    },
  });
}
