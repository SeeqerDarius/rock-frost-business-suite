import "server-only";

import { randomBytes } from "node:crypto";
import { Prisma, type Subscription } from "@prisma/client";
import { db } from "@/lib/db";
import { logAuditEvent } from "@/lib/audit";
import { initializeTransaction, type GatewayProvider } from "@/lib/payments";
import { createPlan as createPaystackPlan, disableSubscription as disablePaystackSubscription, getSubscriptionManagementLink } from "@/lib/payments/paystack";
import { ensureRevenueAccountsForOrg } from "@/lib/accounting-integration";

const AWAITING_ACTIVATION_STATUSES = ["DRAFT", "PENDING_PAYMENT", "PAST_DUE"] as const;

type Tx = Prisma.TransactionClient;
type SubscriptionRow = Subscription;

const PAYSTACK_INTERVAL_BY_MONTHS = {
  1: "monthly",
  3: "quarterly",
  6: "biannually",
  12: "annually",
} as const;

function addSubscriptionTerm(from: Date, durationMonths: number) {
  const end = new Date(from);
  end.setUTCMonth(end.getUTCMonth() + durationMonths);
  return end;
}

/**
 * The shared "payment confirmed, grant access" tail shared by the manual
 * (operator-entered reference) and gateway-driven (Paystack/Flutterwave
 * webhook or callback) activation paths — enabling the module, completing
 * the linked request, notifying the org, and auditing must stay identical
 * regardless of how the payment was confirmed.
 */
async function finalizeActivation(
  tx: Tx,
  current: SubscriptionRow,
  input: { paymentReference: string; paymentMethod: string; activatedById: string | null; startsAt?: Date },
) {
  const startsAt = input.startsAt ?? new Date();
  const endsAt = addSubscriptionTerm(startsAt, current.durationMonths);

  const subscription = await tx.subscription.update({
    where: { id: current.id },
    data: {
      status: "ACTIVE",
      startsAt,
      endsAt,
      paidAt: new Date(),
      paymentReference: input.paymentReference,
      paymentMethod: input.paymentMethod,
      activatedById: input.activatedById,
    },
  });
  await tx.organizationModule.upsert({
    where: { organizationId_moduleId: { organizationId: current.organizationId, moduleId: current.moduleId } },
    update: { enabled: true, enabledAt: startsAt },
    create: { organizationId: current.organizationId, moduleId: current.moduleId, enabled: true, enabledAt: startsAt },
  });
  // Eagerly provisions any newly-active revenue-generating module's Accounting
  // ledger account (or, if Accounting itself is what just activated, backfills
  // every already-active revenue module's account in one call) — see
  // src/lib/accounting-integration.ts.
  await ensureRevenueAccountsForOrg(tx, current.organizationId);
  await tx.organization.update({
    where: { id: current.organizationId },
    data: { status: "ACTIVE" },
  });
  if (current.moduleRequestId) {
    await tx.moduleRequest.update({
      where: { id: current.moduleRequestId },
      data: { status: "COMPLETED", approvedAt: new Date(), completedAt: new Date() },
    });
  }
  await tx.notification.createMany({
    data: (await tx.organizationMember.findMany({
      where: { organizationId: current.organizationId, status: "ACTIVE" },
      select: { userId: true },
    })).map(({ userId }) => ({
      organizationId: current.organizationId,
      userId,
      type: "SUBSCRIPTION_ACTIVATED",
      title: "Module subscription activated",
      message: `Your module access is active until ${endsAt.toLocaleDateString()}.`,
      status: "QUEUED" as const,
      metadata: { subscriptionId: current.id, moduleId: current.moduleId, endsAt: endsAt.toISOString() },
    })),
  });
  await logAuditEvent({
    organizationId: current.organizationId,
    userId: input.activatedById,
    module: "platform",
    action: "subscription.activated",
    entityName: "Subscription",
    entityId: current.id,
    metadata: { paymentReference: input.paymentReference, paymentMethod: input.paymentMethod, endsAt: endsAt.toISOString() },
  }, tx);
  return subscription;
}

export async function createSubscription(input: {
  organizationId: string;
  moduleId: string;
  moduleRequestId?: string | null;
  contactSubmissionId?: string | null;
  mode: "MANUAL_OFFLINE" | "PLATFORM_MANAGED";
  durationMonths: number;
  amount: string;
  currency: string;
  autoRenew: boolean;
  seatLimit: number | null;
  notes?: string | null;
  actorId: string;
}) {
  if (!Number.isInteger(input.durationMonths) || input.durationMonths < 1 || input.durationMonths > 120) {
    throw new Error("Subscription duration must be between 1 and 120 months.");
  }
  if (input.seatLimit != null && (!Number.isInteger(input.seatLimit) || input.seatLimit < 1 || input.seatLimit > 100_000)) {
    throw new Error("Seat limit must be between 1 and 100,000.");
  }
  const amount = new Prisma.Decimal(input.amount);
  if (amount.isNegative()) throw new Error("Subscription amount cannot be negative.");

  const [organization, module_] = await Promise.all([
    db.organization.findUnique({ where: { id: input.organizationId }, select: { id: true } }),
    db.module.findFirst({ where: { id: input.moduleId, status: "ACTIVE" }, select: { id: true } }),
  ]);
  if (!organization || !module_) throw new Error("Organization or module not found.");
  if (input.moduleRequestId) {
    const request = await db.moduleRequest.findFirst({
      where: {
        id: input.moduleRequestId,
        organizationId: input.organizationId,
        OR: [{ moduleId: input.moduleId }, { moduleId: null }],
      },
      select: { id: true, contactSubmissionId: true },
    });
    if (!request) throw new Error("The linked request does not belong to this organization/module.");
    if (input.contactSubmissionId && request.contactSubmissionId !== input.contactSubmissionId) {
      throw new Error("The linked enquiry does not belong to the selected request.");
    }
  } else if (input.contactSubmissionId) {
    const submission = await db.contactSubmission.findFirst({
      where: {
        id: input.contactSubmissionId,
        organizationId: input.organizationId,
        OR: [{ moduleId: input.moduleId }, { moduleId: null }],
      },
      select: { id: true },
    });
    if (!submission) throw new Error("The linked enquiry does not belong to this organization/module.");
  }

  return db.$transaction(async (tx) => {
    const subscription = await tx.subscription.create({
      data: {
        organizationId: input.organizationId,
        moduleId: input.moduleId,
        moduleRequestId: input.moduleRequestId || null,
        contactSubmissionId: input.contactSubmissionId || null,
        mode: input.mode,
        durationMonths: input.durationMonths,
        amount,
        currency: input.currency.toUpperCase(),
        autoRenew: input.autoRenew,
        seatLimit: input.seatLimit,
        notes: input.notes || null,
        createdById: input.actorId,
        status: "PENDING_PAYMENT",
      },
    });
    await logAuditEvent({
      organizationId: input.organizationId,
      userId: input.actorId,
      module: "platform",
      action: "subscription.created",
      entityName: "Subscription",
      entityId: subscription.id,
      metadata: { moduleId: input.moduleId, mode: input.mode, durationMonths: input.durationMonths, seatLimit: input.seatLimit },
    }, tx);
    return subscription;
  });
}

export async function activateSubscription(input: {
  subscriptionId: string;
  actorId: string;
  paymentReference: string;
  paymentMethod: string;
  startsAt?: Date;
}) {
  return db.$transaction(async (tx) => {
    const current = await tx.subscription.findUnique({ where: { id: input.subscriptionId } });
    if (!current || !AWAITING_ACTIVATION_STATUSES.includes(current.status as (typeof AWAITING_ACTIVATION_STATUSES)[number])) {
      throw new Error("Subscription is not awaiting activation.");
    }
    return finalizeActivation(tx, current, {
      paymentReference: input.paymentReference,
      paymentMethod: input.paymentMethod,
      activatedById: input.actorId,
      startsAt: input.startsAt,
    });
  });
}

/**
 * Starts a real online checkout for a PLATFORM_MANAGED subscription — called
 * from the org's own billing page (never the platform operator surface).
 * Stamps the subscription with our generated reference + chosen gateway
 * *before* redirecting, so the webhook/callback below can find it again;
 * status stays PENDING_PAYMENT until the gateway actually confirms payment.
 */
export async function initiateGatewayPayment(input: {
  subscriptionId: string;
  organizationId: string;
  provider: GatewayProvider;
  payerUserId: string;
  callbackUrl: string;
}): Promise<{ checkoutUrl: string }> {
  const current = await db.subscription.findFirst({
    where: { id: input.subscriptionId, organizationId: input.organizationId },
  });
  if (!current) throw new Error("Subscription not found.");
  if (current.mode !== "PLATFORM_MANAGED") {
    throw new Error("Only platform-managed subscriptions can be paid online.");
  }
  if (!AWAITING_ACTIVATION_STATUSES.includes(current.status as (typeof AWAITING_ACTIVATION_STATUSES)[number])) {
    throw new Error("Subscription is not awaiting payment.");
  }

  const payer = await db.user.findUnique({ where: { id: input.payerUserId }, select: { email: true } });
  if (!payer?.email) throw new Error("Payer email not found.");

  const reference = `sub_${current.id}_${randomBytes(6).toString("hex")}`;
  let paystackPlanCode = current.paystackPlanCode;
  if (input.provider === "PAYSTACK" && current.autoRenew) {
    const interval = PAYSTACK_INTERVAL_BY_MONTHS[current.durationMonths as keyof typeof PAYSTACK_INTERVAL_BY_MONTHS];
    if (!interval) throw new Error("Automatic Paystack renewal supports 1, 3, 6, or 12-month billing terms.");
    paystackPlanCode ??= await createPaystackPlan({
      name: `Rock Frost ${current.id}`,
      amount: current.amount.toFixed(2),
      currency: current.currency,
      interval,
    });
  }
  const result = await initializeTransaction(input.provider, {
    reference,
    amount: current.amount.toFixed(2),
    currency: current.currency,
    customerEmail: payer.email,
    callbackUrl: input.callbackUrl,
    planCode: input.provider === "PAYSTACK" ? paystackPlanCode ?? undefined : undefined,
    metadata: { subscriptionId: current.id, organizationId: current.organizationId },
  });

  const stamped = await db.subscription.updateMany({
    where: { id: current.id, status: current.status },
    data: { paymentReference: result.reference, gatewayProvider: input.provider, paystackPlanCode },
  });
  if (stamped.count === 0) throw new Error("Subscription status changed before payment could be initiated.");

  await logAuditEvent({
    organizationId: current.organizationId,
    userId: input.payerUserId,
    module: "platform",
    action: "subscription.payment_initiated",
    entityName: "Subscription",
    entityId: current.id,
    metadata: { provider: input.provider, reference: result.reference },
  });

  return { checkoutUrl: result.checkoutUrl };
}

/**
 * Confirms and activates a subscription once a gateway has verified the
 * payment server-to-server. Called from both the webhook route (the
 * authoritative path) and the browser-return callback page (a fast-UX
 * accelerant) — both converge here, so this must be idempotent: a
 * subscription already ACTIVE is returned as-is rather than re-processed or
 * rejected, since the two callers can race for the same payment.
 */
export async function activateSubscriptionFromGateway(input: {
  reference: string;
  provider: GatewayProvider;
  verifiedAmount: string;
  verifiedCurrency: string;
}) {
  return db.$transaction(async (tx) => {
    let current = await tx.subscription.findFirst({
      where: { paymentReference: input.reference, gatewayProvider: input.provider },
    });
    if (!current) throw new Error("Subscription not found for this payment reference.");
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`subscription-payment:${current.id}`}))`;
    current = await tx.subscription.findUniqueOrThrow({ where: { id: current.id } });
    const existingPayment = await tx.subscriptionPayment.findUnique({
      where: { gatewayProvider_paymentReference: { gatewayProvider: input.provider, paymentReference: input.reference } },
    });
    if (existingPayment && current.status === "ACTIVE") return current;
    if (!AWAITING_ACTIVATION_STATUSES.includes(current.status as (typeof AWAITING_ACTIVATION_STATUSES)[number])) {
      if (current.status !== "ACTIVE") throw new Error("Subscription is not awaiting activation.");
    }

    if (input.verifiedAmount !== current.amount.toFixed(2) || input.verifiedCurrency !== current.currency) {
      throw new Error("Verified payment amount/currency does not match the subscription.");
    }

    const subscription = current.status === "ACTIVE" ? current : await finalizeActivation(tx, current, {
      paymentReference: input.reference,
      paymentMethod: input.provider,
      activatedById: null,
    });
    await tx.subscriptionPayment.upsert({
      where: { gatewayProvider_paymentReference: { gatewayProvider: input.provider, paymentReference: input.reference } },
      update: {},
      create: {
        organizationId: current.organizationId,
        subscriptionId: current.id,
        gatewayProvider: input.provider,
        paymentReference: input.reference,
        status: "SUCCESS",
        amount: input.verifiedAmount,
        currency: input.verifiedCurrency,
        paidAt: new Date(),
      },
    });
    return subscription;
  });
}

export async function registerPaystackSubscription(input: {
  planCode: string;
  subscriptionCode: string;
  emailToken?: string | null;
  customerCode?: string | null;
  nextPaymentAt?: Date | null;
  status?: string | null;
}) {
  const result = await db.subscription.updateMany({
    where: { paystackPlanCode: input.planCode, gatewayProvider: "PAYSTACK" },
    data: {
      paystackSubscriptionCode: input.subscriptionCode,
      paystackEmailToken: input.emailToken ?? null,
      paystackCustomerCode: input.customerCode ?? null,
      paystackNextPaymentAt: input.nextPaymentAt ?? null,
      paystackSubscriptionStatus: input.status ?? "active",
    },
  });
  if (result.count !== 1) {
    throw new Error("No unique Paystack subscription matched the recurring plan code.");
  }
  return result;
}

export async function processPaystackRenewal(input: {
  subscriptionCode: string;
  reference: string;
  amount: string;
  currency: string;
  paidAt?: Date | null;
  nextPaymentAt?: Date | null;
}) {
  return db.$transaction(async (tx) => {
    let current = await tx.subscription.findUnique({ where: { paystackSubscriptionCode: input.subscriptionCode } });
    if (!current) throw new Error("Subscription not found for Paystack subscription code.");
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`subscription-renewal:${current.id}`}))`;
    current = await tx.subscription.findUniqueOrThrow({ where: { id: current.id } });
    const existing = await tx.subscriptionPayment.findUnique({
      where: { gatewayProvider_paymentReference: { gatewayProvider: "PAYSTACK", paymentReference: input.reference } },
    });
    if (existing) return current;
    if (!current.autoRenew) throw new Error("Automatic renewal is disabled for this subscription.");
    if (input.amount !== current.amount.toFixed(2) || input.currency !== current.currency) {
      throw new Error("Verified renewal amount/currency does not match the subscription.");
    }
    const paidAt = input.paidAt ?? new Date();
    const renewalBase = current.endsAt && current.endsAt > paidAt ? current.endsAt : paidAt;
    const endsAt = addSubscriptionTerm(renewalBase, current.durationMonths);
    const updated = await tx.subscription.update({
      where: { id: current.id },
      data: {
        status: "ACTIVE",
        startsAt: current.startsAt ?? paidAt,
        endsAt,
        paidAt,
        lastRenewalAt: paidAt,
        paymentReference: input.reference,
        paymentMethod: "PAYSTACK",
        paystackNextPaymentAt: input.nextPaymentAt ?? null,
        paystackSubscriptionStatus: "active",
        lastPaymentFailureAt: null,
        renewalFailureCount: 0,
      },
    });
    await tx.subscriptionPayment.create({
      data: {
        organizationId: current.organizationId,
        subscriptionId: current.id,
        gatewayProvider: "PAYSTACK",
        paymentReference: input.reference,
        status: "SUCCESS",
        amount: input.amount,
        currency: input.currency,
        paidAt,
      },
    });
    await tx.organizationModule.updateMany({
      where: { organizationId: current.organizationId, moduleId: current.moduleId },
      data: { enabled: true, enabledAt: paidAt },
    });
    await logAuditEvent({
      organizationId: current.organizationId,
      module: "platform",
      action: "subscription.renewed",
      entityName: "Subscription",
      entityId: current.id,
      metadata: { provider: "PAYSTACK", reference: input.reference, endsAt: endsAt.toISOString() },
    }, tx);
    return updated;
  });
}

export async function recordPaystackRenewalFailure(input: {
  subscriptionCode: string;
  reference: string;
  invoiceCode?: string | null;
  amount: string;
  currency: string;
  reason?: string | null;
}) {
  return db.$transaction(async (tx) => {
    const current = await tx.subscription.findUnique({ where: { paystackSubscriptionCode: input.subscriptionCode } });
    if (!current) throw new Error("Subscription not found for Paystack subscription code.");
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`subscription-renewal:${current.id}`}))`;
    const existing = await tx.subscriptionPayment.findUnique({
      where: { gatewayProvider_paymentReference: { gatewayProvider: "PAYSTACK", paymentReference: input.reference } },
    });
    if (existing) return current;
    await tx.subscriptionPayment.upsert({
      where: { gatewayProvider_paymentReference: { gatewayProvider: "PAYSTACK", paymentReference: input.reference } },
      update: {},
      create: {
        organizationId: current.organizationId,
        subscriptionId: current.id,
        gatewayProvider: "PAYSTACK",
        paymentReference: input.reference,
        invoiceCode: input.invoiceCode ?? null,
        status: "FAILED",
        amount: input.amount,
        currency: input.currency,
        failureReason: input.reason ?? "Paystack renewal payment failed",
      },
    });
    const updated = await tx.subscription.update({
      where: { id: current.id },
      data: {
        status: "PAST_DUE",
        paystackSubscriptionStatus: "attention",
        lastPaymentFailureAt: new Date(),
        renewalFailureCount: { increment: 1 },
      },
    });
    await tx.organizationModule.updateMany({
      where: { organizationId: current.organizationId, moduleId: current.moduleId },
      data: { enabled: false },
    });
    await tx.notification.createMany({
      data: (await tx.organizationMember.findMany({
        where: { organizationId: current.organizationId, status: "ACTIVE" },
        select: { userId: true },
      })).map(({ userId }) => ({
        organizationId: current.organizationId,
        userId,
        type: "SUBSCRIPTION_RENEWAL_FAILED",
        title: "Subscription renewal payment failed",
        message: "Module access is paused until payment is completed or the Paystack payment card is updated.",
        status: "QUEUED" as const,
        metadata: { subscriptionId: current.id, moduleId: current.moduleId, provider: "PAYSTACK" },
      })),
    });
    await logAuditEvent({
      organizationId: current.organizationId,
      module: "platform",
      action: "subscription.renewal_failed",
      entityName: "Subscription",
      entityId: current.id,
      status: "FAILURE",
      metadata: { provider: "PAYSTACK", reference: input.reference, invoiceCode: input.invoiceCode ?? null },
    }, tx);
    return updated;
  });
}

export async function updatePaystackSubscriptionState(input: { subscriptionCode: string; status: string; nextPaymentAt?: Date | null }) {
  return db.subscription.update({
    where: { paystackSubscriptionCode: input.subscriptionCode },
    data: {
      paystackSubscriptionStatus: input.status,
      paystackNextPaymentAt: input.nextPaymentAt ?? null,
      ...(input.status === "non-renewing" || input.status === "complete" || input.status === "cancelled" ? { autoRenew: false } : {}),
    },
  });
}

export async function getPaystackManagementLinkForOrganization(subscriptionId: string, organizationId: string) {
  const subscription = await db.subscription.findFirst({
    where: { id: subscriptionId, organizationId, gatewayProvider: "PAYSTACK", autoRenew: true },
    select: { paystackSubscriptionCode: true },
  });
  if (!subscription?.paystackSubscriptionCode) throw new Error("Paystack recurring subscription is not active yet.");
  return getSubscriptionManagementLink(subscription.paystackSubscriptionCode);
}

export async function cancelPaystackAutomaticRenewal(subscriptionId: string, organizationId: string, actorId: string) {
  const current = await db.subscription.findFirst({ where: { id: subscriptionId, organizationId, gatewayProvider: "PAYSTACK" } });
  if (!current?.paystackSubscriptionCode || !current.paystackEmailToken) throw new Error("Paystack recurring subscription is not active yet.");
  await disablePaystackSubscription(current.paystackSubscriptionCode, current.paystackEmailToken);
  const updated = await db.subscription.update({
    where: { id: current.id },
    data: { autoRenew: false, paystackSubscriptionStatus: "non-renewing" },
  });
  await logAuditEvent({
    organizationId,
    userId: actorId,
    module: "platform",
    action: "subscription.auto_renew_cancelled",
    entityName: "Subscription",
    entityId: current.id,
    metadata: { provider: "PAYSTACK" },
  });
  return updated;
}

export async function cancelSubscription(input: { subscriptionId: string; actorId: string }) {
  const gatewaySubscription = await db.subscription.findUnique({ where: { id: input.subscriptionId } });
  if (!gatewaySubscription) throw new Error("Subscription not found.");
  if (gatewaySubscription.autoRenew && gatewaySubscription.gatewayProvider === "PAYSTACK") {
    if (!gatewaySubscription.paystackSubscriptionCode || !gatewaySubscription.paystackEmailToken) {
      throw new Error("Paystack automatic renewal is not fully registered. Cancel it from Paystack before cancelling local access.");
    }
    await disablePaystackSubscription(gatewaySubscription.paystackSubscriptionCode, gatewaySubscription.paystackEmailToken);
  }
  return db.$transaction(async (tx) => {
    const current = await tx.subscription.findUnique({ where: { id: input.subscriptionId } });
    if (!current) throw new Error("Subscription not found.");
    const subscription = await tx.subscription.update({ where: { id: current.id }, data: { status: "CANCELLED", autoRenew: false } });
    const activeReplacement = await tx.subscription.findFirst({
      where: { organizationId: current.organizationId, moduleId: current.moduleId, status: "ACTIVE", id: { not: current.id }, endsAt: { gt: new Date() } },
    });
    if (!activeReplacement) {
      await tx.organizationModule.updateMany({
        where: { organizationId: current.organizationId, moduleId: current.moduleId },
        data: { enabled: false },
      });
    }
    await logAuditEvent({
      organizationId: current.organizationId,
      userId: input.actorId,
      module: "platform",
      action: "subscription.cancelled",
      entityName: "Subscription",
      entityId: current.id,
    }, tx);
    return subscription;
  });
}
