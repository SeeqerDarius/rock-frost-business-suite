"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import {
  createProduct, updateProduct, createProductCategory, updateProductCategory,
  deleteProductCategory, setProductActive, deleteProduct, ProductPriceError,
  ProductCategoryInUseError, ProductInUseError, NotFoundError,
} from "@/modules/installment/service";
import { shortText, longText, moneyAmount, moneyAmountNonNegative, positiveInt, parseWithSchema } from "@/lib/validation";
import { z } from "zod";

function clean(value: FormDataEntryValue | null) {
  const str = String(value ?? "").trim();
  return str.length > 0 ? str : null;
}

const productSchema = z.object({
  name: shortText,
  category: shortText,
  description: longText.optional(),
  costPrice: moneyAmount,
  transportCost: moneyAmountNonNegative,
  dailyAmount: moneyAmount,
  duration: positiveInt,
});

export async function upsertProduct(formData: FormData): Promise<void> {
  const tenant = await requireModuleAccess("installment");
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

  const parsed = parseWithSchema(productSchema, {
    name,
    category,
    description: clean(formData.get("description")) ?? undefined,
    costPrice,
    transportCost: clean(formData.get("transportCost")) ?? "0",
    dailyAmount,
    duration: durationRaw,
  });
  if (!parsed.success) {
    redirect("/app/installment/products?error=invalid-input");
  }

  const input = {
    name: parsed.data.name,
    category: parsed.data.category,
    description: parsed.data.description ?? null,
    costPrice: parsed.data.costPrice,
    transportCost: parsed.data.transportCost,
    dailyAmount: parsed.data.dailyAmount,
    duration: parsed.data.duration,
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

  revalidatePath("/app/installment/products");
  redirect("/app/installment/products?saved=1");
}

export async function addProductCategory(formData: FormData): Promise<void> {
  const tenant = await requireModuleAccess("installment");
  if (!hasPermission(tenant, PERMISSIONS.HIREPURCHASE_PRODUCTS_MANAGE)) {
    redirect("/app/installment/products?error=forbidden");
  }

  const name = clean(formData.get("categoryName"));
  if (!name) {
    redirect("/app/installment/products?error=missing-fields");
  }

  await createProductCategory(tenant.organizationId, name);
  revalidatePath("/app/installment/products");
  redirect("/app/installment/products?saved=1");
}

async function requireProductManager() {
  const tenant = await requireModuleAccess("installment");
  if (!hasPermission(tenant, PERMISSIONS.HIREPURCHASE_PRODUCTS_MANAGE)) {
    redirect("/app/installment/products?error=forbidden");
  }
  return tenant;
}

export async function manageProductCategory(formData: FormData): Promise<void> {
  const tenant = await requireProductManager();
  const id = clean(formData.get("id"));
  const intent = clean(formData.get("intent"));
  if (!id) redirect("/app/installment/products?error=missing-fields");
  try {
    if (intent === "delete") {
      await deleteProductCategory(tenant.organizationId, id);
    } else {
      const name = clean(formData.get("name"));
      if (!name) redirect("/app/installment/products?error=missing-fields");
      await updateProductCategory(tenant.organizationId, id, {
        name,
        active: formData.get("active") === "on",
        sortOrder: Number(formData.get("sortOrder") ?? 0),
      });
    }
  } catch (error) {
    if (error instanceof ProductCategoryInUseError) redirect("/app/installment/products?error=category-in-use");
    if (error instanceof NotFoundError) redirect("/app/installment/products?error=not-found");
    throw error;
  }
  revalidatePath("/app/installment/products");
  redirect("/app/installment/products?saved=1");
}

export async function manageProductLifecycle(formData: FormData): Promise<void> {
  const tenant = await requireProductManager();
  const id = clean(formData.get("id"));
  const intent = clean(formData.get("intent"));
  if (!id) redirect("/app/installment/products?error=missing-fields");
  try {
    if (intent === "delete") await deleteProduct(tenant.organizationId, id);
    else await setProductActive(tenant.organizationId, id, intent === "activate");
  } catch (error) {
    if (error instanceof ProductInUseError) redirect("/app/installment/products?error=product-in-use");
    if (error instanceof NotFoundError) redirect("/app/installment/products?error=not-found");
    throw error;
  }
  revalidatePath("/app/installment/products");
  redirect("/app/installment/products?saved=1");
}
