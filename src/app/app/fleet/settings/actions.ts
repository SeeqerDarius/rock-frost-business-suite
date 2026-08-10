"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { parseWithSchema } from "@/lib/validation";
import { updateFleetSettings } from "@/modules/fleet/service";

const schema = z.object({
  documentRenewalReminderDays: z.coerce.number().int().min(1).max(365),
});

export async function saveFleetSettings(formData: FormData): Promise<void> {
  const tenant = await requireModuleAccess("fleet");
  // Fleet has no dedicated `fleet.settings.manage` permission; the reminder
  // window governs insurance/roadworthy document renewal alerts, so it is
  // gated on the permission that already owns that data.
  if (!hasPermission(tenant, PERMISSIONS.FLEET_INSURANCE_MANAGE)) {
    redirect("/app/fleet/settings?error=forbidden");
  }

  const parsed = parseWithSchema(schema, {
    documentRenewalReminderDays: String(formData.get("documentRenewalReminderDays") ?? "").trim(),
  });
  if (!parsed.success) redirect("/app/fleet/settings?error=invalid");

  await updateFleetSettings(tenant.organizationId, parsed.data, tenant.userId);

  revalidatePath("/app/fleet/settings");
  revalidatePath("/app/fleet/insurance-roadworthy");
  redirect("/app/fleet/settings?saved=1");
}
