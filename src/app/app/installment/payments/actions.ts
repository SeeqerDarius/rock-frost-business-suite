"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { resolveInstallmentAccessScope } from "@/modules/installment/access";
import { getServerAuthSession } from "@/lib/auth/session";
import { verifyCurrentPassword } from "@/lib/auth/verify-password";
import {
  recordPayment,
  updatePayment,
  markCreditRefunded,
  voidCredit,
  applyCreditToAccount,
  PaymentBlockedError,
  PaymentEditWindowError,
  PaymentCreditLockedError,
  CreditNotApplicableError,
  InvalidPaymentAmountError,
  NotFoundError,
} from "@/modules/installment/service";
import { moneyAmount, shortText, longText, dateInput, parseWithSchema } from "@/lib/validation";
import { z } from "zod";
import { logAuditEvent } from "@/lib/audit";

function clean(value: FormDataEntryValue | null) {
  const str = String(value ?? "").trim();
  return str.length > 0 ? str : null;
}

const paymentSchema = z.object({
  accountId: shortText,
  amount: moneyAmount,
  paymentDate: dateInput,
  method: shortText,
  notes: longText.optional(),
});

export async function createPayment(formData: FormData): Promise<void> {
  const tenant = await requireModuleAccess("installment");
  if (!hasPermission(tenant, PERMISSIONS.HIREPURCHASE_PAYMENTS_MANAGE)) {
    redirect("/app/installment/payments?error=forbidden");
  }
  const scope = await resolveInstallmentAccessScope(tenant);
  if (scope.kind === "denied") {
    redirect("/app/installment/payments?error=staff-unlinked");
  }

  const accountId = clean(formData.get("accountId"));
  const amount = clean(formData.get("amount"));
  const paymentDateRaw = clean(formData.get("paymentDate"));
  const method = clean(formData.get("method"));

  if (!accountId || !amount || !paymentDateRaw || !method) {
    redirect("/app/installment/payments?error=missing-fields");
  }

  const parsed = parseWithSchema(paymentSchema, {
    accountId,
    amount,
    paymentDate: paymentDateRaw,
    method,
    notes: clean(formData.get("notes")) ?? undefined,
  });
  if (!parsed.success) {
    redirect("/app/installment/payments?error=invalid-input");
  }

  if (parsed.data.paymentDate > new Date()) {
    redirect("/app/installment/payments?error=future-date");
  }

  const session = await getServerAuthSession();

  try {
    const payment = await recordPayment(tenant.organizationId, scope, {
      accountId: parsed.data.accountId,
      amount: parsed.data.amount,
      paymentDate: parsed.data.paymentDate,
      method: parsed.data.method,
      notes: parsed.data.notes ?? null,
      receivedBy: session?.user?.name ?? session?.user?.email ?? null,
    });
    await logAuditEvent({
      organizationId: tenant.organizationId,
      userId: session?.user?.id,
      module: "installment",
      action: "installment.payment",
      entityName: "HirePurchaseAccount",
      entityId: payment.accountId,
      metadata: { amount: payment.amount.toString(), receiptNo: payment.receiptNo },
    });
  } catch (error) {
    if (error instanceof PaymentBlockedError) {
      await logAuditEvent({
        organizationId: tenant.organizationId,
        userId: session?.user?.id,
        module: "installment",
        action: "installment.payment",
        entityName: "HirePurchaseAccount",
        entityId: parsed.data.accountId,
        status: "FAILURE",
      });
      redirect("/app/installment/payments?error=blocked");
    }
    if (error instanceof InvalidPaymentAmountError) {
      await logAuditEvent({
        organizationId: tenant.organizationId,
        userId: session?.user?.id,
        module: "installment",
        action: "installment.payment",
        entityName: "HirePurchaseAccount",
        entityId: parsed.data.accountId,
        status: "FAILURE",
      });
      redirect("/app/installment/payments?error=invalid-amount");
    }
    if (error instanceof NotFoundError) redirect("/app/installment/payments?error=not-found");
    throw error;
  }

  revalidatePath("/app/installment/payments");
  redirect("/app/installment/payments?saved=1");
}

export async function editPayment(formData: FormData): Promise<void> {
  const tenant = await requireModuleAccess("installment");
  if (!hasPermission(tenant, PERMISSIONS.HIREPURCHASE_PAYMENTS_MANAGE)) {
    redirect("/app/installment/payments?error=forbidden");
  }
  const scope = await resolveInstallmentAccessScope(tenant);
  if (scope.kind === "denied") {
    redirect("/app/installment/payments?error=staff-unlinked");
  }

  const id = clean(formData.get("id"));
  const amount = clean(formData.get("amount"));
  const paymentDateRaw = clean(formData.get("paymentDate"));
  const method = clean(formData.get("method"));

  if (!id || !amount || !paymentDateRaw || !method) {
    redirect("/app/installment/payments?error=missing-fields");
  }

  const parsed = parseWithSchema(paymentSchema.omit({ accountId: true }), {
    amount,
    paymentDate: paymentDateRaw,
    method,
    notes: clean(formData.get("notes")) ?? undefined,
  });
  if (!parsed.success) {
    redirect("/app/installment/payments?error=invalid-input");
  }

  try {
    await updatePayment(tenant.organizationId, scope, id, {
      amount: parsed.data.amount,
      paymentDate: parsed.data.paymentDate,
      method: parsed.data.method,
      notes: parsed.data.notes ?? null,
    });
  } catch (error) {
    if (error instanceof PaymentEditWindowError) {
      redirect("/app/installment/payments?error=edit-window");
    }
    if (error instanceof PaymentCreditLockedError) {
      redirect("/app/installment/payments?error=credit-locked");
    }
    if (error instanceof NotFoundError) redirect("/app/installment/payments?error=not-found");
    throw error;
  }

  revalidatePath("/app/installment/payments");
  redirect("/app/installment/payments?saved=1");
}

export async function resolveCredit(formData: FormData): Promise<void> {
  const tenant = await requireModuleAccess("installment");
  if (!hasPermission(tenant, PERMISSIONS.HIREPURCHASE_CREDITS_MANAGE)) {
    redirect("/app/installment/payments?error=forbidden");
  }
  const scope = await resolveInstallmentAccessScope(tenant);
  if (scope.kind === "denied") {
    redirect("/app/installment/payments?error=staff-unlinked");
  }

  const id = clean(formData.get("id"));
  const decision = clean(formData.get("decision"));
  const confirmPassword = clean(formData.get("confirmPassword"));
  if (!id) return;

  const session = await getServerAuthSession();
  if (!session?.user?.id || !confirmPassword || !(await verifyCurrentPassword(session.user.id, confirmPassword))) {
    redirect("/app/installment/payments?error=wrong-password");
  }

  const resolvedBy = session.user.name ?? session.user.email ?? "unknown";

  try {
    if (decision === "void") {
      await voidCredit(tenant.organizationId, scope, id, resolvedBy);
      await logAuditEvent({
        organizationId: tenant.organizationId,
        userId: session.user.id,
        module: "installment",
        action: "installment.credit.voided",
        entityName: "HirePurchaseCredit",
        entityId: id,
      });
    } else {
      await markCreditRefunded(tenant.organizationId, scope, id, resolvedBy);
      await logAuditEvent({
        organizationId: tenant.organizationId,
        userId: session.user.id,
        module: "installment",
        action: "installment.credit.refunded",
        entityName: "HirePurchaseCredit",
        entityId: id,
      });
    }
  } catch (error) {
    if (error instanceof NotFoundError) redirect("/app/installment/payments?error=not-found");
    throw error;
  }

  revalidatePath("/app/installment/payments");
  redirect("/app/installment/payments?saved=1");
}

export async function applyCredit(formData: FormData): Promise<void> {
  const tenant = await requireModuleAccess("installment");
  if (!hasPermission(tenant, PERMISSIONS.HIREPURCHASE_CREDITS_MANAGE)) {
    redirect("/app/installment/payments?error=forbidden");
  }
  const scope = await resolveInstallmentAccessScope(tenant);
  if (scope.kind === "denied") {
    redirect("/app/installment/payments?error=staff-unlinked");
  }

  const creditId = clean(formData.get("creditId"));
  const targetAccountId = clean(formData.get("targetAccountId"));
  if (!creditId || !targetAccountId) {
    redirect("/app/installment/payments?error=missing-fields");
  }

  const session = await getServerAuthSession();

  try {
    await applyCreditToAccount(tenant.organizationId, scope, creditId, targetAccountId);
    await logAuditEvent({
      organizationId: tenant.organizationId,
      userId: session?.user?.id,
      module: "installment",
      action: "installment.credit",
      entityName: "HirePurchaseCredit",
      entityId: creditId,
      metadata: { targetAccountId },
    });
  } catch (error) {
    if (error instanceof CreditNotApplicableError) {
      redirect("/app/installment/payments?error=credit-not-applicable");
    }
    if (error instanceof NotFoundError) redirect("/app/installment/payments?error=not-found");
    throw error;
  }

  revalidatePath("/app/installment/payments");
  redirect("/app/installment/payments?saved=1");
}
