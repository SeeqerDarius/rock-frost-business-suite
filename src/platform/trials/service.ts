import "server-only";

import { db } from "@/lib/db";
import { logAuditEvent } from "@/lib/audit";
import { getPlatformAnchorOrganizationIds } from "@/lib/platform-organizations";

export const TRIAL_DURATION_DAYS = 14;
const DAY_MS = 86_400_000;

export function getTrialEndsAt(createdAt: Date): Date {
  return new Date(createdAt.getTime() + TRIAL_DURATION_DAYS * DAY_MS);
}

export function getTrialDaysRemaining(createdAt: Date, now = new Date()): number {
  return Math.max(0, Math.ceil((getTrialEndsAt(createdAt).getTime() - now.getTime()) / DAY_MS));
}

/**
 * Suspends customer workspaces that remain on an unpaid trial after the
 * configured window. Each organization is claimed with a guarded update
 * inside its own transaction so overlapping cron invocations are idempotent.
 */
export async function expireTrials(now = new Date()): Promise<{
  cutoff: Date;
  candidates: number;
  expired: number;
}> {
  const cutoff = new Date(now.getTime() - TRIAL_DURATION_DAYS * DAY_MS);
  const platformAnchorIds = await getPlatformAnchorOrganizationIds();
  const candidates = await db.organization.findMany({
    where: {
      status: "TRIAL",
      createdAt: { lte: cutoff },
      ...(platformAnchorIds.length ? { id: { notIn: platformAnchorIds } } : {}),
      subscriptions: {
        none: {
          status: "ACTIVE",
          startsAt: { lte: now },
          OR: [{ endsAt: null }, { endsAt: { gt: now } }],
        },
      },
    },
    select: {
      id: true,
      name: true,
      members: {
        where: { status: "ACTIVE" },
        select: { userId: true },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  let expired = 0;
  for (const organization of candidates) {
    const changed = await db.$transaction(async (tx) => {
      const claimed = await tx.organization.updateMany({
        where: {
          id: organization.id,
          status: "TRIAL",
          createdAt: { lte: cutoff },
          subscriptions: {
            none: {
              status: "ACTIVE",
              startsAt: { lte: now },
              OR: [{ endsAt: null }, { endsAt: { gt: now } }],
            },
          },
        },
        data: { status: "SUSPENDED" },
      });
      if (claimed.count === 0) return false;

      await tx.organizationModule.updateMany({
        where: { organizationId: organization.id, enabled: true },
        data: { enabled: false },
      });
      if (organization.members.length) {
        await tx.notification.createMany({
          data: organization.members.map(({ userId }) => ({
            organizationId: organization.id,
            userId,
            type: "TRIAL_EXPIRED",
            title: "Trial period ended",
            message: "Your 14-day trial has ended. Contact Rock Frost to activate a subscription and restore module access.",
            status: "QUEUED" as const,
            metadata: { expiredAt: now.toISOString(), trialDurationDays: TRIAL_DURATION_DAYS },
          })),
        });
      }
      await logAuditEvent({
        organizationId: organization.id,
        module: "platform",
        action: "organization.trial_expired",
        entityName: "Organization",
        entityId: organization.id,
        metadata: {
          organizationName: organization.name,
          expiredAt: now.toISOString(),
          trialDurationDays: TRIAL_DURATION_DAYS,
        },
      }, tx);
      return true;
    });
    if (changed) expired += 1;
  }

  return { cutoff, candidates: candidates.length, expired };
}
