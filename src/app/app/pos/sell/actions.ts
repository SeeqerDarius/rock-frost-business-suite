"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireCurrentTenant } from "@/lib/tenant";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getServerAuthSession } from "@/lib/auth/session";
import { createSale, SaleStateError, InsufficientStockError } from "@/modules/pos/service";
import type { PosPaymentMethod } from "@prisma/client";

function clean(value: FormDataEntryValue | null) {
  const str = String(value ?? "").trim();
  return str.length > 0 ? str : null;
}

export async function completeSale(formData: FormData): Promise<void> {
  const tenant = await requireCurrentTenant();
  if (!hasPermission(tenant, PERMISSIONS.POS_SALES_MANAGE)) {
    redirect("/app/pos/sell?error=forbidden");
  }

  const sessionId = clean(formData.get("sessionId"));
  const paymentMethod = clean(formData.get("paymentMethod")) as PosPaymentMethod | null;
  if (!sessionId || !paymentMethod) {
    redirect("/app/pos/sell?error=missing-fields");
  }

  const lines = [];
  for (let i = 1; i <= 3; i++) {
    const description = clean(formData.get(`description${i}`));
    const quantityRaw = clean(formData.get(`quantity${i}`));
    const unitPrice = clean(formData.get(`unitPrice${i}`));
    if (!description || !quantityRaw || !unitPrice) continue;
    lines.push({
      itemId: clean(formData.get(`itemId${i}`)),
      description,
      quantity: Number.parseInt(quantityRaw, 10),
      unitPrice,
    });
  }

  if (lines.length === 0) {
    redirect("/app/pos/sell?error=no-lines");
  }

  const session = await getServerAuthSession();

  try {
    await createSale(tenant.organizationId, {
      sessionId,
      customerName: clean(formData.get("customerName")),
      paymentMethod,
      soldById: session?.user?.id ?? null,
      lines,
    });
  } catch (error) {
    if (error instanceof InsufficientStockError) redirect("/app/pos/sell?error=insufficient-stock");
    if (error instanceof SaleStateError) redirect("/app/pos/sell?error=no-open-session");
    throw error;
  }

  revalidatePath("/app/pos/sell");
  revalidatePath("/app/pos/sales");
  revalidatePath("/app/inventory/stock");
  revalidatePath("/app/inventory/items");
  redirect("/app/pos/sell?saved=1");
}
