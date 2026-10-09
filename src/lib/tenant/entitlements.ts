import "server-only";

import { db } from "@/lib/db";
import { expandProductModuleKeys, primaryProductKey } from "@/platform/modules/product-groups";

export const ACTIVE_ORGANIZATION_STATUSES = new Set(["ACTIVE", "TRIAL"]);

/**
 * Module keys an organization is currently entitled to: operator-enabled
 * modules, except those governed by a subscription that is not paid and
 * current. Shared by the session tenant and by scheduled jobs that act for
 * an organization without a signed-in user.
 */
export async function entitledModuleKeysForOrganization(organizationId: string): Promise<string[]> {
  const [enabledModules, subscriptionModules, activeSubscriptions] = await Promise.all([
    db.organizationModule.findMany({
      where: { organizationId, enabled: true, module: { status: "ACTIVE" } },
      include: { module: true },
    }),
    // A CANCELLED subscription is deliberately excluded from gating: once an
    // agreement is cancelled, an operator re-enabling the module directly
    // (OrganizationModule.enabled) is a real, current decision that must not
    // be permanently overridden by a defunct record. PENDING_PAYMENT,
    // PAST_DUE, DRAFT, and EXPIRED still gate access - those represent an
    // agreement that is unpaid, lapsed, or still awaiting action, not one
    // the platform has closed out.
    db.subscription.findMany({
      where: { organizationId, status: { not: "CANCELLED" } },
      select: { moduleId: true, entitledModuleKeys: true, module: { select: { code: true } } },
      distinct: ["moduleId"],
    }),
    db.subscription.findMany({
      where: {
        organizationId,
        status: "ACTIVE",
        startsAt: { lte: new Date() },
        endsAt: { gt: new Date() },
      },
      select: { moduleId: true, entitledModuleKeys: true, module: { select: { code: true } } },
    }),
  ]);

  const subscriptionProductKey = (item: { moduleId: string; module?: { code: string } }) =>
    primaryProductKey(item.module?.code ?? enabledModules.find((assignment) => assignment.moduleId === item.moduleId)?.module.code ?? item.moduleId);
  const subscriptionControlled = new Set(subscriptionModules.flatMap((item) =>
    item.entitledModuleKeys?.length ? item.entitledModuleKeys.map(primaryProductKey) : [subscriptionProductKey(item)]));
  const paidAndCurrent = new Set(activeSubscriptions.flatMap((item) =>
    item.entitledModuleKeys?.length ? item.entitledModuleKeys.map(primaryProductKey) : [subscriptionProductKey(item)]));
  return expandProductModuleKeys(enabledModules
    .filter((om) => {
      const productKey = primaryProductKey(om.module.code);
      return !subscriptionControlled.has(productKey) || paidAndCurrent.has(productKey);
    })
    .map((om) => om.module.code));
}
