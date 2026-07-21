"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireCurrentTenant } from "@/lib/tenant";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getServerAuthSession } from "@/lib/auth/session";
import { refundSale, SaleStateError, NotFoundError } from "@/modules/pos/service";
import { cuid, parseWithSchema } from "@/lib/validation";

function clean(value: FormDataEntryValue | null): string {
  return String(value ?? "").trim();
}

const idSchema = z.object({ id: cuid });

export async function refundExistingSale(formData: FormData): Promise<void> {
  const tenant = await requireCurrentTenant();
  if (!hasPermission(tenant, PERMISSIONS.POS_SALES_MANAGE)) {
    redirect("/app/pos/sales?error=forbidden");
  }

  const parsedId = parseWithSchema(idSchema, { id: clean(formData.get("id")) });
  if (!parsedId.success) return;
  const { id } = parsedId.data;

  const session = await getServerAuthSession();
  try {
    await refundSale(tenant.organizationId, id, session?.user?.id ?? null);
  } catch (error) {
    if (error instanceof SaleStateError) redirect("/app/pos/sales?error=invalid-state");
    if (error instanceof NotFoundError) redirect("/app/pos/sales?error=not-found");
    throw error;
  }

  revalidatePath("/app/pos/sales");
  revalidatePath("/app/inventory/stock");
  revalidatePath("/app/inventory/items");
  redirect("/app/pos/sales?saved=1");
}
