import "server-only";

import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { logAuditEvent } from "@/lib/audit";

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
  notes?: string | null;
  actorId: string;
}) {
  if (!Number.isInteger(input.durationMonths) || input.durationMonths < 1 || input.durationMonths > 120) {
    throw new Error("Subscription duration must be between 1 and 120 months.");
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
      metadata: { moduleId: input.moduleId, mode: input.mode, durationMonths: input.durationMonths },
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
    if (!current || !["DRAFT", "PENDING_PAYMENT", "PAST_DUE"].includes(current.status)) {
      throw new Error("Subscription is not awaiting activation.");
    }
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
        activatedById: input.actorId,
      },
    });
    await tx.organizationModule.upsert({
      where: { organizationId_moduleId: { organizationId: current.organizationId, moduleId: current.moduleId } },
      update: { enabled: true, enabledAt: startsAt },
      create: { organizationId: current.organizationId, moduleId: current.moduleId, enabled: true, enabledAt: startsAt },
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
      userId: input.actorId,
      module: "platform",
      action: "subscription.activated",
      entityName: "Subscription",
      entityId: current.id,
      metadata: { paymentReference: input.paymentReference, paymentMethod: input.paymentMethod, endsAt: endsAt.toISOString() },
    }, tx);
    return subscription;
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
