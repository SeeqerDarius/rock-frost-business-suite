"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getServerAuthSession } from "@/lib/auth/session";
import { createRequest, approveRequest, rejectRequest, RequestApprovalError, RequestStateError, NotFoundError } from "@/modules/procurement/service";
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
  lines: z.array(z.object({ description: shortText, quantity: positiveInt, itemId: cuid.nullable(), estimatedCost: moneyAmountNonNegative.nullable() })).min(1).max(50),
  notes: optional(longText),
});

export async function createNewRequest(formData: FormData): Promise<void> {
  const tenant = await requireModuleAccess("procurement");
  if (!hasPermission(tenant, PERMISSIONS.PROCUREMENT_REQUESTS_MANAGE)) {
    redirect("/app/procurement/requests?error=forbidden");
  }

  let rawLines: unknown;
  try { rawLines = JSON.parse(clean(formData.get("linesJson"))); } catch { redirect("/app/procurement/requests?error=missing-fields"); }
  const parsed = parseWithSchema(createRequestSchema, { lines: rawLines, notes: clean(formData.get("notes")) });
  if (!parsed.success) {
    redirect("/app/procurement/requests?error=missing-fields");
  }
  const { lines, notes } = parsed.data;

  const session = await getServerAuthSession();
  try {
    await createRequest(tenant.organizationId, {
      itemId: lines[0].itemId,
      description: lines[0].description,
      quantity: lines[0].quantity,
      estimatedCost: lines[0].estimatedCost,
      lines,
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
  if (!hasPermission(tenant, PERMISSIONS.PROCUREMENT_REQUESTS_APPROVE)) {
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
    if (error instanceof RequestApprovalError) redirect("/app/procurement/requests?error=maker-checker");
    if (error instanceof NotFoundError) redirect("/app/procurement/requests?error=not-found");
    throw error;
  }

  revalidatePath("/app/procurement/requests");
  redirect("/app/procurement/requests?saved=1");
}

export async function rejectExistingRequest(formData: FormData): Promise<void> {
  const tenant = await requireModuleAccess("procurement");
  if (!hasPermission(tenant, PERMISSIONS.PROCUREMENT_REQUESTS_APPROVE)) {
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
    if (error instanceof RequestApprovalError) redirect("/app/procurement/requests?error=maker-checker");
    if (error instanceof NotFoundError) redirect("/app/procurement/requests?error=not-found");
    throw error;
  }

  revalidatePath("/app/procurement/requests");
  redirect("/app/procurement/requests?saved=1");
}
