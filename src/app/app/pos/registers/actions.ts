"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireCurrentTenant } from "@/lib/tenant";
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

function clean(value: FormDataEntryValue | null) {
  const str = String(value ?? "").trim();
  return str.length > 0 ? str : null;
}

export async function upsertRegister(formData: FormData): Promise<void> {
  const tenant = await requireCurrentTenant();
  if (!hasPermission(tenant, PERMISSIONS.POS_REGISTERS_MANAGE)) {
    redirect("/app/pos/registers?error=forbidden");
  }

  const id = clean(formData.get("id"));
  const name = clean(formData.get("name"));
  if (!name) {
    redirect("/app/pos/registers?error=missing-fields");
  }

  const data = {
    name,
    warehouseId: clean(formData.get("warehouseId")),
    active: formData.get("active") === "on",
  };

  if (id) {
    await updateRegister(tenant.organizationId, id, data);
  } else {
    await createRegister(tenant.organizationId, data);
  }

  revalidatePath("/app/pos/registers");
  redirect("/app/pos/registers?saved=1");
}

export async function openRegisterSession(formData: FormData): Promise<void> {
  const tenant = await requireCurrentTenant();
  if (!hasPermission(tenant, PERMISSIONS.POS_SESSIONS_MANAGE)) {
    redirect("/app/pos/registers?error=forbidden");
  }

  const registerId = clean(formData.get("registerId"));
  const openingFloat = clean(formData.get("openingFloat")) ?? "0";
  if (!registerId) return;

  const session = await getServerAuthSession();
  try {
    await openSession(tenant.organizationId, { registerId, openingFloat, openedById: session?.user?.id ?? null });
  } catch (error) {
    if (error instanceof SessionStateError) redirect("/app/pos/registers?error=session-open");
    if (error instanceof NotFoundError) redirect("/app/pos/registers?error=not-found");
    throw error;
  }

  revalidatePath("/app/pos/registers");
  redirect("/app/pos/registers?saved=1");
}

export async function closeRegisterSession(formData: FormData): Promise<void> {
  const tenant = await requireCurrentTenant();
  if (!hasPermission(tenant, PERMISSIONS.POS_SESSIONS_MANAGE)) {
    redirect("/app/pos/registers?error=forbidden");
  }

  const sessionId = clean(formData.get("sessionId"));
  const closingCash = clean(formData.get("closingCash"));
  if (!sessionId || !closingCash) {
    redirect("/app/pos/registers?error=missing-fields");
  }

  const authSession = await getServerAuthSession();
  try {
    await closeSession(tenant.organizationId, sessionId, { closingCash, closedById: authSession?.user?.id ?? null });
  } catch (error) {
    if (error instanceof SessionStateError) redirect("/app/pos/registers?error=session-closed");
    throw error;
  }

  revalidatePath("/app/pos/registers");
  redirect("/app/pos/registers?saved=1");
}
