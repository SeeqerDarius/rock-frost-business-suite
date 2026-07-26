"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireCurrentTenant } from "@/lib/tenant";
import { isPlatformOperator } from "@/lib/auth/permissions";
import type { Prisma } from "@prisma/client";

export async function updatePlatformSettings(formData: FormData): Promise<void> {
  const tenant = await requireCurrentTenant();
  if (!isPlatformOperator(tenant)) redirect("/app/dashboard");
  const days = Number(formData.get("organizationDeletionRecoveryDays"));
  if (!Number.isInteger(days) || days < 1 || days > 365) redirect("/app/platform/settings?error=invalid");
  const organization = await db.organization.findUnique({
    where: { id: tenant.organizationId },
    select: { metadata: true },
  });
  const metadata = organization?.metadata && typeof organization.metadata === "object" && !Array.isArray(organization.metadata)
    ? { ...(organization.metadata as Record<string, unknown>) }
    : {};
  metadata.organizationDeletionRecoveryDays = days;
  await db.organization.update({
    where: { id: tenant.organizationId },
    data: { metadata: metadata as Prisma.InputJsonValue },
  });
  revalidatePath("/app/platform/settings");
  redirect("/app/platform/settings?saved=1");
}
