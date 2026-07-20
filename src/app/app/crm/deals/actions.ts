"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireCurrentTenant } from "@/lib/tenant";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { createDeal, updateDeal, updateDealStage } from "@/modules/crm/service";
import type { CrmDealStage } from "@prisma/client";

function clean(value: FormDataEntryValue | null) {
  const str = String(value ?? "").trim();
  return str.length > 0 ? str : null;
}

export async function upsertDeal(formData: FormData): Promise<void> {
  const tenant = await requireCurrentTenant();
  if (!hasPermission(tenant, PERMISSIONS.CRM_DEALS_MANAGE)) {
    redirect("/app/crm/deals?error=forbidden");
  }

  const id = clean(formData.get("id"));
  const title = clean(formData.get("title"));
  const value = clean(formData.get("value")) ?? "0";
  if (!title) {
    redirect("/app/crm/deals?error=missing-fields");
  }

  const expectedCloseDateRaw = clean(formData.get("expectedCloseDate"));
  const data = {
    title,
    value,
    contactId: clean(formData.get("contactId")),
    ownerId: clean(formData.get("ownerId")),
    notes: clean(formData.get("notes")),
    expectedCloseDate: expectedCloseDateRaw ? new Date(`${expectedCloseDateRaw}T00:00:00`) : null,
  };

  if (id) {
    await updateDeal(tenant.organizationId, id, data);
  } else {
    await createDeal(tenant.organizationId, data);
  }

  revalidatePath("/app/crm/deals");
  redirect("/app/crm/deals?saved=1");
}

export async function changeDealStage(formData: FormData): Promise<void> {
  const tenant = await requireCurrentTenant();
  if (!hasPermission(tenant, PERMISSIONS.CRM_DEALS_MANAGE)) {
    redirect("/app/crm/deals?error=forbidden");
  }

  const id = clean(formData.get("id"));
  const stage = clean(formData.get("stage")) as CrmDealStage | null;
  if (!id || !stage) return;

  await updateDealStage(tenant.organizationId, id, stage);
  revalidatePath("/app/crm/deals");
  redirect("/app/crm/deals?saved=1");
}
