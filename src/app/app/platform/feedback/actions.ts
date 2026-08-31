"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireCurrentTenant } from "@/lib/tenant";
import { isPlatformOperator } from "@/lib/auth/permissions";
import { cuid, longText, parseWithSchema } from "@/lib/validation";
import { moderateCustomerFeedback } from "@/lib/customer-feedback";
import { db } from "@/lib/db";
import { logAuditEvent } from "@/lib/audit";

const schema = z.object({
  feedbackId: cuid,
  status: z.enum(["SUBMITTED", "UNDER_REVIEW", "APPROVED", "PUBLISHED", "REJECTED", "HIDDEN"]),
  publishedMessage: longText.optional(),
  moderationNote: longText.optional(),
  publicationOrder: z.coerce.number().int().min(0).max(9999),
});

export async function moderateFeedbackAction(formData: FormData): Promise<void> {
  const tenant = await requireCurrentTenant();
  if (!isPlatformOperator(tenant)) redirect("/app/dashboard");
  const parsed = parseWithSchema(schema, {
    feedbackId: String(formData.get("feedbackId") ?? ""),
    status: String(formData.get("status") ?? ""),
    publishedMessage: String(formData.get("publishedMessage") ?? "").trim() || undefined,
    moderationNote: String(formData.get("moderationNote") ?? "").trim() || undefined,
    publicationOrder: String(formData.get("publicationOrder") ?? "0"),
  });
  if (!parsed.success) redirect("/app/platform/feedback?error=invalid");
  const existing = await db.customerFeedback.findUnique({ where: { id: parsed.data.feedbackId }, select: { organizationId: true } });
  if (!existing) redirect("/app/platform/feedback?error=missing");
  try {
    await moderateCustomerFeedback({
      ...parsed.data,
      actorId: tenant.userId,
      displayPerson: formData.get("displayPerson") === "on",
      displayOrganization: formData.get("displayOrganization") === "on",
      displayLogo: formData.get("displayLogo") === "on",
    });
    await logAuditEvent({ organizationId: existing.organizationId, userId: tenant.userId, module: "platform", action: "feedback.moderated", entityName: "CustomerFeedback", entityId: parsed.data.feedbackId, metadata: { status: parsed.data.status } });
  } catch {
    redirect("/app/platform/feedback?error=publication");
  }
  revalidatePath("/app/platform/feedback");
  revalidatePath("/app/feedback");
  revalidatePath("/");
  redirect("/app/platform/feedback?updated=1");
}
