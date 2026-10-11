"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { logAuditEvent } from "@/lib/audit";
import { requireCurrentTenant } from "@/lib/tenant";
import { isPlatformOperator } from "@/lib/auth/permissions";
import { cuid } from "@/lib/validation";
import { parseConfigurationJson } from "@/platform/module-requests/configuration";
import { isPlatformAnchorOrganization } from "@/lib/platform-organizations";
import { FeatureChangeError, setOrganizationFeature } from "@/platform/organizations/feature-config-service";

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

  if (await isPlatformAnchorOrganization(organizationId.data)) redirect("/app/platform/organizations");

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


export type FeatureActionResult = { ok: true; value: boolean; changed: boolean } | { ok: false; error: string; code?: string };

/**
 * Switches one configurable feature (paid add-on or optional included
 * capability) for one organization. Called from the module configuration
 * page after the operator confirms. Re-verifies the platform operator role,
 * refuses the protected platform organization, and delegates dependency,
 * stale-change, and audit handling to setOrganizationFeature().
 */
export async function setOrganizationFeatureAction(formData: FormData): Promise<FeatureActionResult> {
  const tenant = await requireCurrentTenant();
  if (!isPlatformOperator(tenant)) return { ok: false, error: "Only Rock Frost platform administrators can change organization features." };
  const organizationId = cuid.safeParse(String(formData.get("organizationId") ?? "").trim());
  const moduleKey = String(formData.get("moduleKey") ?? "").trim();
  const featureKey = String(formData.get("featureKey") ?? "").trim();
  if (!organizationId.success || !moduleKey || !featureKey) return { ok: false, error: "The request was incomplete. Reload and try again." };
  if (await isPlatformAnchorOrganization(organizationId.data)) return { ok: false, error: "This is the protected platform organization. Its features are not configured here." };
  const enabled = formData.get("enabled") === "true";
  const expected = formData.get("expected") === "true";
  try {
    const result = await setOrganizationFeature({ actorUserId: tenant.userId, organizationId: organizationId.data, moduleKey, featureKey, enabled, expected });
    revalidatePath(`/app/platform/organizations/${organizationId.data}`, "layout");
    return { ok: true, value: result.next, changed: result.changed };
  } catch (error) {
    if (error instanceof FeatureChangeError) return { ok: false, error: error.message, code: error.code };
    throw error;
  }
}
