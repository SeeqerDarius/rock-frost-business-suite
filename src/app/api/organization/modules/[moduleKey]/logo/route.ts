import { getCurrentTenant } from "@/lib/tenant";
import { db } from "@/lib/db";
import { getModule } from "@/platform/modules/registry";
import { MODULE_BRANDING_IMAGE_TYPES } from "@/lib/module-branding";

export async function GET(_request: Request, { params }: { params: Promise<{ moduleKey: string }> }) {
  const tenant = await getCurrentTenant();
  if (!tenant) return new Response(null, { status: 401, headers: { "Cache-Control": "private, no-store" } });
  const { moduleKey } = await params;
  if (!getModule(moduleKey) || !tenant.enabledModuleKeys.includes(moduleKey)) {
    return new Response(null, { status: 404, headers: { "Cache-Control": "private, no-store" } });
  }
  const branding = await db.organizationModuleBranding.findUnique({
    where: { organizationId_moduleKey: { organizationId: tenant.organizationId, moduleKey } },
    select: { logoUrl: true },
  });
  const match = branding?.logoUrl?.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!match || !MODULE_BRANDING_IMAGE_TYPES.has(match[1])) {
    return new Response(null, { status: 404, headers: { "Cache-Control": "private, no-store" } });
  }
  return new Response(Buffer.from(match[2], "base64"), {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Type": match[1],
      "X-Content-Type-Options": "nosniff",
    },
  });
}
