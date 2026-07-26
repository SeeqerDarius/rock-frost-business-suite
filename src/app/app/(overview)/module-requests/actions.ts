"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireCurrentTenant } from "@/lib/tenant";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { cuid, longText, parseWithSchema, positiveInt, shortText } from "@/lib/validation";
import { addRequesterMessage, createModuleRequest } from "@/platform/module-requests/service";

const requestSchema = z.object({
  type: z.enum([
    "DEMO",
    "ENABLE_EXISTING",
    "CUSTOMIZE_EXISTING",
    "CUSTOM_MODULE",
    "INTEGRATION",
    "DATA_MIGRATION",
  ]),
  moduleId: z.union([cuid, z.literal("")]).optional(),
  title: shortText,
  businessJustification: longText,
  customizationDetails: longText.optional(),
  expectedUsers: z.union([positiveInt, z.literal("")]).optional(),
});

const messageSchema = z.object({
  requestId: cuid,
  note: longText,
});

function requireRequestPermission(tenant: Awaited<ReturnType<typeof requireCurrentTenant>>) {
  if (!hasPermission(tenant, PERMISSIONS.ORG_SETTINGS_MANAGE)) {
    redirect("/app/modules?error=forbidden");
  }
}

export async function submitModuleRequest(formData: FormData): Promise<void> {
  const tenant = await requireCurrentTenant();
  requireRequestPermission(tenant);

  const parsed = parseWithSchema(requestSchema, {
    type: String(formData.get("type") ?? "").trim(),
    moduleId: String(formData.get("moduleId") ?? "").trim(),
    title: String(formData.get("title") ?? "").trim(),
    businessJustification: String(formData.get("businessJustification") ?? "").trim(),
    customizationDetails: String(formData.get("customizationDetails") ?? "").trim() || undefined,
    expectedUsers: String(formData.get("expectedUsers") ?? "").trim(),
  });
  if (!parsed.success) redirect("/app/module-requests?error=invalid");

  const needsExistingModule =
    parsed.data.type === "DEMO" || parsed.data.type === "ENABLE_EXISTING" || parsed.data.type === "CUSTOMIZE_EXISTING";
  if (needsExistingModule && !parsed.data.moduleId) {
    redirect("/app/module-requests?error=module-required");
  }

  await createModuleRequest({
    organizationId: tenant.organizationId,
    requestedById: tenant.userId,
    type: parsed.data.type,
    moduleId: parsed.data.moduleId || null,
    title: parsed.data.title,
    businessJustification: parsed.data.businessJustification,
    customizationDetails: parsed.data.customizationDetails || null,
    expectedUsers:
      parsed.data.expectedUsers === "" || parsed.data.expectedUsers === undefined
        ? null
        : parsed.data.expectedUsers,
  });

  revalidatePath("/app/module-requests");
  revalidatePath("/app/platform/requests");
  redirect("/app/module-requests?submitted=1");
}

export async function addModuleRequestMessage(formData: FormData): Promise<void> {
  const tenant = await requireCurrentTenant();
  requireRequestPermission(tenant);
  const parsed = parseWithSchema(messageSchema, {
    requestId: String(formData.get("requestId") ?? "").trim(),
    note: String(formData.get("note") ?? "").trim(),
  });
  if (!parsed.success) redirect("/app/module-requests?error=invalid-message");

  await addRequesterMessage({
    requestId: parsed.data.requestId,
    organizationId: tenant.organizationId,
    authorId: tenant.userId,
    note: parsed.data.note,
  });

  revalidatePath("/app/module-requests");
  revalidatePath("/app/platform/requests");
  redirect("/app/module-requests?message=1");
}
