"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireCurrentTenant } from "@/lib/tenant";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { updateSettings } from "@/modules/pos/service";

function clean(value: FormDataEntryValue | null) {
  const str = String(value ?? "").trim();
  return str.length > 0 ? str : null;
}

export async function saveReceiptFooter(formData: FormData): Promise<void> {
  const tenant = await requireCurrentTenant();
  if (!hasPermission(tenant, PERMISSIONS.POS_SETTINGS_MANAGE)) {
    redirect("/app/pos/settings?error=forbidden");
  }

  await updateSettings(tenant.organizationId, clean(formData.get("receiptFooterText")));
  revalidatePath("/app/pos/settings");
  redirect("/app/pos/settings?saved=1");
}
