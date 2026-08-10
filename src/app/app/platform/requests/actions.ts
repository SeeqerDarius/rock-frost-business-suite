"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireCurrentTenant } from "@/lib/tenant";
import { isPlatformOperator } from "@/lib/auth/permissions";
import { cuid, longText, parseWithSchema, shortText } from "@/lib/validation";
import { createModuleRequest, updateModuleRequest } from "@/platform/module-requests/service";

const updateSchema = z.object({
  requestId: cuid,
  assignedToId: z.union([cuid, z.literal("")]),
  status: z.enum([
    "SUBMITTED", "UNDER_REVIEW", "NEEDS_INFORMATION", "QUOTED", "APPROVED",
    "REJECTED", "IMPLEMENTING", "READY", "COMPLETED", "CANCELLED",
  ]),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]),
  note: longText.optional(),
  decisionReason: longText.optional(),
  externalReference: shortText.optional(),
});

const convertSchema = z.object({
  contactSubmissionId: cuid,
  organizationId: cuid,
  moduleId: z.union([cuid, z.literal("")]),
  type: z.enum([
    "DEMO", "ENABLE_EXISTING", "CUSTOMIZE_EXISTING", "CUSTOM_MODULE", "INTEGRATION", "DATA_MIGRATION",
  ]),
});

async function requireOperator() {
  const tenant = await requireCurrentTenant();
  if (!isPlatformOperator(tenant)) redirect("/app/dashboard");
  return tenant;
}

export async function manageModuleRequest(formData: FormData): Promise<void> {
  const tenant = await requireOperator();
  const parsed = parseWithSchema(updateSchema, {
    requestId: String(formData.get("requestId") ?? "").trim(),
    assignedToId: String(formData.get("assignedToId") ?? "").trim(),
    status: String(formData.get("status") ?? "").trim(),
    priority: String(formData.get("priority") ?? "").trim(),
    note: String(formData.get("note") ?? "").trim() || undefined,
    decisionReason: String(formData.get("decisionReason") ?? "").trim() || undefined,
    externalReference: String(formData.get("externalReference") ?? "").trim() || undefined,
  });
  if (!parsed.success) redirect("/app/platform/requests?error=invalid");

  try {
    const enableModule = formData.get("enableModule") === "true";
    // The reject confirmation button posts a dedicated flag rather than
    // reusing `name="status"`, which would collide with the form's own
    // status <select> — FormData.get() returns only the first same-named
    // value (the select's), silently dropping the button's intent.
    const rejectRequest = formData.get("rejectRequest") === "true";
    await updateModuleRequest({
      requestId: parsed.data.requestId,
      actorId: tenant.userId,
      assignedToId: parsed.data.assignedToId || null,
      status: enableModule ? "COMPLETED" : rejectRequest ? "REJECTED" : parsed.data.status,
      priority: parsed.data.priority,
      note: parsed.data.note || null,
      isInternal: formData.get("isInternal") === "true",
      decisionReason: parsed.data.decisionReason || null,
      externalReference: parsed.data.externalReference || null,
      enableModule,
    });
  } catch {
    redirect("/app/platform/requests?error=update-failed");
  }

  revalidatePath("/app/platform/requests");
  revalidatePath("/app/platform/organizations");
  revalidatePath("/app/modules");
  revalidatePath("/app/dashboard");
  revalidatePath("/app/module-requests");
  revalidatePath("/app/notifications");
  redirect("/app/platform/requests?updated=1");
}

export async function convertContactSubmission(formData: FormData): Promise<void> {
  const tenant = await requireOperator();
  const parsed = parseWithSchema(convertSchema, {
    contactSubmissionId: String(formData.get("contactSubmissionId") ?? "").trim(),
    organizationId: String(formData.get("organizationId") ?? "").trim(),
    moduleId: String(formData.get("moduleId") ?? "").trim(),
    type: String(formData.get("type") ?? "").trim(),
  });
  if (!parsed.success) redirect("/app/platform/requests?error=invalid-conversion");

  const [submission, membership] = await Promise.all([
    db.contactSubmission.findFirst({ where: { id: parsed.data.contactSubmissionId, status: "NEW" } }),
    db.organizationMember.findFirst({
      where: { organizationId: parsed.data.organizationId, status: "ACTIVE" },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  if (!submission || !membership) redirect("/app/platform/requests?error=conversion-failed");

  const needsExistingModule =
    parsed.data.type === "DEMO" || parsed.data.type === "ENABLE_EXISTING" || parsed.data.type === "CUSTOMIZE_EXISTING";
  if (needsExistingModule && !parsed.data.moduleId) redirect("/app/platform/requests?error=module-required");

  await createModuleRequest({
    organizationId: parsed.data.organizationId,
    requestedById: membership.userId,
    contactSubmissionId: submission.id,
    moduleId: parsed.data.moduleId || null,
    type: parsed.data.type,
    title: `${submission.reason.replaceAll("-", " ")} — ${submission.company}`,
    businessJustification: submission.message || `Request submitted by ${submission.name} (${submission.email}).`,
  });
  await db.contactSubmission.update({
    where: { id: submission.id },
    data: { assignedToId: tenant.userId },
  });

  revalidatePath("/app/platform/requests");
  revalidatePath("/app/module-requests");
  redirect("/app/platform/requests?converted=1");
}

export async function resolveContactSubmission(formData: FormData): Promise<void> {
  await requireOperator();
  const parsed = cuid.safeParse(String(formData.get("contactSubmissionId") ?? "").trim());
  if (!parsed.success) return;
  const status = formData.get("status") === "SPAM" ? "SPAM" : "RESOLVED";
  await db.contactSubmission.update({
    where: { id: parsed.data },
    data: { status, resolvedAt: new Date() },
  });
  revalidatePath("/app/platform/requests");
}
