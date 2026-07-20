"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireCurrentTenant } from "@/lib/tenant";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getServerAuthSession } from "@/lib/auth/session";
import { refundSale, SaleStateError } from "@/modules/pos/service";

function clean(value: FormDataEntryValue | null) {
  const str = String(value ?? "").trim();
  return str.length > 0 ? str : null;
}

export async function refundExistingSale(formData: FormData): Promise<void> {
  const tenant = await requireCurrentTenant();
  if (!hasPermission(tenant, PERMISSIONS.POS_SALES_MANAGE)) {
    redirect("/app/pos/sales?error=forbidden");
  }

  const id = clean(formData.get("id"));
  if (!id) return;

  const session = await getServerAuthSession();
  try {
    await refundSale(tenant.organizationId, id, session?.user?.id ?? null);
  } catch (error) {
    if (error instanceof SaleStateError) redirect("/app/pos/sales?error=invalid-state");
    throw error;
  }

  revalidatePath("/app/pos/sales");
  revalidatePath("/app/inventory/stock");
  revalidatePath("/app/inventory/items");
  redirect("/app/pos/sales?saved=1");
}
