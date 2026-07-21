"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireCurrentTenant } from "@/lib/tenant";
import { isPlatformOperator } from "@/lib/auth/permissions";
import { getServerAuthSession } from "@/lib/auth/session";
import { cuid, parseWithSchema } from "@/lib/validation";

const toggleSchema = z.object({
  organizationId: cuid,
  moduleId: cuid,
});

export async function toggleOrganizationModule(formData: FormData): Promise<void> {
  const tenant = await requireCurrentTenant();
  if (!isPlatformOperator(tenant)) {
    return;
  }

  const parsed = parseWithSchema(toggleSchema, {
    organizationId: String(formData.get("organizationId") ?? "").trim(),
    moduleId: String(formData.get("moduleId") ?? "").trim(),
  });
  if (!parsed.success) {
    return;
  }
  const { organizationId, moduleId } = parsed.data;
  const enabled = formData.get("enabled") === "true";

  const [organization, module_, session] = await Promise.all([
    db.organization.findUnique({ where: { id: organizationId } }),
    db.module.findUnique({ where: { id: moduleId } }),
    getServerAuthSession(),
  ]);

  if (!organization || !module_) {
    return;
  }

  await db.$transaction(async (tx) => {
    await tx.organizationModule.upsert({
      where: { organizationId_moduleId: { organizationId, moduleId } },
      update: { enabled, enabledAt: enabled ? new Date() : undefined },
      create: { organizationId, moduleId, enabled, enabledAt: enabled ? new Date() : null },
    });

    await tx.auditLog.create({
      data: {
        organizationId,
        userId: session?.user?.id,
        action: enabled ? "module.enabled" : "module.disabled",
        entityName: "OrganizationModule",
        entityId: moduleId,
        changes: { module: module_.code, organization: organization.name },
      },
    });
  });

  revalidatePath("/app/platform/organizations");
  revalidatePath("/app/platform/modules");
  revalidatePath("/app/modules");
  revalidatePath("/app/dashboard");
}
