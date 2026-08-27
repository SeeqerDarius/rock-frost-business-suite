import type { Prisma } from "@prisma/client";

/**
 * Every monetary amount in the product should render through this, so a
 * figure is never shown as a bare number with no currency attached.
 * Defaults to GHS - the currency every module already assumes elsewhere
 * (the pricing catalogue, mNotify's market, School's own pre-existing
 * formatter) - when a caller has no organization currency in hand, matching
 * Organization.currency's effective default in practice across the app.
 */
export function formatMoney(value: Prisma.Decimal | number | string | null | undefined, currencyCode?: string | null): string {
  const amount = Number(value ?? 0);
  const code = currencyCode?.trim() || "GHS";
  try {
    return new Intl.NumberFormat("en-GH", { style: "currency", currency: code }).format(amount);
  } catch {
    return new Intl.NumberFormat("en-GH", { style: "currency", currency: "GHS" }).format(amount);
  }
}
