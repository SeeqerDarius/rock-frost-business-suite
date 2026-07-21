"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireCurrentTenant } from "@/lib/tenant";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { setDefaultWarehouse } from "@/modules/procurement/service";
import { cuid, parseWithSchema } from "@/lib/validation";

function clean(value: FormDataEntryValue | null): string {
  return String(value ?? "").trim();
}

/** Wraps a schema so an empty form field (missing/blank input) parses to null instead of failing validation. */
function optional<T extends z.ZodTypeAny>(schema: T) {
  return z.union([schema, z.literal("")]).transform((value) => (value === "" ? null : value));
}

const settingsSchema = z.object({ defaultWarehouseId: optional(cuid) });

export async function updateDefaultWarehouse(formData: FormData): Promise<void> {
  const tenant = await requireCurrentTenant();
  if (!hasPermission(tenant, PERMISSIONS.PROCUREMENT_SETTINGS_MANAGE)) {
    redirect("/app/procurement/settings?error=forbidden");
  }

  const parsed = parseWithSchema(settingsSchema, { defaultWarehouseId: clean(formData.get("defaultWarehouseId")) });
  if (!parsed.success) {
    redirect("/app/procurement/settings?error=invalid-input");
  }

  await setDefaultWarehouse(tenant.organizationId, parsed.data.defaultWarehouseId);
  revalidatePath("/app/procurement/settings");
  redirect("/app/procurement/settings?saved=1");
}
