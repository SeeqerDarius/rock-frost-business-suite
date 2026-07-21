"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireCurrentTenant } from "@/lib/tenant";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getServerAuthSession } from "@/lib/auth/session";
import { createRequest, approveRequest, rejectRequest, RequestStateError, NotFoundError } from "@/modules/procurement/service";

function clean(value: FormDataEntryValue | null) {
  const str = String(value ?? "").trim();
  return str.length > 0 ? str : null;
}

export async function createNewRequest(formData: FormData): Promise<void> {
  const tenant = await requireCurrentTenant();
  if (!hasPermission(tenant, PERMISSIONS.PROCUREMENT_REQUESTS_MANAGE)) {
    redirect("/app/procurement/requests?error=forbidden");
  }

  const description = clean(formData.get("description"));
  const quantityRaw = clean(formData.get("quantity"));
  if (!description || !quantityRaw) {
    redirect("/app/procurement/requests?error=missing-fields");
  }

  const session = await getServerAuthSession();
  try {
    await createRequest(tenant.organizationId, {
      itemId: clean(formData.get("itemId")),
      description,
      quantity: Number.parseInt(quantityRaw, 10),
      estimatedCost: clean(formData.get("estimatedCost")),
      notes: clean(formData.get("notes")),
      requestedById: session?.user?.id ?? null,
    });
  } catch (error) {
    if (error instanceof NotFoundError) redirect("/app/procurement/requests?error=not-found");
    throw error;
  }

  revalidatePath("/app/procurement/requests");
  redirect("/app/procurement/requests?saved=1");
}

export async function approveExistingRequest(formData: FormData): Promise<void> {
  const tenant = await requireCurrentTenant();
  if (!hasPermission(tenant, PERMISSIONS.PROCUREMENT_REQUESTS_MANAGE)) {
    redirect("/app/procurement/requests?error=forbidden");
  }
  const id = clean(formData.get("id"));
  if (!id) return;

  const session = await getServerAuthSession();
  try {
    await approveRequest(tenant.organizationId, id, session?.user?.id ?? null);
  } catch (error) {
    if (error instanceof RequestStateError) redirect("/app/procurement/requests?error=invalid-state");
    if (error instanceof NotFoundError) redirect("/app/procurement/requests?error=not-found");
    throw error;
  }

  revalidatePath("/app/procurement/requests");
  redirect("/app/procurement/requests?saved=1");
}

export async function rejectExistingRequest(formData: FormData): Promise<void> {
  const tenant = await requireCurrentTenant();
  if (!hasPermission(tenant, PERMISSIONS.PROCUREMENT_REQUESTS_MANAGE)) {
    redirect("/app/procurement/requests?error=forbidden");
  }
  const id = clean(formData.get("id"));
  if (!id) return;

  const session = await getServerAuthSession();
  try {
    await rejectRequest(tenant.organizationId, id, session?.user?.id ?? null);
  } catch (error) {
    if (error instanceof RequestStateError) redirect("/app/procurement/requests?error=invalid-state");
    if (error instanceof NotFoundError) redirect("/app/procurement/requests?error=not-found");
    throw error;
  }

  revalidatePath("/app/procurement/requests");
  redirect("/app/procurement/requests?saved=1");
}
