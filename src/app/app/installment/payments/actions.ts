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
  deletePayment,
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
import { postModuleRevenue, postModuleRevenueRefund, reverseAllModuleRevenueForSource } from "@/lib/accounting-integration";

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

    await postModuleRevenue(tenant.organizationId, {
      sourceModule: "installment",
      sourceType: "INSTALLMENT_PAYMENT",
      sourceId: payment.id,
      postingPurpose: "COLLECTED",
      amount: payment.amount.toString(),
      entryDate: payment.paymentDate,
      description: `Installment payment received: receipt ${payment.receiptNo}`,
      createdById: session?.user?.id ?? null,
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
    const { payment, amountDelta } = await updatePayment(tenant.organizationId, scope, id, {
      amount: parsed.data.amount,
      paymentDate: parsed.data.paymentDate,
      method: parsed.data.method,
      notes: parsed.data.notes ?? null,
    });
    // The originally-posted "COLLECTED" entry is never itself edited or
    // reversed here — only corrected with its own distinct entry, keyed
    // uniquely per edit via the pre-edit updatedAt timestamp so repeated
    // edits within the edit window each get their own correction rather
    // than colliding on postSourceJournalEntry's source-identity uniqueness.
    if (amountDelta && Number(amountDelta) !== 0) {
      const session = await getServerAuthSession();
      const adjustmentInput = {
        sourceModule: "installment" as const,
        sourceType: "INSTALLMENT_PAYMENT",
        sourceId: payment.id,
        postingPurpose: `ADJUSTED_${payment.updatedAt.getTime()}`,
        entryDate: parsed.data.paymentDate,
        createdById: session?.user?.id ?? null,
      };
      if (Number(amountDelta) > 0) {
        await postModuleRevenue(tenant.organizationId, {
          ...adjustmentInput,
          amount: amountDelta,
          description: `Installment payment receipt ${payment.receiptNo} amount corrected upward`,
        });
      } else {
        await postModuleRevenueRefund(tenant.organizationId, {
          ...adjustmentInput,
          amount: Math.abs(Number(amountDelta)).toFixed(2),
          description: `Installment payment receipt ${payment.receiptNo} amount corrected downward`,
        });
      }
    }
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

export async function removePayment(formData: FormData): Promise<void> {
  const tenant = await requireModuleAccess("installment");
  if (!hasPermission(tenant, PERMISSIONS.HIREPURCHASE_PAYMENTS_MANAGE)) {
    redirect("/app/installment/payments?error=forbidden");
  }
  const scope = await resolveInstallmentAccessScope(tenant);
  const id = clean(formData.get("id"));
  const password = clean(formData.get("confirmPassword"));
  const session = await getServerAuthSession();
  if (!id) redirect("/app/installment/payments?error=missing-fields");
  if (!session?.user?.id || !password || !(await verifyCurrentPassword(session.user.id, password))) {
    redirect("/app/installment/payments?error=wrong-password");
  }
  try {
    const payment = await deletePayment(tenant.organizationId, scope, id);
    await logAuditEvent({
      organizationId: tenant.organizationId, userId: session.user.id, module: "installment",
      action: "installment.payment.deleted", entityName: "HirePurchasePayment", entityId: id,
      metadata: { receiptNo: payment.receiptNo, accountId: payment.accountId, amount: payment.amount.toString() },
    });
    // Reverses the original "COLLECTED" post and any amount-correction
    // entries from editPayment() together, since deleting the payment
    // undoes all revenue it ever contributed, not just the original post.
    await reverseAllModuleRevenueForSource(tenant.organizationId, { sourceType: "INSTALLMENT_PAYMENT", sourceId: id, reason: `Installment payment deleted: receipt ${payment.receiptNo}`, actorId: session.user.id });
  } catch (error) {
    if (error instanceof PaymentCreditLockedError) redirect("/app/installment/payments?error=credit-locked");
    if (error instanceof NotFoundError) redirect("/app/installment/payments?error=not-found");
    throw error;
  }
  revalidatePath("/app/installment/payments");
  revalidatePath("/app/installment/accounts");
  revalidatePath("/app/installment/reports");
  redirect("/app/installment/payments?saved=1");
}
