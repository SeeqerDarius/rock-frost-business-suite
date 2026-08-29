"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireCurrentTenant } from "@/lib/tenant";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { retryOperationalPaymentReconciliation } from "@/lib/payments/operational";

export async function retrySettlementReconciliation(formData: FormData): Promise<void> {
  const tenant = await requireCurrentTenant();
  if (!hasPermission(tenant, PERMISSIONS.ORG_SETTINGS_MANAGE)) redirect("/app/dashboard");
  const paymentId = String(formData.get("paymentId") ?? "");
  if (!paymentId) redirect("/app/organization/payments?error=retry-failed");
  try {
    await retryOperationalPaymentReconciliation(tenant.organizationId, paymentId, tenant.userId);
  } catch (error) {
    console.error("[payments] Reconciliation retry failed", error);
    redirect("/app/organization/payments?error=retry-failed");
  }
  revalidatePath("/app/organization/payments");
  redirect("/app/organization/payments?saved=retried");
}
