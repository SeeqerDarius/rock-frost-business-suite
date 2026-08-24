"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getServerAuthSession } from "@/lib/auth/session";
import { createSale, SaleStateError, InsufficientStockError, InvalidSaleInputError, NotFoundError } from "@/modules/pos/service";
import { createItem, createCategory, listCategories, ItemBarcodeTakenError, ItemSkuTakenError } from "@/modules/inventory/service";
import { shortText, positiveInt, moneyAmountNonNegative, moneyAmount, cuid, parseWithSchema } from "@/lib/validation";
import type { PosPaymentMethod } from "@prisma/client";
import { logAuditEvent } from "@/lib/audit";
import { postModuleRevenue } from "@/lib/accounting-integration";

const clean = (value: FormDataEntryValue | null) => String(value ?? "").trim();
const optional = <T extends z.ZodTypeAny>(schema: T) => z.union([schema, z.literal("")]).transform((value) => value === "" ? null : value);
const methods = ["CASH", "CARD", "MOBILE_MONEY", "OTHER"] as const;
const saleSchema = z.object({ sessionId: cuid, customerName: optional(shortText), mode: z.enum(["COMPLETED", "SUSPENDED"]) });
const lineSchema = z.object({ itemId: optional(cuid), description: shortText, quantity: positiveInt, unitPrice: moneyAmountNonNegative });
const paymentSchema = z.object({ method: z.enum(methods), amount: moneyAmountNonNegative, reference: optional(shortText) });

export async function completeSale(formData: FormData): Promise<void> {
  const tenant = await requireModuleAccess("pos");
  if (!hasPermission(tenant, PERMISSIONS.POS_SALES_MANAGE)) redirect("/app/pos/sell?error=forbidden");
  const parsed = parseWithSchema(saleSchema, { sessionId: clean(formData.get("sessionId")), customerName: clean(formData.get("customerName")), mode: clean(formData.get("mode")) });
  if (!parsed.success) redirect("/app/pos/sell?error=missing-fields");
  let rawLines: unknown;
  let rawPayments: unknown;
  try { rawLines = JSON.parse(clean(formData.get("lines"))); rawPayments = JSON.parse(clean(formData.get("payments"))); } catch { redirect("/app/pos/sell?error=invalid-line"); }
  const linesParsed = z.array(lineSchema).min(1).max(100).safeParse(rawLines);
  const paymentsParsed = z.array(paymentSchema).max(10).safeParse(rawPayments);
  if (!linesParsed.success || !paymentsParsed.success || (parsed.data.mode === "COMPLETED" && paymentsParsed.data.length === 0)) redirect("/app/pos/sell?error=invalid-line");
  const session = await getServerAuthSession();
  try {
    const sale = await createSale(tenant.organizationId, {
      sessionId: parsed.data.sessionId,
      customerName: parsed.data.customerName,
      paymentMethod: (paymentsParsed.data[0]?.method ?? "CASH") as PosPaymentMethod,
      soldById: session?.user?.id ?? null,
      lines: linesParsed.data,
      payments: paymentsParsed.data.map((payment) => ({ ...payment, method: payment.method as PosPaymentMethod })),
      status: parsed.data.mode,
    });
    await logAuditEvent({ organizationId: tenant.organizationId, userId: session?.user?.id ?? null, module: "pos", action: parsed.data.mode === "SUSPENDED" ? "pos.sale.suspend" : "pos.sale", entityName: "PosSale", entityId: sale.id, metadata: { saleNumber: sale.saleNumber, total: Number(sale.total), lineCount: linesParsed.data.length } });

    if (parsed.data.mode === "COMPLETED") {
      await postModuleRevenue(tenant.organizationId, {
        sourceModule: "pos",
        sourceType: "POS_SALE",
        sourceId: sale.id,
        postingPurpose: "COLLECTED",
        amount: sale.total.toString(),
        entryDate: sale.createdAt,
        description: `POS sale ${sale.saleNumber}`,
        createdById: session?.user?.id ?? null,
      });
    }
  } catch (error) {
    if (error instanceof InsufficientStockError) redirect("/app/pos/sell?error=insufficient-stock");
    if (error instanceof SaleStateError) redirect("/app/pos/sell?error=no-open-session");
    if (error instanceof InvalidSaleInputError) redirect("/app/pos/sell?error=invalid-line");
    if (error instanceof NotFoundError) redirect("/app/pos/sell?error=not-found");
    throw error;
  }
  revalidatePath("/app/pos/sell"); revalidatePath("/app/pos/sales"); revalidatePath("/app/inventory/stock");
  redirect("/app/pos/sell?saved=1");
}

const quickItemSchema = z.object({
  name: shortText,
  barcode: z.union([shortText, z.literal("")]).transform((value) => value === "" ? null : value),
  price: moneyAmount,
  categoryId: z.union([cuid, z.literal("")]).transform((value) => value === "" ? null : value),
  newCategoryName: z.union([shortText, z.literal("")]).transform((value) => value === "" ? null : value),
});

function skuFromName(name: string): string {
  const base = name.toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24) || "ITEM";
  return `${base}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

type QuickItemResult =
  | { ok: true; item: { id: string; name: string; sku: string; barcode: string | null; price: string; categoryId: string | null; imageData: string | null }; category?: { id: string; name: string } }
  | { ok: false; error: string };

/**
 * Lets a cashier add a new sellable item without leaving the sell screen,
 * mirroring the "New product" flow from the register. Does not redirect or
 * revalidate the page: the caller is a client component with an in-progress
 * cart it must not lose, so the created item/category are handed back for
 * the caller to merge into its own local state instead.
 */
export async function createPosQuickItem(formData: FormData): Promise<QuickItemResult> {
  const tenant = await requireModuleAccess("pos");
  if (!hasPermission(tenant, PERMISSIONS.POS_SALES_MANAGE)) return { ok: false, error: "You don't have permission to add products." };

  const parsed = parseWithSchema(quickItemSchema, {
    name: clean(formData.get("name")),
    barcode: clean(formData.get("barcode")),
    price: clean(formData.get("price")),
    categoryId: clean(formData.get("categoryId")),
    newCategoryName: clean(formData.get("newCategoryName")),
  });
  if (!parsed.success) return { ok: false, error: parsed.firstError };

  let categoryId = parsed.data.categoryId;
  let createdCategory: { id: string; name: string } | undefined;
  if (parsed.data.newCategoryName) {
    const existing = (await listCategories(tenant.organizationId)).find((c) => c.name.toLowerCase() === parsed.data.newCategoryName!.toLowerCase());
    const category = existing ?? await createCategory(tenant.organizationId, parsed.data.newCategoryName);
    categoryId = category.id;
    if (!existing) createdCategory = { id: category.id, name: category.name };
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const item = await createItem(tenant.organizationId, {
        sku: skuFromName(parsed.data.name),
        barcode: parsed.data.barcode,
        name: parsed.data.name,
        categoryId,
        costPrice: "0",
        salesPrice: parsed.data.price,
      });
      return {
        ok: true,
        item: { id: item.id, name: item.name, sku: item.sku, barcode: item.barcode, price: Number(item.salesPrice).toFixed(2), categoryId: item.categoryId, imageData: item.imageData },
        category: createdCategory,
      };
    } catch (error) {
      if (error instanceof ItemBarcodeTakenError) return { ok: false, error: "That barcode is already in use." };
      if (error instanceof ItemSkuTakenError) continue;
      throw error;
    }
  }
  return { ok: false, error: "Could not generate a unique SKU. Try again." };
}
