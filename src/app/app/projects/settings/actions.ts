"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { parseWithSchema } from "@/lib/validation";
import { updateProjectsSettings } from "@/modules/projects/service";

const schema = z.object({
  projectCodePrefix: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{2,8}$/, "Use 2-8 uppercase letters or numbers."),
});

export async function saveProjectsSettings(formData: FormData): Promise<void> {
  const tenant = await requireModuleAccess("projects");
  if (!hasPermission(tenant, PERMISSIONS.PROJECTS_SETTINGS_MANAGE)) {
    redirect("/app/projects/settings?error=forbidden");
  }

  const parsed = parseWithSchema(schema, {
    projectCodePrefix: String(formData.get("projectCodePrefix") ?? "").trim(),
  });
  if (!parsed.success) redirect("/app/projects/settings?error=invalid");

  await updateProjectsSettings(tenant.organizationId, parsed.data, tenant.userId);

  revalidatePath("/app/projects/settings");
  revalidatePath("/app/projects/projects");
  redirect("/app/projects/settings?saved=1");
}
