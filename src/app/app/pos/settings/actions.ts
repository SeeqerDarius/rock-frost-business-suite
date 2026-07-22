"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { updateSettings } from "@/modules/pos/service";
import { longText, parseWithSchema } from "@/lib/validation";

function clean(value: FormDataEntryValue | null): string {
  return String(value ?? "").trim();
}

/** Wraps a schema so an empty form field (missing/blank input) parses to null instead of failing validation. */
function optional<T extends z.ZodTypeAny>(schema: T) {
  return z.union([schema, z.literal("")]).transform((value) => (value === "" ? null : value));
}

const settingsSchema = z.object({ receiptFooterText: optional(longText) });

export async function saveReceiptFooter(formData: FormData): Promise<void> {
  const tenant = await requireModuleAccess("pos");
  if (!hasPermission(tenant, PERMISSIONS.POS_SETTINGS_MANAGE)) {
    redirect("/app/pos/settings?error=forbidden");
  }

  const parsed = parseWithSchema(settingsSchema, { receiptFooterText: clean(formData.get("receiptFooterText")) });
  if (!parsed.success) {
    redirect("/app/pos/settings?error=invalid-input");
  }

  await updateSettings(tenant.organizationId, parsed.data.receiptFooterText);
  revalidatePath("/app/pos/settings");
  redirect("/app/pos/settings?saved=1");
}
