"use server";

import { redirect } from "next/navigation";
import { requireCurrentTenant } from "@/lib/tenant";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { createProduct, updateProduct, createProductCategory, ProductPriceError } from "@/modules/installment/service";

function clean(value: FormDataEntryValue | null) {
  const str = String(value ?? "").trim();
  return str.length > 0 ? str : null;
}

export async function upsertProduct(formData: FormData): Promise<void> {
  const tenant = await requireCurrentTenant();
  if (!hasPermission(tenant, PERMISSIONS.HIREPURCHASE_PRODUCTS_MANAGE)) {
    redirect("/app/installment/products?error=forbidden");
  }

  const id = clean(formData.get("id"));
  const name = clean(formData.get("name"));
  const category = clean(formData.get("category"));
  const costPrice = clean(formData.get("costPrice"));
  const dailyAmount = clean(formData.get("dailyAmount"));
  const durationRaw = clean(formData.get("duration"));

  if (!name || !category || !costPrice || !dailyAmount || !durationRaw) {
    redirect("/app/installment/products?error=missing-fields");
  }

  const input = {
    name,
    category,
    description: clean(formData.get("description")),
    costPrice,
    transportCost: clean(formData.get("transportCost")) ?? "0",
    dailyAmount,
    duration: Number.parseInt(durationRaw, 10),
  };

  try {
    if (id) {
      await updateProduct(tenant.organizationId, id, input);
    } else {
      await createProduct(tenant.organizationId, input);
    }
  } catch (error) {
    if (error instanceof ProductPriceError) {
      redirect("/app/installment/products?error=price-floor");
    }
    throw error;
  }

  redirect("/app/installment/products?saved=1");
}

export async function addProductCategory(formData: FormData): Promise<void> {
  const tenant = await requireCurrentTenant();
  if (!hasPermission(tenant, PERMISSIONS.HIREPURCHASE_PRODUCTS_MANAGE)) {
    redirect("/app/installment/products?error=forbidden");
  }

  const name = clean(formData.get("categoryName"));
  if (!name) {
    redirect("/app/installment/products?error=missing-fields");
  }

  await createProductCategory(tenant.organizationId, name);
  redirect("/app/installment/products?saved=1");
}
