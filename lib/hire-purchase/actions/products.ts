"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePermission, PERMISSIONS } from "@/lib/permissions";
import { getServerAuthSession } from "@/lib/auth/session";
import { logAuditEvent } from "@/lib/audit";
import { getHirePurchaseSettings } from "../settings";
import { assignDefaultInventoryForProduct } from "../inventory";

function clean(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

function num(value: FormDataEntryValue | null) {
  const parsed = Number(clean(value));
  return Number.isFinite(parsed) ? parsed : NaN;
}

export async function createProductCategory(formData: FormData): Promise<void> {
  const tenant = await requirePermission(PERMISSIONS.HIREPURCHASE_PRODUCTS_MANAGE);
  const name = clean(formData.get("name")).replace(/\s+/g, " ");

  if (!name) redirect("/hire-purchase/products?error=category-name-required");

  const existing = await db.hirePurchaseProductCategory.findFirst({
    where: { organizationId: tenant.organizationId, name: { equals: name, mode: "insensitive" } },
  });

  if (existing) {
    if (!existing.active) {
      await db.hirePurchaseProductCategory.update({ where: { id: existing.id }, data: { active: true } });
    }
    redirect("/hire-purchase/products?category=restored");
  }

  const maxSort = await db.hirePurchaseProductCategory.aggregate({
    where: { organizationId: tenant.organizationId },
    _max: { sortOrder: true },
  });

  await db.hirePurchaseProductCategory.create({
    data: { organizationId: tenant.organizationId, name, sortOrder: (maxSort._max.sortOrder ?? 0) + 10 },
  });

  revalidatePath("/hire-purchase/products");
  redirect("/hire-purchase/products?category=created");
}

export async function createProduct(formData: FormData): Promise<void> {
  const tenant = await requirePermission(PERMISSIONS.HIREPURCHASE_PRODUCTS_MANAGE);
  const session = await getServerAuthSession();
  const userId = session?.user?.id;

  const name = clean(formData.get("name"));
  const category = clean(formData.get("category"));
  const description = clean(formData.get("description"));
  const costPrice = num(formData.get("costPrice"));
  const transportCost = num(formData.get("transportCost")) || 0;
  const dailyAmount = num(formData.get("dailyAmount"));
  const duration = Math.trunc(num(formData.get("duration")));
  const active = formData.get("active") === "on";

  if (!name || !category) redirect("/hire-purchase/products/new?error=name-and-category-required");
  if (!(costPrice > 0)) redirect("/hire-purchase/products/new?error=invalid-cost-price");
  if (!(dailyAmount > 0)) redirect("/hire-purchase/products/new?error=invalid-daily-amount");
  if (!(duration > 0)) redirect("/hire-purchase/products/new?error=invalid-duration");

  const price = dailyAmount * duration;
  const landedCost = costPrice + transportCost;
  if (price < landedCost) {
    redirect("/hire-purchase/products/new?error=price-below-landed-cost");
  }

  const duplicate = await db.hirePurchaseProduct.findFirst({
    where: { organizationId: tenant.organizationId, name: { equals: name, mode: "insensitive" } },
  });
  if (duplicate) redirect("/hire-purchase/products/new?error=duplicate-name");

  const product = await db.$transaction(async (tx) => {
    const created = await tx.hirePurchaseProduct.create({
      data: {
        organizationId: tenant.organizationId,
        name,
        category,
        description: description || null,
        costPrice,
        transportCost,
        dailyAmount,
        duration,
        price,
        quantityOnSale: 0,
        active,
      },
    });

    if (active) {
      const settings = await getHirePurchaseSettings(tenant.organizationId);
      await assignDefaultInventoryForProduct({
        tx,
        organizationId: tenant.organizationId,
        productId: created.id,
        quantity: settings.defaultStaffInventoryQuantity,
      });
    }

    return created;
  }, { timeout: 15000 });

  await logAuditEvent({
    organizationId: tenant.organizationId,
    userId,
    action: "CREATE_PRODUCT",
    entityName: "HirePurchaseProduct",
    entityId: product.id,
    changes: { name, category, costPrice, transportCost, dailyAmount, duration, price },
  });

  revalidatePath("/hire-purchase/products");
  redirect(`/hire-purchase/products/${product.id}`);
}

export async function updateProduct(formData: FormData): Promise<void> {
  const tenant = await requirePermission(PERMISSIONS.HIREPURCHASE_PRODUCTS_MANAGE);
  const session = await getServerAuthSession();
  const userId = session?.user?.id;

  const id = clean(formData.get("id"));
  const existing = await db.hirePurchaseProduct.findFirst({ where: { id, organizationId: tenant.organizationId } });
  if (!existing) redirect("/hire-purchase/products?error=product-not-found");

  const costPrice = num(formData.get("costPrice"));
  const transportCost = num(formData.get("transportCost")) || 0;
  const dailyAmount = num(formData.get("dailyAmount"));
  const duration = Math.trunc(num(formData.get("duration")));
  const active = formData.get("active") === "on";
  const price = dailyAmount * duration;

  if (!(costPrice > 0) || !(dailyAmount > 0) || !(duration > 0) || price < costPrice + transportCost) {
    redirect(`/hire-purchase/products/${id}/edit?error=invalid-product-values`);
  }

  const wasInactive = !existing.active;

  await db.$transaction(async (tx) => {
    await tx.hirePurchaseProduct.update({
      where: { id },
      data: {
        name: clean(formData.get("name")),
        category: clean(formData.get("category")),
        description: clean(formData.get("description")) || null,
        costPrice,
        transportCost,
        dailyAmount,
        duration,
        price,
        active,
      },
    });

    if (wasInactive && active) {
      const settings = await getHirePurchaseSettings(tenant.organizationId);
      await assignDefaultInventoryForProduct({
        tx,
        organizationId: tenant.organizationId,
        productId: id,
        quantity: settings.defaultStaffInventoryQuantity,
      });
    }
  }, { timeout: 15000 });

  await logAuditEvent({
    organizationId: tenant.organizationId,
    userId,
    action: "UPDATE_PRODUCT",
    entityName: "HirePurchaseProduct",
    entityId: id,
    changes: { before: existing, costPrice, transportCost, dailyAmount, duration, price, active },
  });

  revalidatePath("/hire-purchase/products");
  revalidatePath(`/hire-purchase/products/${id}`);
  redirect(`/hire-purchase/products/${id}`);
}

export async function deleteProduct(formData: FormData): Promise<void> {
  const tenant = await requirePermission(PERMISSIONS.HIREPURCHASE_PRODUCTS_MANAGE);
  const session = await getServerAuthSession();
  const userId = session?.user?.id;

  const id = clean(formData.get("id"));
  const product = await db.hirePurchaseProduct.findFirst({
    where: { id, organizationId: tenant.organizationId },
    include: { _count: { select: { accounts: true } } },
  });

  if (!product) redirect("/hire-purchase/products?error=product-not-found");
  if (product._count.accounts > 0) {
    redirect(`/hire-purchase/products/${id}?error=product-has-accounts`);
  }

  await db.hirePurchaseProduct.delete({ where: { id } });

  await logAuditEvent({
    organizationId: tenant.organizationId,
    userId,
    action: "DELETE_PRODUCT",
    entityName: "HirePurchaseProduct",
    entityId: id,
    changes: { deleted: product },
  });

  revalidatePath("/hire-purchase/products");
  redirect("/hire-purchase/products?deleted=product");
}
