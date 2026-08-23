import "server-only";

import { randomBytes } from "node:crypto";
import { Prisma, type Subscription } from "@prisma/client";
import { db } from "@/lib/db";
import { logAuditEvent } from "@/lib/audit";
import { initializeTransaction, type GatewayProvider } from "@/lib/payments";
import { createPlan as createPaystackPlan, disableSubscription as disablePaystackSubscription, getSubscriptionManagementLink } from "@/lib/payments/paystack";
import { ensureRevenueAccountsForOrg } from "@/lib/accounting-integration";
import { MODULE_PRICE_BY_KEY, PRICING_BUNDLE_BY_KEY, type PricingBundleKey } from "@/lib/pricing";
import { getModule, type BusinessModuleKey } from "@/platform/modules/registry";
import { expandProductModuleKeys, productGroupKeys } from "@/platform/modules/product-groups";

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

async function subscriptionModuleIds(tx: Tx, subscription: Pick<SubscriptionRow, "moduleId" | "entitledModuleKeys">) {
  const entitlementKeys = subscription.entitledModuleKeys ?? [];
  if (!entitlementKeys.length) return [subscription.moduleId];
  return (await tx.module.findMany({
    where: { code: { in: entitlementKeys } },
    select: { id: true },
  })).map((entry) => entry.id);
}

export class SelfServiceSubscriptionExistsError extends Error {}

export async function createSelfServiceSubscription(input: {
  organizationId: string;
  moduleKey: BusinessModuleKey;
  billingCycle: "MONTHLY" | "ANNUAL";
  autoRenew: boolean;
  actorId: string;
}) {
  const price = MODULE_PRICE_BY_KEY.get(input.moduleKey);
  const definition = getModule(input.moduleKey);
  if (!price || !definition || definition.catalogueVisible === false) {
    throw new Error("This module is not available for self-service purchase.");
  }

  const durationMonths = input.billingCycle === "ANNUAL" ? 12 : 1;
  const amount = input.billingCycle === "ANNUAL" ? price.annualGhs : price.monthlyGhs;

  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`self-service-subscription:${input.organizationId}:${input.moduleKey}`}))`;
    const modules = await tx.module.findMany({
      where: { code: { in: [...productGroupKeys(input.moduleKey)] }, status: "ACTIVE" },
      select: { id: true, code: true },
    });
    const primaryModule = modules.find((module_) => module_.code === input.moduleKey);
    if (!primaryModule) throw new Error("The selected module is not available.");

    const existing = await tx.subscription.findFirst({
      where: {
        organizationId: input.organizationId,
        status: { notIn: ["CANCELLED", "EXPIRED"] },
        OR: [
          { moduleId: { in: modules.map((module_) => module_.id) } },
          { entitledModuleKeys: { hasSome: modules.map((module_) => module_.code) } },
        ],
      },
      select: { id: true },
    });
    if (existing) {
      throw new SelfServiceSubscriptionExistsError("This product already has an active or pending subscription.");
    }

    const subscription = await tx.subscription.create({
      data: {
        organizationId: input.organizationId,
        moduleId: primaryModule.id,
        mode: "PLATFORM_MANAGED",
        durationMonths,
        amount: new Prisma.Decimal(amount),
        currency: "GHS",
        autoRenew: input.autoRenew,
        seatLimit: price.includedSeats,
        notes: "Self-service catalogue checkout",
        createdById: input.actorId,
        status: "PENDING_PAYMENT",
      },
    });
    await logAuditEvent({
      organizationId: input.organizationId,
      userId: input.actorId,
      module: "platform",
      action: "subscription.self_service_created",
      entityName: "Subscription",
      entityId: subscription.id,
      metadata: { moduleKey: input.moduleKey, billingCycle: input.billingCycle, amount, currency: "GHS", seatLimit: price.includedSeats },
    }, tx);
    return subscription;
  });
}

export async function createSelfServiceBundleSubscription(input: {
  organizationId: string;
  bundleKey: PricingBundleKey;
  billingCycle: "MONTHLY" | "ANNUAL";
  autoRenew: boolean;
  actorId: string;
}) {
  const bundle = PRICING_BUNDLE_BY_KEY.get(input.bundleKey);
  if (!bundle) throw new Error("This suite is not available for self-service purchase.");
  const durationMonths = input.billingCycle === "ANNUAL" ? 12 : 1;
  const amount = input.billingCycle === "ANNUAL" ? bundle.monthlyGhs * 10 : bundle.monthlyGhs;
  const entitledModuleKeys = [...new Set(bundle.moduleKeys.flatMap((key) => [...productGroupKeys(key)]))];

  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`self-service-bundle:${input.organizationId}`}))`;
    const modules = await tx.module.findMany({
      where: { code: { in: entitledModuleKeys }, status: "ACTIVE" },
      select: { id: true, code: true },
    });
    if (modules.length !== entitledModuleKeys.length) throw new Error("One or more suite modules are unavailable.");
    const existing = await tx.subscription.findFirst({
      where: {
        organizationId: input.organizationId,
        status: { notIn: ["CANCELLED", "EXPIRED"] },
        OR: [
          { moduleId: { in: modules.map((entry) => entry.id) } },
          { entitledModuleKeys: { hasSome: entitledModuleKeys } },
        ],
      },
      select: { id: true },
    });
    if (existing) throw new SelfServiceSubscriptionExistsError("A product in this suite already has an active or pending subscription.");
    const primaryModule = modules.find((entry) => entry.code === bundle.moduleKeys[0]);
    if (!primaryModule) throw new Error("The suite's primary module is unavailable.");
    const includedSeats = Math.max(...bundle.moduleKeys.map((key) => MODULE_PRICE_BY_KEY.get(key as BusinessModuleKey)?.includedSeats ?? 1));
    const subscription = await tx.subscription.create({
      data: {
        organizationId: input.organizationId,
        moduleId: primaryModule.id,
        mode: "PLATFORM_MANAGED",
        durationMonths,
        amount: new Prisma.Decimal(amount),
        currency: "GHS",
        autoRenew: input.autoRenew,
        seatLimit: includedSeats,
        bundleKey: bundle.key,
        entitledModuleKeys,
        notes: `Self-service suite checkout: ${bundle.name}`,
        createdById: input.actorId,
        status: "PENDING_PAYMENT",
      },
    });
    await logAuditEvent({
      organizationId: input.organizationId,
      userId: input.actorId,
      module: "platform",
      action: "subscription.self_service_bundle_created",
      entityName: "Subscription",
      entityId: subscription.id,
      metadata: { bundleKey: bundle.key, billingCycle: input.billingCycle, amount, entitledModuleKeys },
    }, tx);
    return subscription;
  });
}

/**
 * A self-service "cart" checkout: an ad-hoc set of modules the tenant picked
 * themselves (unlike createSelfServiceBundleSubscription's fixed, discounted
 * PRICING_BUNDLES catalogue), priced as the plain sum of each selected
 * module's own price and paid for in one Paystack checkout instead of one
 * per module. Reuses the exact same entitledModuleKeys mechanism a real
 * bundle uses — activation, notifications, and renewal all already key off
 * entitledModuleKeys generically (see subscriptionModuleIds below) and don't
 * care whether bundleKey is set, so no other code needed to change for this
 * to activate correctly.
 */
export async function createSelfServiceCartSubscription(input: {
  organizationId: string;
  moduleKeys: BusinessModuleKey[];
  billingCycle: "MONTHLY" | "ANNUAL";
  autoRenew: boolean;
  actorId: string;
}) {
  const uniqueKeys = [...new Set(input.moduleKeys)];
  if (!uniqueKeys.length) throw new Error("Select at least one product.");
  for (const key of uniqueKeys) {
    const price = MODULE_PRICE_BY_KEY.get(key);
    const definition = getModule(key);
    if (!price || !definition || definition.catalogueVisible === false) {
      throw new Error("One or more selected products are not available for self-service purchase.");
    }
  }

  const durationMonths = input.billingCycle === "ANNUAL" ? 12 : 1;
  // Priced on the plain sum of each selected module's own price — an ad-hoc
  // cart is not a curated PRICING_BUNDLES discount, so no bundle rate applies.
  const amount = uniqueKeys.reduce((sum, key) => {
    const price = MODULE_PRICE_BY_KEY.get(key)!;
    return sum + (input.billingCycle === "ANNUAL" ? price.annualGhs : price.monthlyGhs);
  }, 0);
  const entitledModuleKeys = expandProductModuleKeys(uniqueKeys);
  const includedSeats = Math.max(...uniqueKeys.map((key) => MODULE_PRICE_BY_KEY.get(key)!.includedSeats));

  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`self-service-cart:${input.organizationId}`}))`;
    const modules = await tx.module.findMany({
      where: { code: { in: entitledModuleKeys }, status: "ACTIVE" },
      select: { id: true, code: true },
    });
    if (modules.length !== entitledModuleKeys.length) throw new Error("One or more selected products are unavailable.");
    const existing = await tx.subscription.findFirst({
      where: {
        organizationId: input.organizationId,
        status: { notIn: ["CANCELLED", "EXPIRED"] },
        OR: [
          { moduleId: { in: modules.map((entry) => entry.id) } },
          { entitledModuleKeys: { hasSome: entitledModuleKeys } },
        ],
      },
      select: { id: true },
    });
    if (existing) throw new SelfServiceSubscriptionExistsError("One or more selected products already have an active or pending subscription.");
    const primaryModule = modules.find((entry) => entry.code === uniqueKeys[0]);
    if (!primaryModule) throw new Error("The selected primary product is unavailable.");
    const subscription = await tx.subscription.create({
      data: {
        organizationId: input.organizationId,
        moduleId: primaryModule.id,
        mode: "PLATFORM_MANAGED",
        durationMonths,
        amount: new Prisma.Decimal(amount),
        currency: "GHS",
        autoRenew: input.autoRenew,
        seatLimit: includedSeats,
        entitledModuleKeys,
        notes: `Self-service cart checkout: ${uniqueKeys.join(", ")}`,
        createdById: input.actorId,
        status: "PENDING_PAYMENT",
      },
    });
    await logAuditEvent({
      organizationId: input.organizationId,
      userId: input.actorId,
      module: "platform",
      action: "subscription.self_service_cart_created",
      entityName: "Subscription",
      entityId: subscription.id,
      metadata: { moduleKeys: uniqueKeys, billingCycle: input.billingCycle, amount, entitledModuleKeys },
    }, tx);
    return subscription;
  });
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
  if ((current.entitledModuleKeys ?? []).length) {
    const entitledModules = await tx.module.findMany({
      where: { code: { in: current.entitledModuleKeys ?? [] }, status: "ACTIVE" },
      select: { id: true },
    });
    for (const module_ of entitledModules) {
      await tx.organizationModule.upsert({
        where: { organizationId_moduleId: { organizationId: current.organizationId, moduleId: module_.id } },
        update: { enabled: true, enabledAt: startsAt },
        create: { organizationId: current.organizationId, moduleId: module_.id, enabled: true, enabledAt: startsAt },
      });
    }
  }
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
      title: `${current.bundleKey ? "Suite" : "Module"} subscription activated`,
      message: `Your ${current.bundleKey ? "suite" : "module"} access is active until ${endsAt.toLocaleDateString()}.`,
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
  }, { timeout: 20_000 });
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
  }, { timeout: 20_000 });
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
      where: { organizationId: current.organizationId, moduleId: { in: await subscriptionModuleIds(tx, current) } },
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
      where: { organizationId: current.organizationId, moduleId: { in: await subscriptionModuleIds(tx, current) } },
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
    const moduleIds = await subscriptionModuleIds(tx, current);
    const moduleCodes = (await tx.module.findMany({ where: { id: { in: moduleIds } }, select: { code: true } })).map((entry) => entry.code);
    const activeReplacement = await tx.subscription.findFirst({
      where: {
        organizationId: current.organizationId,
        status: "ACTIVE",
        id: { not: current.id },
        endsAt: { gt: new Date() },
        OR: [{ moduleId: { in: moduleIds } }, { entitledModuleKeys: { hasSome: moduleCodes } }],
      },
    });
    if (!activeReplacement) {
      await tx.organizationModule.updateMany({
        where: { organizationId: current.organizationId, moduleId: { in: moduleIds } },
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
