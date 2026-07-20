"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireCurrentTenant } from "@/lib/tenant";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getServerAuthSession } from "@/lib/auth/session";
import { createReview, completeReview, ReviewStateError } from "@/modules/hr/service";

function clean(value: FormDataEntryValue | null) {
  const str = String(value ?? "").trim();
  return str.length > 0 ? str : null;
}

export async function createNewReview(formData: FormData): Promise<void> {
  const tenant = await requireCurrentTenant();
  if (!hasPermission(tenant, PERMISSIONS.HR_REVIEWS_MANAGE)) {
    redirect("/app/hr/reviews?error=forbidden");
  }

  const employeeId = clean(formData.get("employeeId"));
  const reviewPeriodStartRaw = clean(formData.get("reviewPeriodStart"));
  const reviewPeriodEndRaw = clean(formData.get("reviewPeriodEnd"));
  if (!employeeId || !reviewPeriodStartRaw || !reviewPeriodEndRaw) {
    redirect("/app/hr/reviews?error=missing-fields");
  }

  const ratingRaw = clean(formData.get("rating"));
  const session = await getServerAuthSession();

  await createReview(tenant.organizationId, {
    employeeId,
    reviewPeriodStart: new Date(`${reviewPeriodStartRaw}T00:00:00`),
    reviewPeriodEnd: new Date(`${reviewPeriodEndRaw}T00:00:00`),
    rating: ratingRaw ? Number.parseInt(ratingRaw, 10) : null,
    summary: clean(formData.get("summary")),
    reviewedById: session?.user?.id ?? null,
  });

  revalidatePath("/app/hr/reviews");
  redirect("/app/hr/reviews?saved=1");
}

export async function completeExistingReview(formData: FormData): Promise<void> {
  const tenant = await requireCurrentTenant();
  if (!hasPermission(tenant, PERMISSIONS.HR_REVIEWS_MANAGE)) {
    redirect("/app/hr/reviews?error=forbidden");
  }
  const id = clean(formData.get("id"));
  if (!id) return;

  try {
    await completeReview(tenant.organizationId, id);
  } catch (error) {
    if (error instanceof ReviewStateError) redirect("/app/hr/reviews?error=incomplete");
    throw error;
  }

  revalidatePath("/app/hr/reviews");
  redirect("/app/hr/reviews?saved=1");
}
