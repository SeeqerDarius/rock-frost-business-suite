"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireCurrentTenant } from "@/lib/tenant";
import { isPlatformOperator } from "@/lib/auth/permissions";
import { getServerAuthSession } from "@/lib/auth/session";

export async function toggleOrganizationModule(formData: FormData): Promise<void> {
  const tenant = await requireCurrentTenant();
  if (!isPlatformOperator(tenant)) {
    return;
  }

  const organizationId = String(formData.get("organizationId") ?? "");
  const moduleId = String(formData.get("moduleId") ?? "");
  const enabled = formData.get("enabled") === "true";

  if (!organizationId || !moduleId) {
    return;
  }

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
