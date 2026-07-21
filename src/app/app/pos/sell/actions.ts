"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireCurrentTenant } from "@/lib/tenant";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getServerAuthSession } from "@/lib/auth/session";
import { createSale, SaleStateError, InsufficientStockError, InvalidSaleInputError, NotFoundError } from "@/modules/pos/service";
import { shortText, positiveInt, moneyAmountNonNegative, cuid, parseWithSchema } from "@/lib/validation";
import type { PosPaymentMethod } from "@prisma/client";

function clean(value: FormDataEntryValue | null): string {
  return String(value ?? "").trim();
}

/** Wraps a schema so an empty form field (missing/blank input) parses to null instead of failing validation. */
function optional<T extends z.ZodTypeAny>(schema: T) {
  return z.union([schema, z.literal("")]).transform((value) => (value === "" ? null : value));
}

const PAYMENT_METHOD_VALUES = ["CASH", "CARD", "MOBILE_MONEY", "OTHER"] as const;

const saleSchema = z.object({
  sessionId: cuid,
  paymentMethod: z.enum(PAYMENT_METHOD_VALUES),
  customerName: optional(shortText),
});

const lineSchema = z.object({
  itemId: optional(cuid),
  description: shortText,
  quantity: positiveInt,
  unitPrice: moneyAmountNonNegative,
});

export async function completeSale(formData: FormData): Promise<void> {
  const tenant = await requireCurrentTenant();
  if (!hasPermission(tenant, PERMISSIONS.POS_SALES_MANAGE)) {
    redirect("/app/pos/sell?error=forbidden");
  }

  const parsed = parseWithSchema(saleSchema, {
    sessionId: clean(formData.get("sessionId")),
    paymentMethod: clean(formData.get("paymentMethod")),
    customerName: clean(formData.get("customerName")),
  });
  if (!parsed.success) {
    redirect("/app/pos/sell?error=missing-fields");
  }
  const { sessionId, paymentMethod, customerName } = parsed.data;

  // Line items come in as flat, numbered form fields (description1/quantity1/unitPrice1,
  // description2/..., description3/...) rather than a JSON blob — this is the highest-traffic
  // financial write path in the module, so every provided line's quantity/price is validated
  // with the same shared schemas used elsewhere, not ad-hoc parseInt/parseFloat.
  const lines = [];
  for (let i = 1; i <= 3; i++) {
    const rawDescription = clean(formData.get(`description${i}`));
    const rawQuantity = clean(formData.get(`quantity${i}`));
    const rawUnitPrice = clean(formData.get(`unitPrice${i}`));
    if (!rawDescription && !rawQuantity && !rawUnitPrice) continue; // fully blank line — skip it

    const lineParsed = parseWithSchema(lineSchema, {
      itemId: clean(formData.get(`itemId${i}`)),
      description: rawDescription,
      quantity: rawQuantity,
      unitPrice: rawUnitPrice,
    });
    if (!lineParsed.success) {
      redirect("/app/pos/sell?error=invalid-line");
    }
    lines.push(lineParsed.data);
  }

  if (lines.length === 0) {
    redirect("/app/pos/sell?error=no-lines");
  }

  const session = await getServerAuthSession();

  try {
    await createSale(tenant.organizationId, {
      sessionId,
      customerName,
      paymentMethod: paymentMethod as PosPaymentMethod,
      soldById: session?.user?.id ?? null,
      lines,
    });
  } catch (error) {
    if (error instanceof InsufficientStockError) redirect("/app/pos/sell?error=insufficient-stock");
    if (error instanceof SaleStateError) redirect("/app/pos/sell?error=no-open-session");
    if (error instanceof InvalidSaleInputError) redirect("/app/pos/sell?error=invalid-line");
    if (error instanceof NotFoundError) redirect("/app/pos/sell?error=not-found");
    throw error;
  }

  revalidatePath("/app/pos/sell");
  revalidatePath("/app/pos/sales");
  revalidatePath("/app/inventory/stock");
  revalidatePath("/app/inventory/items");
  redirect("/app/pos/sell?saved=1");
}
