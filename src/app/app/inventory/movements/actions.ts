"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireCurrentTenant } from "@/lib/tenant";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getServerAuthSession } from "@/lib/auth/session";
import { recordMovement, InsufficientStockError, InvalidTransferError } from "@/modules/inventory/service";
import type { InventoryMovementType } from "@prisma/client";

function clean(value: FormDataEntryValue | null) {
  const str = String(value ?? "").trim();
  return str.length > 0 ? str : null;
}

export async function createMovement(formData: FormData): Promise<void> {
  const tenant = await requireCurrentTenant();
  if (!hasPermission(tenant, PERMISSIONS.INVENTORY_MOVEMENTS_MANAGE)) {
    redirect("/app/inventory/movements?error=forbidden");
  }

  const itemId = clean(formData.get("itemId"));
  const warehouseId = clean(formData.get("warehouseId"));
  const type = clean(formData.get("type")) as InventoryMovementType | null;
  const quantityRaw = clean(formData.get("quantity"));
  const toWarehouseId = clean(formData.get("toWarehouseId"));
  const occurredAtRaw = clean(formData.get("occurredAt"));

  if (!itemId || !warehouseId || !type || !quantityRaw) {
    redirect("/app/inventory/movements?error=missing-fields");
  }

  let quantity = Number.parseInt(quantityRaw, 10);
  if (type !== "ADJUSTMENT") quantity = Math.abs(quantity);
  if (quantity === 0 || Number.isNaN(quantity)) {
    redirect("/app/inventory/movements?error=missing-fields");
  }

  const session = await getServerAuthSession();

  try {
    await recordMovement(tenant.organizationId, {
      itemId,
      warehouseId,
      type,
      quantity,
      toWarehouseId,
      reference: clean(formData.get("reference")),
      notes: clean(formData.get("notes")),
      createdById: session?.user?.id ?? null,
      occurredAt: occurredAtRaw ? new Date(`${occurredAtRaw}T00:00:00`) : undefined,
    });
  } catch (error) {
    if (error instanceof InsufficientStockError) {
      redirect("/app/inventory/movements?error=insufficient-stock");
    }
    if (error instanceof InvalidTransferError) {
      redirect("/app/inventory/movements?error=invalid-transfer");
    }
    throw error;
  }

  revalidatePath("/app/inventory/movements");
  revalidatePath("/app/inventory/stock");
  revalidatePath("/app/inventory/items");
  redirect("/app/inventory/movements?saved=1");
}
