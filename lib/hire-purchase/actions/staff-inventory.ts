"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePermission, PERMISSIONS } from "@/lib/permissions";
import { getServerAuthSession } from "@/lib/auth/session";
import { logAuditEvent } from "@/lib/audit";

function clean(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

export async function adjustStaffInventory(formData: FormData): Promise<void> {
  const tenant = await requirePermission(PERMISSIONS.HIREPURCHASE_STAFF_MANAGE);
  const session = await getServerAuthSession();
  const userId = session?.user?.id;

  const staffId = clean(formData.get("staffId"));
  const productId = clean(formData.get("productId"));
  const quantityChange = Math.trunc(Number(clean(formData.get("quantityChange"))));

  if (!staffId || !productId || !Number.isFinite(quantityChange) || quantityChange === 0) {
    redirect(`/hire-purchase/staff/${staffId}?inventory=invalid`);
  }

  const existing = await db.hirePurchaseStaffInventory.findUnique({ where: { staffId_productId: { staffId, productId } } });
  const currentQuantity = existing?.quantity ?? 0;
  const nextQuantity = currentQuantity + quantityChange;

  if (nextQuantity < 0) {
    redirect(`/hire-purchase/staff/${staffId}?inventory=negative`);
  }

  await db.hirePurchaseStaffInventory.upsert({
    where: { staffId_productId: { staffId, productId } },
    update: { quantity: nextQuantity },
    create: { organizationId: tenant.organizationId, staffId, productId, quantity: nextQuantity },
  });

  await logAuditEvent({
    organizationId: tenant.organizationId,
    userId,
    action: quantityChange > 0 ? "RESTOCK_STAFF_INVENTORY" : "ADJUST_STAFF_INVENTORY",
    entityName: "HirePurchaseStaffInventory",
    entityId: `${staffId}:${productId}`,
    changes: { quantityChange, nextQuantity },
  });

  revalidatePath(`/hire-purchase/staff/${staffId}`);
  redirect(`/hire-purchase/staff/${staffId}?inventory=updated`);
}
