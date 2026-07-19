import "server-only";

import { db } from "@/lib/db";

/** Returns the org's Hire Purchase settings row, creating it with defaults on first access. */
export async function getHirePurchaseSettings(organizationId: string) {
  const existing = await db.hirePurchaseSettings.findUnique({ where: { organizationId } });
  if (existing) return existing;

  return db.hirePurchaseSettings.create({ data: { organizationId } });
}

function toNumber(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === "number") return value;
  return Number(value as { toString(): string });
}

export async function getRefundDeductionRate(organizationId: string): Promise<number> {
  const settings = await getHirePurchaseSettings(organizationId);
  return Math.min(Math.max(toNumber(settings.refundDeductionPercent), 0), 100) / 100;
}

export async function getProcurementThresholdRate(organizationId: string): Promise<number> {
  const settings = await getHirePurchaseSettings(organizationId);
  return Math.min(Math.max(toNumber(settings.procurementThresholdPercent), 0), 100) / 100;
}

export async function getArchiveAfterDeliveryDays(organizationId: string): Promise<number> {
  const settings = await getHirePurchaseSettings(organizationId);
  return Math.max(Math.trunc(settings.deliveryTimeAfterCompletionDays), 0);
}

export { toNumber as settingsNumber };
