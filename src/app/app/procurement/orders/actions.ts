"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireCurrentTenant } from "@/lib/tenant";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getServerAuthSession } from "@/lib/auth/session";
import {
  createOrder,
  sendOrder,
  cancelOrder,
  receiveOrderLine,
  OrderStateError,
  ReceiveQuantityError,
  NotFoundError,
} from "@/modules/procurement/service";
import { InsufficientStockError } from "@/modules/inventory/service";
import { shortText, positiveInt, moneyAmount, longText, dateInput, cuid, parseWithSchema } from "@/lib/validation";
import { logAuditEvent } from "@/lib/audit";

function clean(value: FormDataEntryValue | null): string {
  return String(value ?? "").trim();
}

/** Wraps a schema so an empty form field (missing/blank input) parses to null instead of failing validation. */
function optional<T extends z.ZodTypeAny>(schema: T) {
  return z.union([schema, z.literal("")]).transform((value) => (value === "" ? null : value));
}

const idSchema = z.object({ id: cuid });

const createOrderSchema = z.object({
  vendorId: cuid,
  requestId: optional(cuid),
  itemId: optional(cuid),
  description: shortText,
  quantity: positiveInt,
  unitCost: moneyAmount,
  orderDate: dateInput,
  expectedDate: optional(dateInput),
  notes: optional(longText),
});

export async function createNewOrder(formData: FormData): Promise<void> {
  const tenant = await requireCurrentTenant();
  if (!hasPermission(tenant, PERMISSIONS.PROCUREMENT_ORDERS_MANAGE)) {
    redirect("/app/procurement/orders?error=forbidden");
  }

  const parsed = parseWithSchema(createOrderSchema, {
    vendorId: clean(formData.get("vendorId")),
    requestId: clean(formData.get("requestId")),
    itemId: clean(formData.get("itemId")),
    description: clean(formData.get("description")),
    quantity: clean(formData.get("quantity")),
    unitCost: clean(formData.get("unitCost")),
    orderDate: clean(formData.get("orderDate")),
    expectedDate: clean(formData.get("expectedDate")),
    notes: clean(formData.get("notes")),
  });
  if (!parsed.success) {
    redirect("/app/procurement/orders?error=missing-fields");
  }
  const { vendorId, requestId, itemId, description, quantity, unitCost, orderDate, expectedDate, notes } = parsed.data;

  const session = await getServerAuthSession();

  try {
    await createOrder(tenant.organizationId, {
      vendorId,
      requestId,
      orderDate,
      expectedDate,
      notes,
      createdById: session?.user?.id ?? null,
      lines: [
        {
          itemId,
          description,
          quantity,
          unitCost,
        },
      ],
    });
  } catch (error) {
    if (error instanceof NotFoundError) redirect("/app/procurement/orders?error=not-found");
    throw error;
  }

  revalidatePath("/app/procurement/orders");
  revalidatePath("/app/procurement/requests");
  redirect("/app/procurement/orders?saved=1");
}

export async function sendExistingOrder(formData: FormData): Promise<void> {
  const tenant = await requireCurrentTenant();
  if (!hasPermission(tenant, PERMISSIONS.PROCUREMENT_ORDERS_MANAGE)) {
    redirect("/app/procurement/orders?error=forbidden");
  }
  const parsedId = parseWithSchema(idSchema, { id: clean(formData.get("id")) });
  if (!parsedId.success) return;
  const { id } = parsedId.data;

  try {
    await sendOrder(tenant.organizationId, id);
  } catch (error) {
    if (error instanceof OrderStateError) redirect("/app/procurement/orders?error=invalid-state");
    if (error instanceof NotFoundError) redirect("/app/procurement/orders?error=not-found");
    throw error;
  }

  revalidatePath("/app/procurement/orders");
  redirect("/app/procurement/orders?saved=1");
}

export async function cancelExistingOrder(formData: FormData): Promise<void> {
  const tenant = await requireCurrentTenant();
  if (!hasPermission(tenant, PERMISSIONS.PROCUREMENT_ORDERS_MANAGE)) {
    redirect("/app/procurement/orders?error=forbidden");
  }
  const parsedId = parseWithSchema(idSchema, { id: clean(formData.get("id")) });
  if (!parsedId.success) return;
  const { id } = parsedId.data;

  try {
    await cancelOrder(tenant.organizationId, id);
  } catch (error) {
    if (error instanceof OrderStateError) redirect("/app/procurement/orders?error=invalid-state");
    if (error instanceof NotFoundError) redirect("/app/procurement/orders?error=not-found");
    throw error;
  }

  revalidatePath("/app/procurement/orders");
  redirect("/app/procurement/orders?saved=1");
}

const receiveLineSchema = z.object({
  orderId: cuid,
  lineId: cuid,
  quantity: positiveInt,
  warehouseId: optional(cuid),
});

export async function receiveExistingOrderLine(formData: FormData): Promise<void> {
  const tenant = await requireCurrentTenant();
  if (!hasPermission(tenant, PERMISSIONS.PROCUREMENT_ORDERS_MANAGE)) {
    redirect("/app/procurement/orders?error=forbidden");
  }

  const parsed = parseWithSchema(receiveLineSchema, {
    orderId: clean(formData.get("orderId")),
    lineId: clean(formData.get("lineId")),
    quantity: clean(formData.get("quantity")),
    warehouseId: clean(formData.get("warehouseId")),
  });
  if (!parsed.success) {
    redirect("/app/procurement/orders?error=missing-fields");
  }
  const { orderId, lineId, quantity, warehouseId } = parsed.data;

  const session = await getServerAuthSession();

  try {
    await receiveOrderLine(tenant.organizationId, {
      orderId,
      lineId,
      quantity,
      warehouseId,
      createdById: session?.user?.id ?? null,
    });
  } catch (error) {
    if (error instanceof ReceiveQuantityError) {
      await logAuditEvent({
        organizationId: tenant.organizationId,
        userId: session?.user?.id ?? null,
        module: "procurement",
        action: "procurement.receipt",
        entityName: "ProcurementOrder",
        entityId: orderId,
        status: "FAILURE",
        metadata: { reason: error.constructor.name },
      });
      redirect("/app/procurement/orders?error=invalid-quantity");
    }
    if (error instanceof OrderStateError) redirect("/app/procurement/orders?error=invalid-state");
    if (error instanceof InsufficientStockError) redirect("/app/procurement/orders?error=inventory-error");
    if (error instanceof NotFoundError) redirect("/app/procurement/orders?error=not-found");
    throw error;
  }

  await logAuditEvent({
    organizationId: tenant.organizationId,
    userId: session?.user?.id ?? null,
    module: "procurement",
    action: "procurement.receipt",
    entityName: "ProcurementOrder",
    entityId: orderId,
    metadata: { lineId, quantity },
  });

  revalidatePath("/app/procurement/orders");
  revalidatePath("/app/inventory/stock");
  revalidatePath("/app/inventory/items");
  redirect("/app/procurement/orders?saved=1");
}
