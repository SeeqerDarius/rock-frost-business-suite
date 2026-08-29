"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireCurrentTenant } from "@/lib/tenant";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { retryOperationalPaymentReconciliation, initiateSettlementProfile, confirmSettlementBeneficiary, runSettlementReadinessCheck } from "@/lib/payments/operational";
import { loadBankOptions } from "./bank-options";

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

/** Step 2 of the guided activation wizard: collect + verify the settlement account. */
export async function submitSettlementAccount(formData: FormData): Promise<void> {
  const tenant = await requireCurrentTenant();
  if (!hasPermission(tenant, PERMISSIONS.ORG_SETTINGS_MANAGE)) redirect("/app/dashboard");
  const bankCode = String(formData.get("bankCode") ?? "").trim();
  const accountNumber = String(formData.get("accountNumber") ?? "").trim();
  if (!bankCode || !accountNumber) redirect("/app/organization/payments?step=account&error=settlement");
  // The bank's display name is never trusted from the client - it's re-derived server-side from
  // the same live Paystack bank list the picker was built from, so a forged bankCode that doesn't
  // match a real bank is rejected outright rather than silently accepted with a fabricated name.
  const bank = (await loadBankOptions()).find((option) => option.code === bankCode);
  if (!bank) redirect("/app/organization/payments?step=account&error=settlement");
  try {
    await initiateSettlementProfile({ organizationId: tenant.organizationId, actorId: tenant.userId, bankCode: bank.code, bankName: bank.name, accountNumber });
  } catch (error) {
    console.error("[payments] Settlement account setup failed", error);
    redirect("/app/organization/payments?step=account&error=settlement");
  }
  revalidatePath("/app/organization/payments");
  redirect("/app/organization/payments?step=terms&saved=account");
}

/** Step 3: accept settlement terms and confirm the account belongs to the organization or an authorized beneficiary. */
export async function confirmBeneficiaryTerms(formData: FormData): Promise<void> {
  const tenant = await requireCurrentTenant();
  if (!hasPermission(tenant, PERMISSIONS.ORG_SETTINGS_MANAGE)) redirect("/app/dashboard");
  if (formData.get("acceptTerms") !== "on") redirect("/app/organization/payments?step=terms&error=terms");
  try {
    await confirmSettlementBeneficiary(tenant.organizationId, tenant.userId);
  } catch (error) {
    console.error("[payments] Beneficiary confirmation failed", error);
    redirect("/app/organization/payments?step=terms&error=terms");
  }
  revalidatePath("/app/organization/payments");
  redirect("/app/organization/payments?step=readiness&saved=terms");
}

/** Step 4: run the real (committing) readiness check and, only on a full pass, apply the requested enablement. */
export async function activateOnlineCollections(formData: FormData): Promise<void> {
  const tenant = await requireCurrentTenant();
  if (!hasPermission(tenant, PERMISSIONS.ORG_SETTINGS_MANAGE)) redirect("/app/dashboard");
  const enabled = formData.get("enabled") === "on";
  let report;
  try {
    report = await runSettlementReadinessCheck(tenant.organizationId, { actorId: tenant.userId, enabledModuleKeys: tenant.enabledModuleKeys, enableIfReady: enabled, commit: true });
  } catch (error) {
    console.error("[payments] Activation failed", error);
    redirect("/app/organization/payments?step=readiness&error=not-ready");
  }
  // Deliberately outside the try/catch above - redirect() throws internally, and catching that
  // throw here would misreport a clean "not ready" result as a failed activation attempt.
  if (report.overall !== "READY") redirect("/app/organization/payments?step=readiness&error=not-ready");
  revalidatePath("/app/organization/payments");
  redirect("/app/organization/payments?step=readiness&saved=activated");
}
