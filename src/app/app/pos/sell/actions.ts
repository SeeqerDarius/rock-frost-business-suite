"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getServerAuthSession } from "@/lib/auth/session";
import { createSale, SaleStateError, InsufficientStockError, InvalidSaleInputError, NotFoundError } from "@/modules/pos/service";
import { shortText, positiveInt, moneyAmountNonNegative, cuid, parseWithSchema } from "@/lib/validation";
import type { PosPaymentMethod } from "@prisma/client";
import { logAuditEvent } from "@/lib/audit";

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
