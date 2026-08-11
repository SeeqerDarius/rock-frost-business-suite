import "server-only";

import { randomBytes } from "node:crypto";
import { Prisma, type Subscription } from "@prisma/client";
import { db } from "@/lib/db";
import { logAuditEvent } from "@/lib/audit";
import { initializeTransaction, type GatewayProvider } from "@/lib/payments";

const AWAITING_ACTIVATION_STATUSES = ["DRAFT", "PENDING_PAYMENT", "PAST_DUE"] as const;

type Tx = Prisma.TransactionClient;
type SubscriptionRow = Subscription;

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
  const endsAt = new Date(startsAt);
  endsAt.setUTCMonth(endsAt.getUTCMonth() + current.durationMonths);

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
  const result = await initializeTransaction(input.provider, {
    reference,
    amount: current.amount.toFixed(2),
    currency: current.currency,
    customerEmail: payer.email,
    callbackUrl: input.callbackUrl,
    metadata: { subscriptionId: current.id, organizationId: current.organizationId },
  });

  const stamped = await db.subscription.updateMany({
    where: { id: current.id, status: current.status },
    data: { paymentReference: result.reference, gatewayProvider: input.provider },
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
    const current = await tx.subscription.findFirst({
      where: { paymentReference: input.reference, gatewayProvider: input.provider },
    });
    if (!current) throw new Error("Subscription not found for this payment reference.");
    if (current.status === "ACTIVE") return current;
    if (!AWAITING_ACTIVATION_STATUSES.includes(current.status as (typeof AWAITING_ACTIVATION_STATUSES)[number])) {
      throw new Error("Subscription is not awaiting activation.");
    }

    if (input.verifiedAmount !== current.amount.toFixed(2) || input.verifiedCurrency !== current.currency) {
      throw new Error("Verified payment amount/currency does not match the subscription.");
    }

    return finalizeActivation(tx, current, {
      paymentReference: input.reference,
      paymentMethod: input.provider,
      activatedById: null,
    });
  });
}

export async function cancelSubscription(input: { subscriptionId: string; actorId: string }) {
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
