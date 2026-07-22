"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getServerAuthSession } from "@/lib/auth/session";
import { createRequest, approveRequest, rejectRequest, RequestStateError, NotFoundError } from "@/modules/procurement/service";
import { shortText, positiveInt, moneyAmountNonNegative, longText, cuid, parseWithSchema } from "@/lib/validation";

function clean(value: FormDataEntryValue | null): string {
  return String(value ?? "").trim();
}

/** Wraps a schema so an empty form field (missing/blank input) parses to null instead of failing validation. */
function optional<T extends z.ZodTypeAny>(schema: T) {
  return z.union([schema, z.literal("")]).transform((value) => (value === "" ? null : value));
}

const idSchema = z.object({ id: cuid });

const createRequestSchema = z.object({
  description: shortText,
  quantity: positiveInt,
  itemId: optional(cuid),
  estimatedCost: optional(moneyAmountNonNegative),
  notes: optional(longText),
});

export async function createNewRequest(formData: FormData): Promise<void> {
  const tenant = await requireModuleAccess("procurement");
  if (!hasPermission(tenant, PERMISSIONS.PROCUREMENT_REQUESTS_MANAGE)) {
    redirect("/app/procurement/requests?error=forbidden");
  }

  const parsed = parseWithSchema(createRequestSchema, {
    description: clean(formData.get("description")),
    quantity: clean(formData.get("quantity")),
    itemId: clean(formData.get("itemId")),
    estimatedCost: clean(formData.get("estimatedCost")),
    notes: clean(formData.get("notes")),
  });
  if (!parsed.success) {
    redirect("/app/procurement/requests?error=missing-fields");
  }
  const { description, quantity, itemId, estimatedCost, notes } = parsed.data;

  const session = await getServerAuthSession();
  try {
    await createRequest(tenant.organizationId, {
      itemId,
      description,
      quantity,
      estimatedCost,
      notes,
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
  const tenant = await requireModuleAccess("procurement");
  if (!hasPermission(tenant, PERMISSIONS.PROCUREMENT_REQUESTS_MANAGE)) {
    redirect("/app/procurement/requests?error=forbidden");
  }
  const parsedId = parseWithSchema(idSchema, { id: clean(formData.get("id")) });
  if (!parsedId.success) return;
  const { id } = parsedId.data;

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
  const tenant = await requireModuleAccess("procurement");
  if (!hasPermission(tenant, PERMISSIONS.PROCUREMENT_REQUESTS_MANAGE)) {
    redirect("/app/procurement/requests?error=forbidden");
  }
  const parsedId = parseWithSchema(idSchema, { id: clean(formData.get("id")) });
  if (!parsedId.success) return;
  const { id } = parsedId.data;

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
