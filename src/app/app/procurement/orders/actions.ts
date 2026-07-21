"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
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

function clean(value: FormDataEntryValue | null) {
  const str = String(value ?? "").trim();
  return str.length > 0 ? str : null;
}

export async function createNewOrder(formData: FormData): Promise<void> {
  const tenant = await requireCurrentTenant();
  if (!hasPermission(tenant, PERMISSIONS.PROCUREMENT_ORDERS_MANAGE)) {
    redirect("/app/procurement/orders?error=forbidden");
  }

  const vendorId = clean(formData.get("vendorId"));
  const orderDateRaw = clean(formData.get("orderDate"));
  const description = clean(formData.get("description"));
  const quantityRaw = clean(formData.get("quantity"));
  const unitCost = clean(formData.get("unitCost"));

  if (!vendorId || !orderDateRaw || !description || !quantityRaw || !unitCost) {
    redirect("/app/procurement/orders?error=missing-fields");
  }

  const session = await getServerAuthSession();
  const expectedDateRaw = clean(formData.get("expectedDate"));

  try {
    await createOrder(tenant.organizationId, {
      vendorId,
      requestId: clean(formData.get("requestId")),
      orderDate: new Date(`${orderDateRaw}T00:00:00`),
      expectedDate: expectedDateRaw ? new Date(`${expectedDateRaw}T00:00:00`) : null,
      notes: clean(formData.get("notes")),
      createdById: session?.user?.id ?? null,
      lines: [
        {
          itemId: clean(formData.get("itemId")),
          description,
          quantity: Number.parseInt(quantityRaw, 10),
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
  const id = clean(formData.get("id"));
  if (!id) return;

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
  const id = clean(formData.get("id"));
  if (!id) return;

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

export async function receiveExistingOrderLine(formData: FormData): Promise<void> {
  const tenant = await requireCurrentTenant();
  if (!hasPermission(tenant, PERMISSIONS.PROCUREMENT_ORDERS_MANAGE)) {
    redirect("/app/procurement/orders?error=forbidden");
  }

  const orderId = clean(formData.get("orderId"));
  const lineId = clean(formData.get("lineId"));
  const quantityRaw = clean(formData.get("quantity"));
  if (!orderId || !lineId || !quantityRaw) {
    redirect("/app/procurement/orders?error=missing-fields");
  }

  const session = await getServerAuthSession();

  try {
    await receiveOrderLine(tenant.organizationId, {
      orderId,
      lineId,
      quantity: Number.parseInt(quantityRaw, 10),
      warehouseId: clean(formData.get("warehouseId")),
      createdById: session?.user?.id ?? null,
    });
  } catch (error) {
    if (error instanceof ReceiveQuantityError) redirect("/app/procurement/orders?error=invalid-quantity");
    if (error instanceof OrderStateError) redirect("/app/procurement/orders?error=invalid-state");
    if (error instanceof InsufficientStockError) redirect("/app/procurement/orders?error=inventory-error");
    if (error instanceof NotFoundError) redirect("/app/procurement/orders?error=not-found");
    throw error;
  }

  revalidatePath("/app/procurement/orders");
  revalidatePath("/app/inventory/stock");
  revalidatePath("/app/inventory/items");
  redirect("/app/procurement/orders?saved=1");
}
