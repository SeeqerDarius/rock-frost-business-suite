"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { logAuditEvent } from "@/lib/audit";
import { requireCurrentTenant } from "@/lib/tenant";
import { isPlatformOperator } from "@/lib/auth/permissions";
import { cuid } from "@/lib/validation";
import { parseConfigurationJson } from "@/platform/module-requests/configuration";

export async function updateOrganizationModuleConfiguration(formData: FormData): Promise<void> {
  const tenant = await requireCurrentTenant();
  if (!isPlatformOperator(tenant)) redirect("/app/dashboard");

  const organizationId = cuid.safeParse(String(formData.get("organizationId") ?? "").trim());
  const moduleId = cuid.safeParse(String(formData.get("moduleId") ?? "").trim());
  const configuration = parseConfigurationJson(String(formData.get("configuration") ?? ""));
  if (!organizationId.success || !moduleId.success || !configuration.success) {
    redirect(
      `/app/platform/organizations/${organizationId.success ? organizationId.data : "invalid"}/modules/${moduleId.success ? moduleId.data : "invalid"}?error=invalid`,
    );
  }

  const [organization, module_] = await Promise.all([
    db.organization.findUnique({ where: { id: organizationId.data } }),
    db.module.findUnique({ where: { id: moduleId.data } }),
  ]);
  if (!organization || !module_) redirect("/app/platform/organizations");

  await db.$transaction(async (tx) => {
    await tx.organizationModule.upsert({
      where: {
        organizationId_moduleId: {
          organizationId: organization.id,
          moduleId: module_.id,
        },
      },
      update: { configuration: configuration.data },
      create: {
        organizationId: organization.id,
        moduleId: module_.id,
        enabled: false,
        configuration: configuration.data,
      },
    });
    await logAuditEvent(
      {
        organizationId: organization.id,
        userId: tenant.userId,
        module: "platform",
        action: "organization_module.configuration_updated",
        entityName: "OrganizationModule",
        entityId: module_.id,
        metadata: {
          module: module_.code,
          configurationVersion: configuration.data.version,
          features: Object.keys(configuration.data.features),
          extensions: configuration.data.extensions,
        },
      },
      tx,
    );
  });

  const path = `/app/platform/organizations/${organization.id}/modules/${module_.id}`;
  revalidatePath(path);
  revalidatePath("/app/platform/organizations");
  redirect(`${path}?saved=1`);
}

