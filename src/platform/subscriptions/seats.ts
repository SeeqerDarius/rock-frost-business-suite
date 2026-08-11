import "server-only";

import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getModule } from "@/platform/modules/registry";
import { logAuditEvent } from "@/lib/audit";

type DbClient = typeof db | Prisma.TransactionClient;
const COUNTED_MEMBER_STATUSES = ["ACTIVE", "INVITED"] as const;

export type ModuleSeatUsage = {
  moduleId: string;
  moduleCode: string;
  moduleName: string;
  used: number;
  limit: number | null;
};

export class SeatLimitExceededError extends Error {
  constructor(public modules: ModuleSeatUsage[]) {
    super(`No seats remain for ${modules.map((module) => module.moduleName).join(", ")}.`);
  }
}

function permissionPrefix(moduleCode: string) {
  return getModule(moduleCode)?.permissionPrefix ?? `${moduleCode}.`;
}

async function countModuleMembers(client: DbClient, organizationId: string, moduleCode: string, excludeMembershipId?: string) {
  return client.organizationMember.count({
    where: {
      organizationId,
      status: { in: [...COUNTED_MEMBER_STATUSES] },
      id: excludeMembershipId ? { not: excludeMembershipId } : undefined,
      role: { rolePermissions: { some: { permission: { key: { startsWith: permissionPrefix(moduleCode) } } } } },
    },
  });
}

async function currentSeatSubscriptions(client: DbClient, organizationId: string) {
  const now = new Date();
  return client.subscription.findMany({
    where: { organizationId, status: "ACTIVE", startsAt: { lte: now }, endsAt: { gt: now } },
    include: { module: true },
  });
}

export async function getOrganizationSeatUsage(organizationId: string, client: DbClient = db, excludeMembershipId?: string): Promise<ModuleSeatUsage[]> {
  const subscriptions = await currentSeatSubscriptions(client, organizationId);
  const grouped = new Map<string, { moduleId: string; moduleCode: string; moduleName: string; limits: number[]; hasUnlimited: boolean }>();
  for (const subscription of subscriptions) {
    const entry = grouped.get(subscription.moduleId) ?? { moduleId: subscription.moduleId, moduleCode: subscription.module.code, moduleName: subscription.module.name, limits: [], hasUnlimited: false };
    if (subscription.seatLimit == null) entry.hasUnlimited = true;
    else entry.limits.push(subscription.seatLimit);
    grouped.set(subscription.moduleId, entry);
  }
  return Promise.all([...grouped.values()].map(async (entry) => ({
    moduleId: entry.moduleId,
    moduleCode: entry.moduleCode,
    moduleName: entry.moduleName,
    used: await countModuleMembers(client, organizationId, entry.moduleCode, excludeMembershipId),
    limit: entry.hasUnlimited ? null : entry.limits.length ? Math.max(...entry.limits) : null,
  })));
}

export async function assertRoleHasAvailableSeats(
  tx: Prisma.TransactionClient,
  organizationId: string,
  roleId: string,
  excludeMembershipId?: string,
) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`module-seats:${organizationId}`}))`;
  const role = await tx.role.findFirst({
    where: { id: roleId, OR: [{ organizationId }, { isSystem: true }] },
    include: { rolePermissions: { include: { permission: true } } },
  });
  if (!role) throw new Error("Role not found.");
  const keys = role.rolePermissions.map((entry) => entry.permission.key);
  const usage = await getOrganizationSeatUsage(organizationId, tx, excludeMembershipId);
  const exceeded = usage.filter((module) => module.limit != null && keys.some((key) => key.startsWith(permissionPrefix(module.moduleCode))) && module.used >= module.limit);
  if (exceeded.length) throw new SeatLimitExceededError(exceeded);
}

export async function updateSubscriptionSeatLimit(input: { subscriptionId: string; seatLimit: number | null; actorId: string }) {
  if (input.seatLimit != null && (!Number.isInteger(input.seatLimit) || input.seatLimit < 1 || input.seatLimit > 100_000)) {
    throw new Error("Seat limit must be between 1 and 100,000.");
  }
  return db.$transaction(async (tx) => {
    const subscription = await tx.subscription.findUnique({ where: { id: input.subscriptionId }, include: { module: true } });
    if (!subscription) throw new Error("Subscription not found.");
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`module-seats:${subscription.organizationId}`}))`;
    if (input.seatLimit != null) {
      const used = await countModuleMembers(tx, subscription.organizationId, subscription.module.code);
      if (input.seatLimit < used) throw new SeatLimitExceededError([{ moduleId: subscription.moduleId, moduleCode: subscription.module.code, moduleName: subscription.module.name, used, limit: input.seatLimit }]);
    }
    const updated = await tx.subscription.update({ where: { id: subscription.id }, data: { seatLimit: input.seatLimit } });
    await logAuditEvent({
      organizationId: subscription.organizationId,
      userId: input.actorId,
      module: "platform",
      action: "subscription.seat_limit_updated",
      entityName: "Subscription",
      entityId: subscription.id,
      metadata: { previousSeatLimit: subscription.seatLimit, seatLimit: input.seatLimit, moduleId: subscription.moduleId },
    }, tx);
    return updated;
  });
}
