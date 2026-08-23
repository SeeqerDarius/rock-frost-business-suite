"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { logAuditEvent } from "@/lib/audit";
import { getServerAuthSession } from "@/lib/auth/session";
import { cuid, dateInput, moneyAmount, parseWithSchema, shortText } from "@/lib/validation";
import { createTaxCode, createTaxPeriod, updateTaxPeriodStatus } from "@/modules/accounting/tax-service";

function value(formData: FormData, key: string) { return String(formData.get(key) ?? "").trim(); }

const taxCodeSchema = z.object({ code: shortText, name: shortText, jurisdiction: shortText, treatment: z.enum(["STANDARD", "ZERO_RATED", "EXEMPT", "RELIEVED", "OUT_OF_SCOPE"]), vatRate: moneyAmount, nhilRate: moneyAmount, getfundRate: moneyAmount, effectiveFrom: dateInput, effectiveTo: dateInput.nullable().optional() });
const periodSchema = z.object({ name: shortText, jurisdiction: shortText, startDate: dateInput, endDate: dateInput, filingDueDate: dateInput });
const stateSchema = z.object({ id: cuid, action: z.enum(["LOCK", "REOPEN", "FILE"]), filingReference: shortText.nullable().optional() });

async function context(permission: string) {
  const tenant = await requireModuleAccess("accounting");
  if (!hasPermission(tenant, permission)) redirect("/app/accounting/tax?error=forbidden");
  return { tenant, session: await getServerAuthSession() };
}

export async function createTaxCodeAction(formData: FormData): Promise<void> {
  const { tenant, session } = await context(PERMISSIONS.ACCOUNTING_SETTINGS_MANAGE);
  const parsed = parseWithSchema(taxCodeSchema, { code: value(formData, "code"), name: value(formData, "name"), jurisdiction: value(formData, "jurisdiction"), treatment: value(formData, "treatment"), vatRate: value(formData, "vatRate"), nhilRate: value(formData, "nhilRate"), getfundRate: value(formData, "getfundRate"), effectiveFrom: value(formData, "effectiveFrom"), effectiveTo: value(formData, "effectiveTo") || null });
  if (!parsed.success) redirect("/app/accounting/tax?error=invalid");
  try {
    const code = await createTaxCode(tenant.organizationId, parsed.data);
    await logAuditEvent({ organizationId: tenant.organizationId, userId: session?.user?.id ?? null, module: "accounting", action: "tax-code.created", entityName: "AccountingTaxCode", entityId: code.id });
  } catch { redirect("/app/accounting/tax?error=invalid"); }
  revalidatePath("/app/accounting/tax"); redirect("/app/accounting/tax?saved=1");
}

export async function createTaxPeriodAction(formData: FormData): Promise<void> {
  const { tenant, session } = await context(PERMISSIONS.ACCOUNTING_PERIODS_MANAGE);
  const parsed = parseWithSchema(periodSchema, { name: value(formData, "name"), jurisdiction: value(formData, "jurisdiction"), startDate: value(formData, "startDate"), endDate: value(formData, "endDate"), filingDueDate: value(formData, "filingDueDate") });
  if (!parsed.success) redirect("/app/accounting/tax?error=invalid-period");
  try {
    const period = await createTaxPeriod(tenant.organizationId, parsed.data);
    await logAuditEvent({ organizationId: tenant.organizationId, userId: session?.user?.id ?? null, module: "accounting", action: "tax-period.created", entityName: "AccountingTaxPeriod", entityId: period.id });
  } catch { redirect("/app/accounting/tax?error=invalid-period"); }
  revalidatePath("/app/accounting/tax"); redirect("/app/accounting/tax?saved=1");
}

export async function changeTaxPeriodAction(formData: FormData): Promise<void> {
  const { tenant, session } = await context(PERMISSIONS.ACCOUNTING_PERIODS_MANAGE);
  const parsed = parseWithSchema(stateSchema, { id: value(formData, "id"), action: value(formData, "action"), filingReference: value(formData, "filingReference") || null });
  if (!parsed.success) redirect("/app/accounting/tax?error=invalid-state");
  try {
    const period = await updateTaxPeriodStatus(tenant.organizationId, parsed.data.id, parsed.data.action, parsed.data.filingReference);
    await logAuditEvent({ organizationId: tenant.organizationId, userId: session?.user?.id ?? null, module: "accounting", action: `tax-period.${parsed.data.action.toLowerCase()}`, entityName: "AccountingTaxPeriod", entityId: period.id, metadata: { filingReference: parsed.data.filingReference } });
  } catch { redirect("/app/accounting/tax?error=invalid-state"); }
  revalidatePath("/app/accounting/tax"); redirect(`/app/accounting/tax?period=${parsed.data.id}&saved=1`);
}
