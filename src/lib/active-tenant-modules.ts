import "server-only";

import { db } from "@/lib/db";
import { expandProductModuleKeys } from "@/platform/modules/product-groups";

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
  if (subscriptions.length === 0) return expandProductModuleKeys(fallbackKeys);
  return expandProductModuleKeys(subscriptions.map(({ module }) => module.code));
}
