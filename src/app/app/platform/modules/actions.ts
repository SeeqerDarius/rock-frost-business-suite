"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireCurrentTenant } from "@/lib/tenant";
import { isPlatformOperator } from "@/lib/auth/permissions";
import { getServerAuthSession } from "@/lib/auth/session";
import { logAuditEvent } from "@/lib/audit";
import { cuid, parseWithSchema } from "@/lib/validation";

const toggleSchema = z.object({ moduleId: cuid });

/**
 * Marks a product ACTIVE or INACTIVE in the catalogue - not per-organization
 * access (OrganizationModule.enabled, toggled from an org's own detail page
 * via toggleOrganizationModule in ../actions.ts). Every real consumer of
 * Module.status already only offers ACTIVE modules: new subscription
 * creation (platform/subscriptions/service.ts), the org detail page's own
 * enable/configure list, the tenant self-service "request a module" page,
 * and the public contact form's module matching. None of them touch
 * OrganizationModule - an organization that already has a module enabled
 * keeps it working exactly as before; this only stops the module from being
 * offered to anyone new. Deliberately never sets COMING_SOON - that third
 * state is for a product not yet launched, a different concept from
 * "temporarily paused," and isn't exposed by this simple on/off control.
 */
export async function toggleModuleAvailability(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const tenant = await requireCurrentTenant();
  if (!isPlatformOperator(tenant)) {
    return { ok: false, error: "You do not have permission to change module availability." };
  }

  const parsed = parseWithSchema(toggleSchema, { moduleId: String(formData.get("moduleId") ?? "").trim() });
  if (!parsed.success) {
    return { ok: false, error: "The module selection is invalid." };
  }
  const available = formData.get("available") === "true";

  const module_ = await db.module.findUnique({ where: { id: parsed.data.moduleId } });
  if (!module_) {
    return { ok: false, error: "The module was not found." };
  }

  await db.module.update({ where: { id: module_.id }, data: { status: available ? "ACTIVE" : "INACTIVE" } });

  const session = await getServerAuthSession();
  await logAuditEvent({
    organizationId: null,
    userId: session?.user?.id,
    module: "platform",
    action: available ? "module.marked_available" : "module.marked_unavailable",
    entityName: "Module",
    entityId: module_.id,
    metadata: { code: module_.code, name: module_.name },
  });

  revalidatePath("/app/platform/modules");
  revalidatePath("/app/platform/subscriptions");
  revalidatePath("/app/platform/requests");
  revalidatePath("/app/platform/organizations");
  revalidatePath("/app/module-requests");
  return { ok: true };
}
