"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getServerAuthSession } from "@/lib/auth/session";
import { logAuditEvent } from "@/lib/audit";
import { cuid, dateInput, parseWithSchema, shortText } from "@/lib/validation";
import {
  closeAccountingPeriod,
  createAccountingPeriod,
  reopenAccountingPeriod,
} from "@/modules/accounting/service";

const periodSchema = z.object({ name: shortText, startDate: dateInput, endDate: dateInput });
const idSchema = z.object({ id: cuid });

function value(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

async function requirePeriodManager() {
  const tenant = await requireModuleAccess("accounting");
  if (!hasPermission(tenant, PERMISSIONS.ACCOUNTING_PERIODS_MANAGE)) {
    redirect("/app/accounting/periods?error=forbidden");
  }
  return tenant;
}

export async function createPeriodAction(formData: FormData): Promise<void> {
  const tenant = await requirePeriodManager();
  const parsed = parseWithSchema(periodSchema, {
    name: value(formData, "name"),
    startDate: value(formData, "startDate"),
    endDate: value(formData, "endDate"),
  });
  if (!parsed.success) redirect("/app/accounting/periods?error=invalid");
  const session = await getServerAuthSession();
  try {
    const period = await createAccountingPeriod(tenant.organizationId, parsed.data);
    await logAuditEvent({ organizationId: tenant.organizationId, userId: session?.user?.id ?? null, module: "accounting", action: "period.created", entityName: "AccountingPeriod", entityId: period.id });
  } catch {
    redirect("/app/accounting/periods?error=overlap");
  }
  revalidatePath("/app/accounting/periods");
  redirect("/app/accounting/periods?saved=1");
}

async function changePeriodState(formData: FormData, state: "close" | "reopen") {
  const tenant = await requirePeriodManager();
  const parsed = parseWithSchema(idSchema, { id: value(formData, "id") });
  if (!parsed.success) redirect("/app/accounting/periods?error=invalid");
  const session = await getServerAuthSession();
  const actorId = session?.user?.id ?? null;
  try {
    const period = state === "close"
      ? await closeAccountingPeriod(tenant.organizationId, parsed.data.id, actorId)
      : await reopenAccountingPeriod(tenant.organizationId, parsed.data.id, actorId);
    await logAuditEvent({ organizationId: tenant.organizationId, userId: actorId, module: "accounting", action: state === "close" ? "period.closed" : "period.reopened", entityName: "AccountingPeriod", entityId: period.id });
  } catch {
    redirect("/app/accounting/periods?error=state");
  }
  revalidatePath("/app/accounting/periods");
  redirect("/app/accounting/periods?saved=1");
}

export async function closePeriodAction(formData: FormData): Promise<void> {
  return changePeriodState(formData, "close");
}

export async function reopenPeriodAction(formData: FormData): Promise<void> {
  return changePeriodState(formData, "reopen");
}
