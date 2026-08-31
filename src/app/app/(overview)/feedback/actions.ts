"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireCurrentTenant } from "@/lib/tenant";
import { cuid, longText, parseWithSchema, shortText } from "@/lib/validation";
import { FeedbackRateLimitError, submitCustomerFeedback, withdrawCustomerFeedback } from "@/lib/customer-feedback";
import { logAuditEvent } from "@/lib/audit";
import { isPlatformOperator } from "@/lib/auth/permissions";

const submissionSchema = z.object({
  category: z.enum(["TESTIMONIAL", "SUGGESTION", "PROBLEM", "GENERAL"]),
  rating: z.coerce.number().int().min(1).max(5),
  title: shortText,
  message: longText,
  jobTitle: shortText.optional(),
});

export async function submitFeedbackAction(formData: FormData): Promise<void> {
  const tenant = await requireCurrentTenant();
  if (isPlatformOperator(tenant)) redirect("/app/platform/feedback");
  const parsed = parseWithSchema(submissionSchema, {
    category: String(formData.get("category") ?? ""),
    rating: String(formData.get("rating") ?? ""),
    title: String(formData.get("title") ?? ""),
    message: String(formData.get("message") ?? ""),
    jobTitle: String(formData.get("jobTitle") ?? "").trim() || undefined,
  });
  if (!parsed.success) redirect("/app/feedback?error=invalid");
  const consentToPublish = parsed.data.category === "TESTIMONIAL" && formData.get("consentToPublish") === "on";
  try {
    const feedback = await submitCustomerFeedback({
      organizationId: tenant.organizationId,
      userId: tenant.userId,
      ...parsed.data,
      consentToPublish,
      consentDisplayName: consentToPublish && formData.get("consentDisplayName") === "on",
      consentDisplayOrganization: consentToPublish && formData.get("consentDisplayOrganization") === "on",
      consentDisplayLogo: consentToPublish && formData.get("consentDisplayLogo") === "on",
    });
    await logAuditEvent({ organizationId: tenant.organizationId, userId: tenant.userId, module: "platform", action: "feedback.submitted", entityName: "CustomerFeedback", entityId: feedback.id, metadata: { category: feedback.category, publishable: feedback.consentToPublish } });
  } catch (error) {
    if (error instanceof FeedbackRateLimitError) redirect("/app/feedback?error=rate-limit");
    redirect("/app/feedback?error=failed");
  }
  revalidatePath("/app/feedback");
  revalidatePath("/app/platform/feedback");
  redirect("/app/feedback?submitted=1");
}

export async function withdrawFeedbackAction(formData: FormData): Promise<void> {
  const tenant = await requireCurrentTenant();
  if (isPlatformOperator(tenant)) redirect("/app/platform/feedback");
  const parsed = cuid.safeParse(String(formData.get("feedbackId") ?? ""));
  if (!parsed.success) redirect("/app/feedback?error=invalid");
  await withdrawCustomerFeedback(tenant.organizationId, tenant.userId, parsed.data);
  await logAuditEvent({ organizationId: tenant.organizationId, userId: tenant.userId, module: "platform", action: "feedback.withdrawn", entityName: "CustomerFeedback", entityId: parsed.data });
  revalidatePath("/app/feedback");
  revalidatePath("/app/platform/feedback");
  revalidatePath("/");
  redirect("/app/feedback?withdrawn=1");
}
