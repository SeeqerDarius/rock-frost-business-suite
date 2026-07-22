"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getServerAuthSession } from "@/lib/auth/session";
import {
  createRegister,
  updateRegister,
  openSession,
  closeSession,
  SessionStateError,
  NotFoundError,
} from "@/modules/pos/service";
import { shortText, moneyAmountNonNegative, cuid, parseWithSchema } from "@/lib/validation";
import { z } from "zod";

function clean(value: FormDataEntryValue | null) {
  const str = String(value ?? "").trim();
  return str.length > 0 ? str : null;
}

export async function upsertRegister(formData: FormData): Promise<void> {
  const tenant = await requireModuleAccess("pos");
  if (!hasPermission(tenant, PERMISSIONS.POS_REGISTERS_MANAGE)) {
    redirect("/app/pos/registers?error=forbidden");
  }

  const id = clean(formData.get("id"));
  const name = clean(formData.get("name"));
  if (!name) {
    redirect("/app/pos/registers?error=missing-fields");
  }

  const parsed = parseWithSchema(z.object({ name: shortText, warehouseId: cuid.nullable() }), {
    name,
    warehouseId: clean(formData.get("warehouseId")),
  });
  if (!parsed.success) {
    redirect("/app/pos/registers?error=invalid-input");
  }

  const data = {
    name: parsed.data.name,
    warehouseId: parsed.data.warehouseId,
    active: formData.get("active") === "on",
  };

  try {
    if (id) {
      await updateRegister(tenant.organizationId, id, data);
    } else {
      await createRegister(tenant.organizationId, data);
    }
  } catch (error) {
    if (error instanceof NotFoundError) redirect("/app/pos/registers?error=not-found");
    throw error;
  }

  revalidatePath("/app/pos/registers");
  redirect("/app/pos/registers?saved=1");
}

export async function openRegisterSession(formData: FormData): Promise<void> {
  const tenant = await requireModuleAccess("pos");
  if (!hasPermission(tenant, PERMISSIONS.POS_SESSIONS_MANAGE)) {
    redirect("/app/pos/registers?error=forbidden");
  }

  const registerId = clean(formData.get("registerId"));
  if (!registerId) return;

  const parsed = parseWithSchema(moneyAmountNonNegative, clean(formData.get("openingFloat")) ?? "0");
  if (!parsed.success) {
    redirect("/app/pos/registers?error=invalid-input");
  }

  const session = await getServerAuthSession();
  try {
    await openSession(tenant.organizationId, { registerId, openingFloat: parsed.data, openedById: session?.user?.id ?? null });
  } catch (error) {
    if (error instanceof SessionStateError) redirect("/app/pos/registers?error=session-open");
    if (error instanceof NotFoundError) redirect("/app/pos/registers?error=not-found");
    throw error;
  }

  revalidatePath("/app/pos/registers");
  redirect("/app/pos/registers?saved=1");
}

export async function closeRegisterSession(formData: FormData): Promise<void> {
  const tenant = await requireModuleAccess("pos");
  if (!hasPermission(tenant, PERMISSIONS.POS_SESSIONS_MANAGE)) {
    redirect("/app/pos/registers?error=forbidden");
  }

  const sessionId = clean(formData.get("sessionId"));
  const closingCash = clean(formData.get("closingCash"));
  if (!sessionId || !closingCash) {
    redirect("/app/pos/registers?error=missing-fields");
  }

  const parsed = parseWithSchema(moneyAmountNonNegative, closingCash);
  if (!parsed.success) {
    redirect("/app/pos/registers?error=invalid-input");
  }

  const authSession = await getServerAuthSession();
  try {
    await closeSession(tenant.organizationId, sessionId, { closingCash: parsed.data, closedById: authSession?.user?.id ?? null });
  } catch (error) {
    if (error instanceof SessionStateError) redirect("/app/pos/registers?error=session-closed");
    throw error;
  }

  revalidatePath("/app/pos/registers");
  redirect("/app/pos/registers?saved=1");
}
