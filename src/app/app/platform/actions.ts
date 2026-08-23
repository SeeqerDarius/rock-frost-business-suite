"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireCurrentTenant } from "@/lib/tenant";
import { isPlatformOperator } from "@/lib/auth/permissions";
import { getServerAuthSession } from "@/lib/auth/session";
import { cuid, parseWithSchema } from "@/lib/validation";
import { logAuditEvent } from "@/lib/audit";
import { productGroupKeys } from "@/platform/modules/product-groups";
import { syncActiveOrganizationMembersToHr } from "@/modules/hr/service";
import { ensureRevenueAccountsForOrg } from "@/lib/accounting-integration";
import { assertTrialProductLimit, TrialProductLimitError } from "@/platform/trials/service";

const toggleSchema = z.object({
  organizationId: cuid,
  moduleId: cuid,
});

export async function toggleOrganizationModule(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const tenant = await requireCurrentTenant();
  if (!isPlatformOperator(tenant)) {
    return { ok: false, error: "You do not have permission to change modules." };
  }

  const parsed = parseWithSchema(toggleSchema, {
    organizationId: String(formData.get("organizationId") ?? "").trim(),
    moduleId: String(formData.get("moduleId") ?? "").trim(),
  });
  if (!parsed.success) {
    return { ok: false, error: "The module selection is invalid." };
  }
  const { organizationId, moduleId } = parsed.data;
  const enabled = formData.get("enabled") === "true";

  const [organization, module_, session] = await Promise.all([
    db.organization.findUnique({ where: { id: organizationId } }),
    db.module.findUnique({ where: { id: moduleId } }),
    getServerAuthSession(),
  ]);

  if (!organization || !module_) {
    return { ok: false, error: "The organization or module was not found." };
  }

  try {
    await db.$transaction(async (tx) => {
      const groupedModules = await tx.module.findMany({
        where: { code: { in: [...productGroupKeys(module_.code)] } },
        select: { id: true, code: true },
      });
      if (enabled) await assertTrialProductLimit(tx, organizationId, groupedModules.map((entry) => entry.code));
    for (const groupedModule of groupedModules) {
      await tx.organizationModule.upsert({
        where: { organizationId_moduleId: { organizationId, moduleId: groupedModule.id } },
        update: { enabled, enabledAt: enabled ? new Date() : undefined },
        create: { organizationId, moduleId: groupedModule.id, enabled, enabledAt: enabled ? new Date() : null },
      });
    }
    if (enabled && groupedModules.some((groupedModule) => groupedModule.code === "hr")) {
      await syncActiveOrganizationMembersToHr(tx, organizationId, session?.user?.id);
    }
    if (enabled) {
      await ensureRevenueAccountsForOrg(tx, organizationId);
    }

    await logAuditEvent(
      {
        organizationId,
        userId: session?.user?.id,
        module: "platform",
        action: enabled ? "module.enabled" : "module.disabled",
        entityName: "OrganizationModule",
        entityId: moduleId,
        metadata: { module: module_.code, organization: organization.name },
      },
      tx,
    );
    });
  } catch (error) {
    if (error instanceof TrialProductLimitError) return { ok: false, error: error.message };
    throw error;
  }

  revalidatePath("/app/platform/organizations");
  revalidatePath("/app/platform/modules");
  revalidatePath("/app/modules");
  revalidatePath("/app/dashboard");
  return { ok: true };
}
