"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireCurrentTenant } from "@/lib/tenant";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getServerAuthSession } from "@/lib/auth/session";
import { recordMovement, InsufficientStockError, InvalidTransferError } from "@/modules/inventory/service";
import { cuid, shortText, longText, dateInput, parseWithSchema } from "@/lib/validation";
import { logAuditEvent } from "@/lib/audit";

function clean(value: FormDataEntryValue | null) {
  const str = String(value ?? "").trim();
  return str.length > 0 ? str : null;
}

const MOVEMENT_TYPES = ["RECEIPT", "ISSUE", "ADJUSTMENT", "TRANSFER"] as const;

const MOVEMENT_AUDIT_ACTION: Record<(typeof MOVEMENT_TYPES)[number], string> = {
  RECEIPT: "inventory.receipt",
  ISSUE: "inventory.issue",
  ADJUSTMENT: "inventory.adjustment",
  TRANSFER: "inventory.transfer",
};

/**
 * A whole-number quantity that may be signed — ADJUSTMENT is the one movement
 * type where the sign itself carries meaning (increase vs decrease), so this
 * can't use the shared `positiveInt`. Every other type's sign is normalized
 * with Math.abs() below, same as before; what's new is that a decimal or
 * garbage string is now rejected outright instead of being silently
 * truncated by `parseInt`.
 */
const signedIntQuantity = z
  .string()
  .trim()
  .regex(/^-?\d{1,10}$/, "Quantity must be a whole number.")
  .transform((value) => Number.parseInt(value, 10))
  .refine((value) => value !== 0, "Quantity must be a non-zero whole number.");

const movementSchema = z.object({
  itemId: cuid,
  warehouseId: cuid,
  type: z.enum(MOVEMENT_TYPES),
  quantity: signedIntQuantity,
  toWarehouseId: cuid.nullable(),
  reference: shortText.nullable(),
  notes: longText.nullable(),
  occurredAt: dateInput.nullable(),
});

export async function createMovement(formData: FormData): Promise<void> {
  const tenant = await requireCurrentTenant();
  if (!hasPermission(tenant, PERMISSIONS.INVENTORY_MOVEMENTS_MANAGE)) {
    redirect("/app/inventory/movements?error=forbidden");
  }

  const parsed = parseWithSchema(movementSchema, {
    itemId: clean(formData.get("itemId")) ?? "",
    warehouseId: clean(formData.get("warehouseId")) ?? "",
    type: clean(formData.get("type")) ?? "",
    quantity: clean(formData.get("quantity")) ?? "",
    toWarehouseId: clean(formData.get("toWarehouseId")),
    reference: clean(formData.get("reference")),
    notes: clean(formData.get("notes")),
    occurredAt: clean(formData.get("occurredAt")),
  });
  if (!parsed.success) {
    redirect("/app/inventory/movements?error=missing-fields");
  }

  const { itemId, warehouseId, type, toWarehouseId, reference, notes, occurredAt } = parsed.data;
  let quantity = parsed.data.quantity;
  if (type !== "ADJUSTMENT") quantity = Math.abs(quantity);

  const session = await getServerAuthSession();
  const auditMetadata = {
    itemId,
    warehouseId,
    quantity,
    ...(toWarehouseId ? { toWarehouseId } : {}),
  };

  try {
    await db.$transaction(async (tx) => {
      const movement = await recordMovement(
        tenant.organizationId,
        {
          itemId,
          warehouseId,
          type,
          quantity,
          toWarehouseId,
          reference,
          notes,
          createdById: session?.user?.id ?? null,
          occurredAt: occurredAt ?? undefined,
        },
        tx,
      );

      await logAuditEvent(
        {
          organizationId: tenant.organizationId,
          userId: session?.user?.id ?? null,
          module: "inventory",
          action: MOVEMENT_AUDIT_ACTION[type],
          entityName: "InventoryMovement",
          entityId: movement.id,
          metadata: auditMetadata,
        },
        tx,
      );
    });
  } catch (error) {
    if (error instanceof InsufficientStockError || error instanceof InvalidTransferError) {
      await logAuditEvent({
        organizationId: tenant.organizationId,
        userId: session?.user?.id ?? null,
        module: "inventory",
        action: MOVEMENT_AUDIT_ACTION[type],
        entityName: "InventoryMovement",
        status: "FAILURE",
        metadata: { reason: error.constructor.name, ...auditMetadata },
      });
    }
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
