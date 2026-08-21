"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getServerAuthSession } from "@/lib/auth/session";
import { returnSaleLines, resumeSuspendedSale, SaleStateError, InvalidSaleInputError, NotFoundError } from "@/modules/pos/service";
import { cuid, moneyAmountNonNegative, parseWithSchema, positiveInt, shortText } from "@/lib/validation";
import { logAuditEvent } from "@/lib/audit";

const methods = ["CASH", "CARD", "MOBILE_MONEY", "OTHER"] as const;
const clean = (value: FormDataEntryValue | null) => String(value ?? "").trim();
const returnSchema = z.object({ saleId: cuid, reason: shortText, refundMethod: z.enum(methods), lines: z.array(z.object({ saleLineId: cuid, quantity: positiveInt })).min(1).max(100) });
const resumeSchema = z.object({ saleId: cuid, method: z.enum(methods), amount: moneyAmountNonNegative });

export async function returnSale(formData: FormData): Promise<void> {
  const tenant = await requireModuleAccess("pos");
  if (!hasPermission(tenant, PERMISSIONS.POS_RETURNS_MANAGE)) redirect("/app/pos/sales?error=forbidden");
  let rawLines: unknown;
  try { rawLines = JSON.parse(clean(formData.get("lines"))); } catch { redirect("/app/pos/sales?error=invalid-return"); }
  const parsed = parseWithSchema(returnSchema, { saleId: clean(formData.get("saleId")), reason: clean(formData.get("reason")), refundMethod: clean(formData.get("refundMethod")), lines: rawLines });
  if (!parsed.success) redirect("/app/pos/sales?error=invalid-return");
  const auth = await getServerAuthSession();
  try {
    const result = await returnSaleLines(tenant.organizationId, parsed.data.saleId, { ...parsed.data, processedById: auth?.user?.id ?? null });
    await logAuditEvent({ organizationId: tenant.organizationId, userId: auth?.user?.id ?? null, module: "pos", action: "pos.return", entityName: "PosReturn", entityId: result.id, metadata: { returnNumber: result.returnNumber, refundAmount: Number(result.refundAmount) } });
  } catch (error) {
    if (error instanceof InvalidSaleInputError || error instanceof SaleStateError) redirect("/app/pos/sales?error=invalid-return");
    if (error instanceof NotFoundError) redirect("/app/pos/sales?error=not-found");
    throw error;
  }
  revalidatePath("/app/pos/sales"); revalidatePath("/app/inventory/stock");
  redirect("/app/pos/sales?saved=1");
}

export async function resumeSale(formData: FormData): Promise<void> {
  const tenant = await requireModuleAccess("pos");
  if (!hasPermission(tenant, PERMISSIONS.POS_SALES_MANAGE)) redirect("/app/pos/sales?error=forbidden");
  const parsed = parseWithSchema(resumeSchema, { saleId: clean(formData.get("saleId")), method: clean(formData.get("method")), amount: clean(formData.get("amount")) });
  if (!parsed.success) redirect("/app/pos/sales?error=invalid-payment");
  const auth = await getServerAuthSession();
  try { await resumeSuspendedSale(tenant.organizationId, parsed.data.saleId, [{ method: parsed.data.method, amount: parsed.data.amount }], auth?.user?.id ?? null); }
  catch (error) { if (error instanceof InvalidSaleInputError || error instanceof SaleStateError) redirect("/app/pos/sales?error=invalid-payment"); throw error; }
  revalidatePath("/app/pos/sales"); revalidatePath("/app/inventory/stock");
  redirect("/app/pos/sales?saved=1");
}
