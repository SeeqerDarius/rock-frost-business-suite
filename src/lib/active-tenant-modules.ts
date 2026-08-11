import "server-only";

import { db } from "@/lib/db";

export async function resolveActiveTenantModuleKeys(organizationId: string, fallbackKeys: string[]) {
  const now = new Date();
  const subscriptions = await db.subscription.findMany({
    where: {
      organizationId,
      status: "ACTIVE",
      startsAt: { lte: now },
      endsAt: { gt: now },
    },
    select: { module: { select: { code: true } } },
  });
  if (subscriptions.length === 0) return fallbackKeys;
  return [...new Set(subscriptions.map(({ module }) => module.code))];
}
