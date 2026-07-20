"use server";

import { redirect } from "next/navigation";
import { requireCurrentTenant } from "@/lib/tenant";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getServerAuthSession } from "@/lib/auth/session";
import {
  recordPayment,
  updatePayment,
  markCreditRefunded,
  voidCredit,
  PaymentBlockedError,
  PaymentEditWindowError,
  PaymentCreditLockedError,
} from "@/modules/installment/service";

function clean(value: FormDataEntryValue | null) {
  const str = String(value ?? "").trim();
  return str.length > 0 ? str : null;
}

export async function createPayment(formData: FormData): Promise<void> {
  const tenant = await requireCurrentTenant();
  if (!hasPermission(tenant, PERMISSIONS.HIREPURCHASE_PAYMENTS_MANAGE)) {
    redirect("/app/installment/payments?error=forbidden");
  }

  const accountId = clean(formData.get("accountId"));
  const amount = clean(formData.get("amount"));
  const paymentDateRaw = clean(formData.get("paymentDate"));
  const method = clean(formData.get("method"));

  if (!accountId || !amount || !paymentDateRaw || !method) {
    redirect("/app/installment/payments?error=missing-fields");
  }

  const paymentDate = new Date(`${paymentDateRaw}T00:00:00`);
  if (paymentDate > new Date()) {
    redirect("/app/installment/payments?error=future-date");
  }

  const session = await getServerAuthSession();

  try {
    await recordPayment(tenant.organizationId, {
      accountId,
      amount,
      paymentDate,
      method,
      notes: clean(formData.get("notes")),
      receivedBy: session?.user?.name ?? session?.user?.email ?? null,
    });
  } catch (error) {
    if (error instanceof PaymentBlockedError) {
      redirect("/app/installment/payments?error=blocked");
    }
    throw error;
  }

  redirect("/app/installment/payments?saved=1");
}

export async function editPayment(formData: FormData): Promise<void> {
  const tenant = await requireCurrentTenant();
  if (!hasPermission(tenant, PERMISSIONS.HIREPURCHASE_PAYMENTS_MANAGE)) {
    redirect("/app/installment/payments?error=forbidden");
  }

  const id = clean(formData.get("id"));
  const amount = clean(formData.get("amount"));
  const paymentDateRaw = clean(formData.get("paymentDate"));
  const method = clean(formData.get("method"));

  if (!id || !amount || !paymentDateRaw || !method) {
    redirect("/app/installment/payments?error=missing-fields");
  }

  try {
    await updatePayment(tenant.organizationId, id, {
      amount,
      paymentDate: new Date(`${paymentDateRaw}T00:00:00`),
      method,
      notes: clean(formData.get("notes")),
    });
  } catch (error) {
    if (error instanceof PaymentEditWindowError) {
      redirect("/app/installment/payments?error=edit-window");
    }
    if (error instanceof PaymentCreditLockedError) {
      redirect("/app/installment/payments?error=credit-locked");
    }
    throw error;
  }

  redirect("/app/installment/payments?saved=1");
}

export async function resolveCredit(formData: FormData): Promise<void> {
  const tenant = await requireCurrentTenant();
  if (!hasPermission(tenant, PERMISSIONS.HIREPURCHASE_CREDITS_MANAGE)) {
    redirect("/app/installment/payments?error=forbidden");
  }

  const id = clean(formData.get("id"));
  const decision = clean(formData.get("decision"));
  if (!id) return;

  const session = await getServerAuthSession();
  const resolvedBy = session?.user?.name ?? session?.user?.email ?? "unknown";

  if (decision === "void") {
    await voidCredit(tenant.organizationId, id, resolvedBy);
  } else {
    await markCreditRefunded(tenant.organizationId, id, resolvedBy);
  }

  redirect("/app/installment/payments?saved=1");
}
